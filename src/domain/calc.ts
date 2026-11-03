import { CASH, type AppState, type Order, type OrderItem, type Shift } from './types';

export const IVA = 0.19;

export function itemTotal(i: OrderItem): number {
  return i.unitPrice * i.qty;
}

export function subtotal(o: Pick<Order, 'items'>): number {
  return o.items.reduce((s, i) => s + itemTotal(i), 0);
}

export function discountAmount(o: Pick<Order, 'items' | 'discount'>): number {
  const sub = subtotal(o);
  if (!o.discount || o.discount.value <= 0) return 0;
  const d =
    o.discount.kind === 'porcentaje'
      ? Math.round((sub * Math.min(o.discount.value, 100)) / 100)
      : Math.round(o.discount.value);
  return Math.min(d, sub);
}

/** Total de la venta (IVA incluido), sin propina ni redondeo. */
export function saleTotal(o: Pick<Order, 'items' | 'discount'>): number {
  return subtotal(o) - discountAmount(o);
}

/** Lo que el cliente debe pagar: venta + propina + redondeo. */
export function amountDue(o: Pick<Order, 'items' | 'discount' | 'tip' | 'rounding'>): number {
  return saleTotal(o) + o.tip + o.rounding;
}

export function netAndTax(total: number): { neto: number; iva: number } {
  const neto = Math.round(total / (1 + IVA));
  return { neto, iva: total - neto };
}

/**
 * Ley de redondeo (Chile): en pagos en efectivo, montos terminados en 1 a 5
 * se redondean hacia abajo y de 6 a 9 hacia arriba, a la decena.
 */
export function roundCash(amount: number): number {
  const r = amount % 10;
  if (r === 0) return amount;
  return r <= 5 ? amount - r : amount + (10 - r);
}

export function suggestedTip(o: Pick<Order, 'items' | 'discount'>, percent: number): number {
  return Math.round((saleTotal(o) * percent) / 100);
}

export function paidSoFar(o: Pick<Order, 'payments'>): number {
  return o.payments.reduce((s, p) => s + p.amount, 0);
}

export function cashOfOrder(o: Order): number {
  return o.payments.filter((p) => p.method === CASH).reduce((s, p) => s + p.amount, 0);
}

export function shiftOrders(state: AppState, shift: Shift): Order[] {
  return state.orders.filter((o) => o.shiftId === shift.id && o.status === 'pagado');
}

export function expectedCash(state: AppState, shift: Shift): number {
  const sales = shiftOrders(state, shift).reduce((s, o) => s + cashOfOrder(o), 0);
  const mov = shift.movements.reduce((s, m) => s + (m.kind === 'ingreso' ? m.amount : -m.amount), 0);
  return shift.openingCash + sales + mov;
}

export interface Report {
  orders: number;
  total: number;
  neto: number;
  iva: number;
  discounts: number;
  tips: number;
  avgTicket: number;
  byMethod: { method: string; amount: number }[];
  byUser: { user: string; orders: number; total: number }[];
  products: { name: string; qty: number; total: number; category: string }[];
  categories: { name: string; qty: number; total: number }[];
  voided: { count: number; total: number };
  byDay: { day: string; orders: number; total: number }[];
}

export function dayKey(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function buildReport(state: AppState, from: Date, to: Date): Report {
  const inRange = (iso?: string) => !!iso && new Date(iso) >= from && new Date(iso) < to;
  const paid = state.orders.filter((o) => o.status === 'pagado' && inRange(o.paidAt));
  const voided = state.orders.filter((o) => o.status === 'anulado' && inRange(o.voidedAt));
  const userName = (id: string) => state.users.find((u) => u.id === id)?.name ?? '¿?';
  const productCat = (pid: string) => {
    const p = state.products.find((x) => x.id === pid);
    return state.categories.find((c) => c.id === p?.categoryId)?.name ?? 'Sin categoría';
  };

  const total = paid.reduce((s, o) => s + saleTotal(o), 0);
  const { neto, iva } = netAndTax(total);
  const methods = new Map<string, number>();
  const users = new Map<string, { orders: number; total: number }>();
  const prods = new Map<string, { name: string; qty: number; total: number; category: string }>();
  const cats = new Map<string, { qty: number; total: number }>();
  const days = new Map<string, { orders: number; total: number }>();

  for (const o of paid) {
    for (const p of o.payments) methods.set(p.method, (methods.get(p.method) ?? 0) + p.amount);
    const u = users.get(o.paidBy ?? o.createdBy) ?? { orders: 0, total: 0 };
    u.orders++;
    u.total += saleTotal(o);
    users.set(o.paidBy ?? o.createdBy, u);
    const dk = dayKey(o.paidAt!);
    const d = days.get(dk) ?? { orders: 0, total: 0 };
    d.orders++;
    d.total += saleTotal(o);
    days.set(dk, d);
    // Reparte el descuento del pedido proporcionalmente entre sus productos.
    const sub = subtotal(o);
    const factor = sub > 0 ? saleTotal(o) / sub : 0;
    for (const i of o.items) {
      const key = `${i.productId}|${i.variant ?? ''}`;
      const label = i.variant ? `${i.name} (${i.variant})` : i.name;
      const cat = productCat(i.productId);
      const p = prods.get(key) ?? { name: label, qty: 0, total: 0, category: cat };
      p.qty += i.qty;
      p.total += Math.round(itemTotal(i) * factor);
      prods.set(key, p);
      const c = cats.get(cat) ?? { qty: 0, total: 0 };
      c.qty += i.qty;
      c.total += Math.round(itemTotal(i) * factor);
      cats.set(cat, c);
    }
  }

  return {
    orders: paid.length,
    total,
    neto,
    iva,
    discounts: paid.reduce((s, o) => s + discountAmount(o), 0),
    tips: paid.reduce((s, o) => s + o.tip, 0),
    avgTicket: paid.length ? Math.round(total / paid.length) : 0,
    byMethod: [...methods].map(([method, amount]) => ({ method, amount })).sort((a, b) => b.amount - a.amount),
    byUser: [...users].map(([id, v]) => ({ user: userName(id), ...v })).sort((a, b) => b.total - a.total),
    products: [...prods.values()].sort((a, b) => b.qty - a.qty || b.total - a.total),
    categories: [...cats].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.total - a.total),
    voided: { count: voided.length, total: voided.reduce((s, o) => s + saleTotal(o), 0) },
    byDay: [...days].map(([day, v]) => ({ day, ...v })).sort((a, b) => a.day.localeCompare(b.day)),
  };
}

export const clp = (n: number) =>
  '$' + Math.round(n).toLocaleString('es-CL', { maximumFractionDigits: 0 });
