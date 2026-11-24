/**
 * Lectura y escritura del Excel del contador. ExcelJS se carga solo cuando se usa.
 * Al agregar filas a un archivo existente se escriben únicamente las 9 columnas del contador:
 * el resto de las celdas, hojas y fórmulas quedan como estaban.
 */
import type { Cell, Workbook, Worksheet } from 'exceljs';
import { LEDGER_COLUMNS, mapHeader, parseAmount, parseDate, rowKey, withoutDuplicates } from './domain/ledger';
import type { LedgerRow } from './domain/types';

type Col = (typeof LEDGER_COLUMNS)[number];
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function lib() {
  const m = await import('exceljs');
  return (m as unknown as { default?: typeof m }).default ?? m;
}

const toDate = (day: string) => new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)));
const text = (c: Cell) => {
  const v = c.value as unknown;
  if (v && typeof v === 'object' && 'richText' in v) return (v as { richText: { text: string }[] }).richText.map((x) => x.text).join('');
  if (v && typeof v === 'object' && 'result' in v) return String((v as { result: unknown }).result ?? '');
  return v == null ? '' : String(v);
};
const raw = (c: Cell) => {
  const v = c.value as unknown;
  return v && typeof v === 'object' && 'result' in v ? (v as { result: unknown }).result : v;
};

function findTable(wb: Workbook): { ws: Worksheet; headerRow: number; cols: Partial<Record<Col, number>> } | null {
  for (const ws of wb.worksheets) {
    const limit = Math.min(ws.rowCount, 30);
    for (let r = 1; r <= limit; r++) {
      const row = ws.getRow(r);
      const cells: string[] = [];
      for (let c = 1; c <= Math.max(row.cellCount, 12); c++) cells[c - 1] = text(row.getCell(c));
      const cols = mapHeader(cells);
      if (cols) return { ws, headerRow: r, cols };
    }
  }
  return null;
}

function readRows(ws: Worksheet, headerRow: number, cols: Partial<Record<Col, number>>): { rows: Omit<LedgerRow, 'id'>[]; last: number } {
  const rows: Omit<LedgerRow, 'id'>[] = [];
  let last = headerRow;
  const get = (r: number, col: Col) => (cols[col] ? ws.getRow(r).getCell(cols[col]!) : null);
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const date = parseDate(raw(get(r, 'Fecha')!));
    const desc = get(r, 'Descripción / Concepto') ? text(get(r, 'Descripción / Concepto')!).trim() : '';
    const income = get(r, 'Ingreso ($)') ? parseAmount(get(r, 'Ingreso ($)')!.value) : 0;
    const expense = get(r, 'Gasto ($)') ? parseAmount(get(r, 'Gasto ($)')!.value) : 0;
    if (!date && !desc) continue;
    last = r;
    if (!date || (!income && !expense)) continue;
    rows.push({
      date,
      tipo: get(r, 'Tipo') ? text(get(r, 'Tipo')!) : income ? 'Ingreso' : 'Gasto',
      description: desc,
      category: get(r, 'Categoría') ? text(get(r, 'Categoría')!) : '',
      method: get(r, 'Método de Pago') ? text(get(r, 'Método de Pago')!) : '',
      income,
      expense,
      doc: get(r, 'Documento / Respaldo') ? text(get(r, 'Documento / Respaldo')!) : '',
      notes: get(r, 'Notas') ? text(get(r, 'Notas')!) : '',
    });
  }
  return { rows, last };
}

/** Lee el historial de un Excel con la estructura del contador. */
export async function readLedgerFile(file: File): Promise<{ rows: Omit<LedgerRow, 'id'>[]; sheet: string }> {
  const ExcelJS = await lib();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const t = findTable(wb);
  if (!t) throw new Error('No encontré las columnas Fecha, Descripción e Ingreso/Gasto en el archivo');
  return { rows: readRows(t.ws, t.headerRow, t.cols).rows, sheet: t.ws.name };
}

function put(ws: Worksheet, r: number, cols: Partial<Record<Col, number>>, row: LedgerRow, styleFrom?: number) {
  const values: Record<Col, unknown> = {
    Fecha: toDate(row.date),
    Tipo: row.tipo,
    'Descripción / Concepto': row.description,
    Categoría: row.category,
    'Método de Pago': row.method,
    'Ingreso ($)': row.income || null,
    'Gasto ($)': row.expense || null,
    'Documento / Respaldo': row.doc,
    Notas: row.notes,
  };
  for (const col of LEDGER_COLUMNS) {
    const c = cols[col];
    if (!c) continue;
    const cell = ws.getRow(r).getCell(c);
    // No pisa una fórmula que ya esté en la celda.
    if (cell.formula) continue;
    if (styleFrom) cell.style = { ...ws.getRow(styleFrom).getCell(c).style };
    cell.value = values[col] as Cell['value'];
    if (col === 'Fecha' && !cell.numFmt) cell.numFmt = 'dd-mm-yyyy';
    if ((col === 'Ingreso ($)' || col === 'Gasto ($)') && !cell.numFmt) cell.numFmt = '"$"#,##0';
  }
}

async function toBlob(wb: Workbook) {
  return new Blob([await wb.xlsx.writeBuffer()], { type: XLSX });
}

/** Excel nuevo con las columnas del contador. */
export async function newLedgerFile(rows: LedgerRow[]): Promise<Blob> {
  const ExcelJS = await lib();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Control Gastos');
  ws.addRow([...LEDGER_COLUMNS]);
  ws.getRow(1).font = { bold: true };
  ws.columns = [12, 10, 40, 38, 16, 14, 14, 26, 30].map((width) => ({ width }));
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  const cols = Object.fromEntries(LEDGER_COLUMNS.map((c, i) => [c, i + 1])) as Record<Col, number>;
  rows.forEach((row, i) => put(ws, i + 2, cols, row));
  return toBlob(wb);
}

/** Agrega al Excel original solo los movimientos que no están, sin tocar fórmulas ni otras hojas. */
export async function appendToLedgerFile(file: File, rows: LedgerRow[]): Promise<{ blob: Blob; added: number; skipped: number; sheet: string }> {
  const ExcelJS = await lib();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const t = findTable(wb);
  if (!t) throw new Error('No encontré las columnas del contador (Fecha, Descripción / Concepto, Ingreso, Gasto)');
  const { rows: existing, last } = readRows(t.ws, t.headerRow, t.cols);
  const fresh = withoutDuplicates(rows, existing);
  fresh.forEach((row, i) => put(t.ws, last + 1 + i, t.cols, row, last > t.headerRow ? last : undefined));
  return { blob: await toBlob(wb), added: fresh.length, skipped: rows.length - fresh.length, sheet: t.ws.name };
}

export { rowKey };
