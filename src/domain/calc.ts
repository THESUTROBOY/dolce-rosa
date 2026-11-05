import type { Account, AppState, Line, Product, Turno } from './types';

export const IVA = 0.19;

export const lineTotal = (l: Line) => l.unitPrice * l.qty;

export const accountTotal = (a: Pick<Account, 'lines'>) => a.lines.reduce((s, l) => s + lineTotal(l), 0);

/** Total que paga el cliente: consumo + propina. */
export const accountDue = (a: Pick<Account, 'lines' | 'tip'>) => accountTotal(a) + a.tip;

export function netAndTax(total: number) {
  const neto = Math.round(total / (1 + IVA));
  return { neto, iva: total - neto };
}

export const suggestedTip = (total: number, percent: number) => Math.round((total * percent) / 100 / 10) * 10;

/** Bolas de helado que lleva un producto con los extras elegidos. */
export function scoopsFor(p: Product, extras: string[]): number {
  return (p.scoops ?? 0) + extras.filter((e) => /bola de helado/i.test(e)).length;
}

/** La cuenta ocupa la mesa mientras está abierta o emitida sin cobrar. */
export function occupiesTable(a: Account): boolean {
  return a.status === 'abierta' || (a.status === 'emitida' && !a.paidAt);
}
export const isPending = (a: Account) => a.status === 'emitida' && !a.paidAt;

/** ID del detalle de cuenta con seis dígitos, ej. 000124. */
export function folioLabel(folio?: number): string {
  return folio ? String(folio).padStart(6, '0') : '—';
}

export function dayKey(d: Date | string): string {
  const x = typeof d === 'string' ? new Date(d) : d;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
}

export function turnoOf(d: Date | string, afternoonStartsAt: number): Turno {
  const x = typeof d === 'string' ? new Date(d) : d;
  return x.getHours() < afternoonStartsAt ? 'mañana' : 'tarde';
}

export const clp = (n: number) => '$' + Math.round(n).toLocaleString('es-CL', { maximumFractionDigits: 0 });

export interface Summary {
  count: number;
  total: number;
  neto: number;
  iva: number;
  tips: number;
  avg: number;
  byMethod: { method: string; amount: number; count: number }[];
  byTurno: { turno: Turno; count: number; total: number }[];
  byStation: { station: string; qty: number; total: number }[];
  products: { name: string; qty: number; total: number }[];
  byDay: { day: string; total: number; count: number }[];
  voided: number;
  unchecked: number;
  pending: number;
}

/** Resume las cuentas emitidas en un rango de días [from, to] (YYYY-MM-DD) y, opcional, un turno. */
export function summarize(state: AppState, from: string, to: string, turno?: Turno): Summary {
  const inRange = (a: Account) => !!a.day && a.day >= from && a.day <= to && (!turno || a.turno === turno);
  const emitted = state.accounts.filter((a) => a.status === 'emitida' && inRange(a));
  const voided = state.accounts.filter((a) => a.status === 'anulada' && inRange(a)).length;
  const total = emitted.reduce((s, a) => s + accountTotal(a), 0);
  const methods = new Map<string, { amount: number; count: number }>();
  const turnos = new Map<Turno, { count: number; total: number }>();
  const stations = new Map<string, { qty: number; total: number }>();
  const prods = new Map<string, { name: string; qty: number; total: number }>();
  const days = new Map<string, { total: number; count: number }>();
  for (const a of emitted) {
    const m = a.paidAt ? (a.paymentMethod ?? 'Sin indicar') : 'Por cobrar';
    const mm = methods.get(m) ?? { amount: 0, count: 0 };
    mm.amount += accountDue(a);
    mm.count++;
    methods.set(m, mm);
    const t = turnos.get(a.turno!) ?? { count: 0, total: 0 };
    t.count++;
    t.total += accountTotal(a);
    turnos.set(a.turno!, t);
    const d = days.get(a.day!) ?? { total: 0, count: 0 };
    d.total += accountTotal(a);
    d.count++;
    days.set(a.day!, d);
    for (const l of a.lines) {
      const st = stations.get(l.station) ?? { qty: 0, total: 0 };
      st.qty += l.qty;
      st.total += lineTotal(l);
      stations.set(l.station, st);
      const key = `${l.productId}|${l.variant ?? ''}`;
      const p = prods.get(key) ?? { name: l.variant ? `${l.name} (${l.variant})` : l.name, qty: 0, total: 0 };
      p.qty += l.qty;
      p.total += lineTotal(l);
      prods.set(key, p);
    }
  }
  return {
    count: emitted.length,
    total,
    ...netAndTax(total),
    tips: emitted.reduce((s, a) => s + a.tip, 0),
    avg: emitted.length ? Math.round(total / emitted.length) : 0,
    byMethod: [...methods].map(([method, v]) => ({ method, ...v })).sort((a, b) => b.amount - a.amount),
    byTurno: (['mañana', 'tarde'] as Turno[]).map((t) => ({ turno: t, ...(turnos.get(t) ?? { count: 0, total: 0 }) })),
    byStation: [...stations].map(([station, v]) => ({ station, ...v })),
    products: [...prods.values()].sort((a, b) => b.qty - a.qty || b.total - a.total),
    byDay: [...days].map(([day, v]) => ({ day, ...v })).sort((a, b) => a.day.localeCompare(b.day)),
    voided,
    unchecked: emitted.filter((a) => a.paidAt && !a.checked).length,
    pending: emitted.filter((a) => !a.paidAt).length,
  };
}
