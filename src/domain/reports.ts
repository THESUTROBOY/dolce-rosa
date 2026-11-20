import { addDays, weekOf } from './calc';
import { costGroup, type CostGroup } from './defaults';
import { movementEffect, sales } from './money';
import type { AppState, PayMethod, Turno } from './types';
import { PAY_METHODS } from './types';

export type Bucket = 'dia' | 'semana' | 'mes';

export interface PeriodReport {
  from: string;
  to: string;
  sales: number;
  subtotal: number;
  discounts: number;
  /** Ventas sin propina (con descuentos). */
  income: number;
  /** Ventas anteriores a la app, importadas del Excel. */
  importedIncome: number;
  tips: number;
  fees: number;
  net: number;
  avgTicket: number;
  units: number;
  products: { name: string; qty: number; total: number }[];
  byMethod: { method: PayMethod; amount: number; count: number }[];
  byTurno: { turno: Turno; count: number; total: number }[];
  expenses: number;
  byGroup: Record<CostGroup, number>;
  byCategory: { category: string; amount: number }[];
  /** Ventas − comisiones − gastos. Sin propinas, préstamos ni traspasos. */
  operating: number;
  /** Plata que entró y salió de verdad (incluye propinas, préstamos, aportes). */
  cashIn: number;
  cashOut: number;
  cashFlow: { label: string; amount: number }[];
  series: { key: string; income: number; expenses: number }[];
  bucket: Bucket;
}

export function bucketFor(from: string, to: string): Bucket {
  const days = Math.round((new Date(to + 'T12:00').getTime() - new Date(from + 'T12:00').getTime()) / 86400000) + 1;
  return days <= 31 ? 'dia' : days <= 120 ? 'semana' : 'mes';
}

const bucketKey = (day: string, b: Bucket) => (b === 'dia' ? day : b === 'semana' ? weekOf(day) : day.slice(0, 7));

export function periodReport(state: AppState, from: string, to: string): PeriodReport {
  const bucket = bucketFor(from, to);
  const keys: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const k = bucketKey(d, bucket);
    if (keys.at(-1) !== k) keys.push(k);
  }
  const series = new Map(keys.map((k) => [k, { key: k, income: 0, expenses: 0 }]));
  const inRange = (d: string) => d >= from && d <= to;
  const ss = sales(state).filter((s) => inRange(s.day));
  const prods = new Map<string, { name: string; qty: number; total: number }>();
  const methods = new Map<PayMethod, { amount: number; count: number }>(PAY_METHODS.map((m) => [m, { amount: 0, count: 0 }]));
  const turnos = new Map<Turno, { count: number; total: number }>([
    ['mañana', { count: 0, total: 0 }],
    ['tarde', { count: 0, total: 0 }],
  ]);
  for (const s of ss) {
    series.get(bucketKey(s.day, bucket))!.income += s.consumo;
    const t = turnos.get(s.turno)!;
    t.count++;
    t.total += s.consumo;
    for (const p of s.payments) {
      const m = methods.get(p.method)!;
      m.amount += p.amount;
      m.count++;
    }
    for (const l of s.account.lines) {
      const key = `${l.productId}|${l.variant ?? ''}`;
      const p = prods.get(key) ?? { name: l.variant ? `${l.name} (${l.variant})` : l.name, qty: 0, total: 0 };
      p.qty += l.qty;
      p.total += l.unitPrice * l.qty;
      prods.set(key, p);
    }
  }
  const byGroup: Record<CostGroup, number> = { fijo: 0, variable: 0, extraordinario: 0 };
  const cats = new Map<string, number>();
  let expenses = 0;
  const addExpense = (day: string, category: string, amount: number) => {
    expenses += amount;
    byGroup[costGroup(category)] += amount;
    cats.set(category, (cats.get(category) ?? 0) + amount);
    series.get(bucketKey(day, bucket))!.expenses += amount;
  };
  for (const e of state.expenses) if (!e.voided && inRange(e.date)) addExpense(e.date, e.category, e.amount);
  let importedIncome = 0;
  for (const r of state.ledgerHistory) {
    if (!inRange(r.date)) continue;
    if (r.expense) addExpense(r.date, r.category || 'Sin categoría', r.expense);
    if (r.income) {
      importedIncome += r.income;
      series.get(bucketKey(r.date, bucket))!.income += r.income;
    }
  }
  const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);
  const income = sum(ss, (s) => s.consumo);
  const fees = sum(ss, (s) => s.fee);
  const tips = sum(ss, (s) => s.tip);
  // Flujo de caja: lo que entra y sale de verdad por los fondos.
  const loansIn = sum(
    state.movements.filter((m) => !m.voided && inRange(m.date) && (m.kind === 'prestamo_recibido' || m.kind === 'cobro_prestamo')),
    (m) => m.amount,
  );
  const capital = sum(
    state.movements.filter((m) => !m.voided && inRange(m.date) && m.kind === 'aporte'),
    (m) => m.amount,
  );
  const loansOut = sum(
    state.movements.filter((m) => !m.voided && inRange(m.date) && (m.kind === 'prestamo_entregado' || m.kind === 'pago_prestamo')),
    (m) => m.amount,
  );
  const withdrawals = sum(
    state.movements.filter((m) => !m.voided && inRange(m.date) && m.kind === 'retiro'),
    (m) => m.amount,
  );
  const adjustments = sum(
    state.movements.filter((m) => !m.voided && inRange(m.date) && m.kind === 'ajuste'),
    (m) => Object.values(movementEffect(m)).reduce((a, b) => a + (b ?? 0), 0),
  );
  const tipsPaid = sum(
    state.tipPayouts.filter((p) => !p.voided && inRange(p.date)),
    (p) => p.amount,
  );
  const appExpenses = sum(
    state.expenses.filter((e) => !e.voided && inRange(e.date)),
    (e) => e.amount,
  );
  const cashFlow = [
    { label: 'Cobros de ventas (con propina, sin comisión)', amount: income + tips - fees },
    { label: 'Préstamos recibidos y devueltos', amount: loansIn },
    { label: 'Aportes de capital', amount: capital },
    { label: 'Gastos pagados', amount: -appExpenses },
    { label: 'Propinas entregadas', amount: -tipsPaid },
    { label: 'Préstamos entregados y pagados', amount: -loansOut },
    { label: 'Retiros de socios', amount: -withdrawals },
    { label: 'Ajustes por cuadratura', amount: adjustments },
  ].filter((x) => x.amount !== 0);
  return {
    from,
    to,
    sales: ss.length,
    subtotal: sum(ss, (s) => s.subtotal),
    discounts: sum(ss, (s) => s.discount),
    income,
    importedIncome,
    tips,
    fees,
    net: income - fees,
    avgTicket: ss.length ? Math.round(income / ss.length) : 0,
    units: [...prods.values()].reduce((a, p) => a + p.qty, 0),
    products: [...prods.values()].sort((a, b) => b.qty - a.qty || b.total - a.total),
    byMethod: [...methods].map(([method, v]) => ({ method, ...v })),
    byTurno: [...turnos].map(([turno, v]) => ({ turno, ...v })),
    expenses,
    byGroup,
    byCategory: [...cats].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
    operating: income + importedIncome - fees - expenses,
    cashIn: cashFlow.filter((x) => x.amount > 0).reduce((a, x) => a + x.amount, 0),
    cashOut: -cashFlow.filter((x) => x.amount < 0).reduce((a, x) => a + x.amount, 0),
    cashFlow,
    series: [...series.values()],
    bucket,
  };
}

/** Variación porcentual, o null si no hay base para comparar. */
export const change = (cur: number, prev: number) => (prev ? Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10 : null);
