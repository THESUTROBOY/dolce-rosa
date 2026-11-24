import { fmtDay } from './calc';
import { sales } from './money';
import type { AppState, LedgerRow, PayMethod } from './types';
import { PAY_LABEL, PAY_METHODS } from './types';

/** Columnas exactas del Excel del contador «Control Gastos JJA SPA». */
export const LEDGER_COLUMNS = ['Fecha', 'Tipo', 'Descripción / Concepto', 'Categoría', 'Método de Pago', 'Ingreso ($)', 'Gasto ($)', 'Documento / Respaldo', 'Notas'] as const;

export const INCOME_TIPO = 'Ingreso';
export const EXPENSE_TIPO = 'Gasto';
export const SALES_CATEGORY = 'Ventas';
export const FEE_CATEGORY = 'Costo Variable - Comisiones e Impuestos';

/** Clave para no duplicar: misma fecha, concepto y montos = mismo movimiento. */
export const rowKey = (r: Pick<LedgerRow, 'date' | 'description' | 'income' | 'expense'>) =>
  [r.date, norm(r.description), Math.round(r.income || 0), Math.round(r.expense || 0)].join('|');
const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Filas para el contador a partir de la app:
 * ventas sin propina agrupadas por día y medio de pago, comisiones del día y cada gasto.
 * Las propinas no son ingresos de la cafetería y no se exportan como venta.
 */
export function ledgerRows(state: AppState, from: string, to: string): LedgerRow[] {
  const rows: LedgerRow[] = [];
  const byDay = new Map<string, { income: Record<PayMethod, number>; tips: Record<PayMethod, number>; folios: number[]; fees: number }>();
  for (const s of sales(state)) {
    if (s.day < from || s.day > to) continue;
    let d = byDay.get(s.day);
    if (!d) {
      d = { income: { efectivo: 0, debito: 0, credito: 0, transferencia: 0 }, tips: { efectivo: 0, debito: 0, credito: 0, transferencia: 0 }, folios: [], fees: 0 };
      byDay.set(s.day, d);
    }
    // El consumo se reparte entre los pagos según lo que cada uno pagó sin propina.
    for (const p of s.payments) {
      d.income[p.method] += p.amount - p.tip;
      d.tips[p.method] += p.tip;
    }
    d.fees += s.cafeFee;
    if (s.account.folio) d.folios.push(s.account.folio);
  }
  for (const [day, d] of [...byDay].sort((a, b) => a[0].localeCompare(b[0]))) {
    const folios = d.folios.sort((a, b) => a - b);
    const doc = folios.length ? `Detalles ${String(folios[0]).padStart(6, '0')}–${String(folios.at(-1)).padStart(6, '0')}` : '';
    for (const m of PAY_METHODS) {
      if (!d.income[m]) continue;
      rows.push({
        id: `venta-${day}-${m}`,
        date: day,
        tipo: INCOME_TIPO,
        description: `Ventas ${fmtDay(day, { day: '2-digit', month: '2-digit', year: 'numeric' })} - ${PAY_LABEL[m]}`,
        category: SALES_CATEGORY,
        method: PAY_LABEL[m],
        income: d.income[m],
        expense: 0,
        doc,
        notes: d.tips[m] ? `Sin propinas (${d.tips[m].toLocaleString('es-CL')} aparte)` : '',
      });
    }
    if (d.fees)
      rows.push({
        id: `comision-${day}`,
        date: day,
        tipo: EXPENSE_TIPO,
        description: `Comisiones Mercado Pago ${fmtDay(day, { day: '2-digit', month: '2-digit', year: 'numeric' })}`,
        category: FEE_CATEGORY,
        method: 'Mercado Pago',
        income: 0,
        expense: d.fees,
        doc: 'Liquidación Mercado Pago',
        notes: '',
      });
  }
  for (const e of state.expenses) {
    if (e.voided || e.date < from || e.date > to) continue;
    rows.push({
      id: e.id,
      date: e.date,
      tipo: EXPENSE_TIPO,
      description: e.description,
      category: e.category,
      method: e.method,
      income: 0,
      expense: e.amount,
      doc: [e.docType, e.docNumber].filter(Boolean).join(' '),
      notes: e.notes,
    });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date) || (a.income ? -1 : 1) - (b.income ? -1 : 1));
}

/** Quita las filas que ya están (por fecha, concepto y monto). */
export function withoutDuplicates(rows: LedgerRow[], existing: Pick<LedgerRow, 'date' | 'description' | 'income' | 'expense'>[]): LedgerRow[] {
  const have = new Set(existing.map(rowKey));
  return rows.filter((r) => {
    const k = rowKey(r);
    if (have.has(k)) return false;
    have.add(k);
    return true;
  });
}

const HEADER_ALIASES: Record<(typeof LEDGER_COLUMNS)[number], RegExp> = {
  Fecha: /^fecha/,
  Tipo: /^tipo/,
  'Descripción / Concepto': /^(descripcion|concepto)/,
  Categoría: /^categoria/,
  'Método de Pago': /^(metodo|medio|forma)/,
  'Ingreso ($)': /^ingreso/,
  'Gasto ($)': /^(gasto|egreso)/,
  'Documento / Respaldo': /^(documento|respaldo)/,
  Notas: /^(nota|observ)/,
};

/** Encuentra en una fila de encabezados la columna (1-based) de cada campo. */
export function mapHeader(cells: string[]): Partial<Record<(typeof LEDGER_COLUMNS)[number], number>> | null {
  const out: Partial<Record<(typeof LEDGER_COLUMNS)[number], number>> = {};
  cells.forEach((c, i) => {
    const n = norm(String(c ?? ''));
    if (!n) return;
    for (const col of LEDGER_COLUMNS) if (!out[col] && HEADER_ALIASES[col].test(n)) out[col] = i + 1;
  });
  return out.Fecha && out['Descripción / Concepto'] && (out['Ingreso ($)'] || out['Gasto ($)']) ? out : null;
}

/** Fecha de una celda: Date, número de Excel o texto dd-mm-aaaa / aaaa-mm-dd. */
export function parseDate(v: unknown): string | null {
  const p2 = (n: number) => String(n).padStart(2, '0');
  if (v instanceof Date && !isNaN(v.getTime())) return `${v.getUTCFullYear()}-${p2(v.getUTCMonth() + 1)}-${p2(v.getUTCDate())}`;
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86400000));
    return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
  }
  if (typeof v === 'string') {
    const s = v.trim();
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
    if (m) return `${m[1]}-${p2(+m[2])}-${p2(+m[3])}`;
    m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(s);
    if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${p2(+m[2])}-${p2(+m[1])}`;
  }
  return null;
}

/** Monto de una celda: número, o texto como "$12.345". */
export function parseAmount(v: unknown): number {
  if (typeof v === 'number') return Math.round(v);
  if (v && typeof v === 'object' && 'result' in v) return parseAmount((v as { result: unknown }).result);
  if (typeof v === 'string') return Math.round(Number(v.replace(/[^\d,-]/g, '').replace(',', '.')) || 0);
  return 0;
}
