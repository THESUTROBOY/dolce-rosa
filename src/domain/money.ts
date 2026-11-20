import { accountDiscount, accountSubtotal, accountTotal, addDays, dayKey, isPending, turnoOf, weekdayOf, weekOf } from './calc';
import type { Account, AppState, Fund, Movement, PayMethod, Payment, Settings, ShiftReport, TipBucket, Turno } from './types';
import { PAY_LABEL, PAY_METHODS } from './types';

// ---------------- Pagos ----------------

export const feeFor = (method: PayMethod, amount: number, s: Settings) => Math.round((amount * (s.fees?.[method] ?? 0)) / 100);

/** Arma un pago con su comisión y la fecha en que llega el abono. */
export function makePayment(method: PayMethod, amount: number, tip: number, day: string, s: Settings, received = true): Payment {
  const p: Payment = { method, amount: Math.round(amount), tip: Math.round(tip), fee: feeFor(method, amount, s) };
  if (method === 'debito' || method === 'credito') p.settleOn = addDays(day, s.settleDays?.[method] ?? 0);
  if (method === 'transferencia') p.received = received;
  return p;
}

/** Reparte la propina entre los pagos en proporción a cada monto; el último se queda con el resto. */
export function splitTip(amounts: number[], tip: number): number[] {
  const total = amounts.reduce((a, b) => a + b, 0);
  if (!total || !tip) return amounts.map(() => 0);
  let left = tip;
  return amounts.map((a, i) => {
    if (i === amounts.length - 1) return left;
    const t = Math.min(left, Math.round((tip * a) / total));
    left -= t;
    return t;
  });
}

const LEGACY: Record<string, PayMethod> = { efectivo: 'efectivo', débito: 'debito', debito: 'debito', crédito: 'credito', credito: 'credito', transferencia: 'transferencia' };

/** Pagos de una cuenta cobrada. Las cuentas antiguas solo tienen el nombre del medio. */
export function paymentsOf(a: Account): Payment[] {
  if (!a.paidAt) return [];
  if (a.payments?.length) return a.payments;
  const method = LEGACY[(a.paymentMethod ?? '').trim().toLowerCase()] ?? 'efectivo';
  return [{ method, amount: accountTotal(a) + a.tip, tip: a.tip, fee: 0, settleOn: a.payDay ?? a.day, received: true }];
}

export const methodsLabel = (ps: Payment[]) => [...new Set(ps.map((p) => PAY_LABEL[p.method]))].join(' + ');

// ---------------- Ventas ----------------

export interface Sale {
  account: Account;
  at: string;
  day: string;
  turno: Turno;
  subtotal: number;
  discount: number;
  /** Consumo: sin propina, con descuentos. */
  consumo: number;
  tip: number;
  /** Comisión total del medio de pago. */
  fee: number;
  /** Parte de la comisión que se descuenta de la propina. */
  tipFee: number;
  /** Ingreso líquido para la cafetería: consumo menos la comisión que le toca. */
  net: number;
  payments: Payment[];
}

/** Ventas cobradas (no anuladas), ordenadas por hora de pago. */
export function sales(state: AppState): Sale[] {
  const s = state.settings;
  return state.accounts
    .filter((a) => a.status === 'emitida' && a.paidAt)
    .map((a) => {
      const payments = paymentsOf(a);
      const fee = payments.reduce((x, p) => x + p.fee, 0);
      const tipFee = s.tipFeeFromTip ? payments.reduce((x, p) => x + (p.amount ? Math.round((p.fee * p.tip) / p.amount) : 0), 0) : 0;
      const consumo = accountTotal(a);
      return {
        account: a,
        at: a.paidAt!,
        day: a.payDay ?? a.day ?? dayKey(a.paidAt!),
        turno: a.payTurno ?? a.turno ?? turnoOf(a.paidAt!, s.afternoonStartsAt),
        subtotal: accountSubtotal(a),
        discount: accountDiscount(a),
        consumo,
        tip: a.tip,
        fee,
        tipFee,
        net: consumo - (fee - tipFee),
        payments,
      };
    })
    .sort((a, b) => a.at.localeCompare(b.at));
}

// ---------------- Fondos ----------------

/** Momento efectivo de un registro con fecha: la hora en que se anotó si fue ese mismo día; si no, mediodía de esa fecha. */
export function effectiveAt(date: string, createdAt: string): number {
  return dayKey(createdAt) === date ? new Date(createdAt).getTime() : new Date(date + 'T12:00').getTime();
}

/** Efecto de un movimiento en cada fondo. */
export function movementEffect(m: Movement): Partial<Record<Fund, number>> {
  switch (m.kind) {
    case 'prestamo_recibido':
    case 'cobro_prestamo':
    case 'aporte':
      return { [m.fund]: m.amount };
    case 'pago_prestamo':
    case 'prestamo_entregado':
    case 'retiro':
      return { [m.fund]: -m.amount };
    case 'traspaso':
      return m.toFund && m.toFund !== m.fund ? { [m.fund]: -m.amount, [m.toFund]: m.amount } : {};
    case 'ajuste':
      return { [m.fund]: m.amount };
  }
}

export interface Finance {
  openingCash: number;
  openingBank: number;
  cash: number;
  bank: number;
  /** Abonos de tarjeta (Mercado Pago) que aún no llegan, ya sin comisión. */
  pendingMp: number;
  pendingTransfers: number;
  /** Detalles emitidos que aún no se cobran. */
  pendingAccounts: number;
  income: number;
  fees: number;
  expenses: number;
  tipsAccrued: number;
  tipsPaid: number;
  tipsPending: number;
  tipsCash: number;
  tipsBank: number;
  lentOut: number;
  borrowed: number;
  capital: number;
  withdrawals: number;
  reserved: number;
  /** Efectivo + banco + abonos y transferencias por llegar. */
  expectedTotal: number;
  /** Lo que queda libre después de propinas por entregar y reservas. */
  free: number;
}

/** Saldos del negocio a un momento (por defecto, ahora). Cuenta desde la fecha de saldos iniciales. */
export function finance(state: AppState, until: Date = new Date()): Finance {
  const s = state.settings;
  const t = until.getTime();
  const untilDay = dayKey(until);
  const from = s.openingDate || '0000-00-00';
  const f: Finance = {
    openingCash: s.openingCash || 0,
    openingBank: s.openingBank || 0,
    cash: s.openingCash || 0,
    bank: s.openingBank || 0,
    pendingMp: 0,
    pendingTransfers: 0,
    pendingAccounts: 0,
    income: 0,
    fees: 0,
    expenses: 0,
    tipsAccrued: 0,
    tipsPaid: 0,
    tipsPending: 0,
    tipsCash: 0,
    tipsBank: 0,
    lentOut: 0,
    borrowed: 0,
    capital: 0,
    withdrawals: 0,
    reserved: state.reserves.reduce((a, r) => a + r.amount, 0),
    expectedTotal: 0,
    free: 0,
  };
  const bump = (fund: Fund, n: number) => (fund === 'efectivo' ? (f.cash += n) : (f.bank += n));
  for (const sale of sales(state)) {
    if (sale.day < from || new Date(sale.at).getTime() > t) continue;
    f.income += sale.consumo;
    f.fees += sale.fee;
    f.tipsAccrued += sale.tip - sale.tipFee;
    for (const p of sale.payments) {
      const net = p.amount - p.fee;
      if (p.method === 'efectivo') {
        f.cash += p.amount;
        f.tipsCash += p.tip;
      } else if (p.method === 'transferencia') {
        const got = p.received !== false && (!p.receivedAt || new Date(p.receivedAt).getTime() <= t);
        if (got) f.bank += net;
        else f.pendingTransfers += net;
        f.tipsBank += p.tip;
      } else {
        if ((p.settleOn ?? sale.day) <= untilDay) f.bank += net;
        else f.pendingMp += net;
        f.tipsBank += p.tip;
      }
    }
  }
  for (const e of state.expenses) {
    if (e.voided || e.date < from || effectiveAt(e.date, e.createdAt) > t) continue;
    f.expenses += e.amount;
    bump(e.fund, -e.amount);
  }
  for (const p of state.tipPayouts) {
    if (p.voided || p.date < from || effectiveAt(p.date, p.createdAt) > t) continue;
    f.tipsPaid += p.amount;
    bump(p.fund, -p.amount);
  }
  for (const m of state.movements) {
    if (m.voided || m.date < from || effectiveAt(m.date, m.createdAt) > t) continue;
    const eff = movementEffect(m);
    for (const k of Object.keys(eff) as Fund[]) bump(k, eff[k]!);
    if (m.kind === 'prestamo_entregado') f.lentOut += m.amount;
    if (m.kind === 'cobro_prestamo') f.lentOut -= m.amount;
    if (m.kind === 'prestamo_recibido') f.borrowed += m.amount;
    if (m.kind === 'pago_prestamo') f.borrowed -= m.amount;
    if (m.kind === 'aporte') f.capital += m.amount;
    if (m.kind === 'retiro') f.withdrawals += m.amount;
  }
  f.pendingAccounts = state.accounts.filter(isPending).reduce((a, x) => a + accountTotal(x), 0);
  f.tipsPending = f.tipsAccrued - f.tipsPaid;
  f.expectedTotal = f.cash + f.bank + f.pendingMp + f.pendingTransfers;
  f.free = f.cash + f.bank - f.tipsPending - f.reserved;
  return f;
}

// ---------------- Propinas ----------------

export const bucketOf = (day: string): TipBucket => {
  const w = weekdayOf(day);
  return w === 0 || w === 6 ? 'sd' : 'lv';
};

export interface TipWeek {
  week: string;
  accrued: Record<TipBucket, number>;
  paid: Record<TipBucket, number>;
  byMethod: Record<PayMethod, number>;
}

/** Propinas por semana (lunes) y bloque, con lo ya entregado. */
export function tipWeeks(state: AppState): TipWeek[] {
  const weeks = new Map<string, TipWeek>();
  const get = (week: string) => {
    let w = weeks.get(week);
    if (!w) {
      w = { week, accrued: { lv: 0, sd: 0 }, paid: { lv: 0, sd: 0 }, byMethod: { efectivo: 0, debito: 0, credito: 0, transferencia: 0 } };
      weeks.set(week, w);
    }
    return w;
  };
  for (const sale of sales(state)) {
    if (!sale.tip) continue;
    const w = get(weekOf(sale.day));
    w.accrued[bucketOf(sale.day)] += sale.tip - sale.tipFee;
    for (const p of sale.payments) w.byMethod[p.method] += p.tip;
  }
  for (const p of state.tipPayouts) {
    if (p.voided) continue;
    get(p.week).paid[p.bucket] += p.amount;
  }
  return [...weeks.values()].sort((a, b) => b.week.localeCompare(a.week));
}

// ---------------- Turnos ----------------

/** Inicio y fin (exclusivo) de un turno. */
export function shiftWindow(day: string, turno: Turno, afternoonStartsAt: number): [Date, Date] {
  const d0 = new Date(day + 'T00:00:00');
  const mid = new Date(d0);
  mid.setHours(afternoonStartsAt);
  const d1 = new Date(day + 'T00:00:00');
  d1.setDate(d1.getDate() + 1);
  return turno === 'mañana' ? [d0, mid] : [mid, d1];
}

export function shiftReport(state: AppState, day: string, turno: Turno, now = new Date()): ShiftReport {
  const [start, end0] = shiftWindow(day, turno, state.settings.afternoonStartsAt);
  const end = end0 > now ? now : end0;
  const inShift = (ms: number) => ms >= start.getTime() && ms < end0.getTime();
  const ss = sales(state).filter((x) => x.day === day && x.turno === turno);
  const byMethod = PAY_METHODS.map((method) => {
    const ps = ss.flatMap((x) => x.payments.filter((p) => p.method === method));
    return { method, count: ps.length, amount: ps.reduce((a, p) => a + p.amount, 0), tip: ps.reduce((a, p) => a + p.tip, 0), fee: ps.reduce((a, p) => a + p.fee, 0) };
  });
  const exps = state.expenses.filter((e) => !e.voided && inShift(effectiveAt(e.date, e.createdAt)));
  const outs = state.tipPayouts.filter((p) => !p.voided && inShift(effectiveAt(p.date, p.createdAt)));
  const movs = state.movements.filter((m) => !m.voided && inShift(effectiveAt(m.date, m.createdAt)));
  let movementsIn = 0;
  let movementsOut = 0;
  for (const m of movs) {
    if (m.kind === 'traspaso') continue;
    const net = Object.values(movementEffect(m)).reduce((a, b) => a + (b ?? 0), 0);
    if (net >= 0) movementsIn += net;
    else movementsOut -= net;
  }
  const fStart = finance(state, new Date(start.getTime() - 1));
  const fEnd = finance(state, end);
  return {
    sales: ss.length,
    subtotal: ss.reduce((a, x) => a + x.subtotal, 0),
    discounts: ss.reduce((a, x) => a + x.discount, 0),
    consumo: ss.reduce((a, x) => a + x.consumo, 0),
    tips: ss.reduce((a, x) => a + x.tip, 0),
    fees: ss.reduce((a, x) => a + x.fee, 0),
    net: ss.reduce((a, x) => a + x.net, 0),
    byMethod,
    expenses: (['efectivo', 'banco'] as Fund[]).map((fund) => {
      const xs = exps.filter((e) => e.fund === fund);
      return { fund, amount: xs.reduce((a, e) => a + e.amount, 0), count: xs.length };
    }),
    tipPayouts: outs.reduce((a, p) => a + p.amount, 0),
    movementsIn,
    movementsOut,
    cashStart: fStart.cash,
    cashEnd: fEnd.cash,
    bankEnd: fEnd.bank,
    pendingMp: fEnd.pendingMp,
    pendingTransfers: fEnd.pendingTransfers,
    pendingAccounts: state.accounts.filter((a) => isPending(a) && a.day === day && a.turno === turno).length,
  };
}
