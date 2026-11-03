import { roundCash, saleTotal, suggestedTip } from './calc';
import { seedState } from './seed';
import { CASH, type AppState, type Option, type Order, type Product, type OrderItem, type Payment, type Shift } from './types';

/** Generador pseudoaleatorio con semilla, para que la demo sea siempre igual. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES = ['Javiera', 'Tomás', 'Fernanda', 'Benja', 'Catalina', 'Matías', 'Isidora', 'Diego', 'Antonia', 'Vicente', 'Sofía', 'Martín'];
const NOTES = ['Sin azúcar', 'Leche sin lactosa', 'Bien caliente', 'Separar salsa', 'Con hielo', 'Para servir'];

/**
 * Estado de demostración: la carta base más 30 días de ventas cerradas,
 * un turno abierto hoy con ventas, mesas ocupadas y algunas anulaciones.
 */
export function demoState(now = new Date()): AppState {
  const r = rng(20261103);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const s = seedState();
  s.users.push(
    { id: 'user_demo_camila', name: 'Camila', role: 'cajero', pin: '1111', active: true },
    { id: 'user_demo_nico', name: 'Nico', role: 'cajero', pin: '2222', active: true },
  );
  s.settings.address = 'Av. Ejemplo 123, Santiago';
  s.settings.phone = '@dolcerosa.cafe';
  const admin = s.users[0].id;
  const cajeros = s.users.filter((u) => u.role === 'cajero').map((u) => u.id);
  const products = s.products;
  // Peso de cada producto: los cafés se venden más.
  const weighted: Product[] = products.flatMap((p) => {
    const cat = s.categories.find((c) => c.id === p.categoryId)!.name;
    const w = cat === 'Cafés' ? 5 : cat === 'Tortas y pasteles' ? 3 : cat === 'Bebidas' ? 1 : 2;
    return Array(w).fill(p);
  });

  let n = 0;
  const id = (p: string) => `${p}_demo_${++n}`;

  const makeItems = (): OrderItem[] => {
    const count = 1 + Math.floor(r() * 4);
    const items: OrderItem[] = [];
    for (let i = 0; i < count; i++) {
      const p = pick(weighted);
      const variant = p.variants.length ? pick(p.variants) : undefined;
      const extras: Option[] = p.extras.length && r() < 0.25 ? [pick(p.extras)] : [];
      const unitPrice = (variant?.price ?? p.price) + extras.reduce((a, e) => a + e.price, 0);
      items.push({
        id: id('it'),
        productId: p.id,
        name: p.name,
        variant: variant?.name,
        extras: extras.map((e) => e.name),
        unitPrice,
        qty: r() < 0.2 ? 2 : 1,
        note: r() < 0.12 ? pick(NOTES) : '',
        sentQty: 0,
      });
    }
    items.forEach((i) => (i.sentQty = i.qty));
    return items;
  };

  const pay = (o: Order, method: string): { payments: Payment[]; rounding: number } => {
    const due = saleTotal(o) + o.tip;
    if (method === 'split') {
      const card = Math.round(due / 2 / 100) * 100;
      const rest = due - card;
      const cash = roundCash(rest);
      return { payments: [{ method: 'Tarjeta débito', amount: card }, { method: CASH, amount: cash, received: cash }], rounding: cash - rest };
    }
    if (method === CASH) {
      const cash = roundCash(due);
      const received = r() < 0.5 ? cash : [5000, 10000, 20000].find((b) => b >= cash) ?? cash;
      return { payments: [{ method: CASH, amount: cash, received }], rounding: cash - due };
    }
    return { payments: [{ method, amount: due }], rounding: 0 };
  };

  const methodFor = () => {
    const x = r();
    return x < 0.3 ? CASH : x < 0.62 ? 'Tarjeta débito' : x < 0.82 ? 'Tarjeta crédito' : x < 0.95 ? 'Transferencia' : 'split';
  };

  const at = (day: Date, h: number, m: number) => {
    const d = new Date(day);
    d.setHours(h, m, Math.floor(r() * 60), 0);
    return d;
  };

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const orders: Order[] = [];
  const shifts: Shift[] = [];

  for (let back = 30; back >= 0; back--) {
    const day = new Date(today);
    day.setDate(today.getDate() - back);
    if (day.getDay() === 1 && back > 0) continue; // lunes cerrado
    const isToday = back === 0;
    const weekend = day.getDay() === 0 || day.getDay() === 6;
    const cajero = pick(cajeros);
    const shift: Shift = {
      id: id('turno'),
      openedBy: cajero,
      openedAt: at(day, 8, 45).toISOString(),
      openingCash: 30000,
      movements: [],
    };
    const lastHour = isToday ? Math.max(9, Math.min(now.getHours(), 20)) : 20;
    const count = isToday
      ? Math.max(6, Math.round((lastHour - 9) * 3.2))
      : Math.round((weekend ? 48 : 30) + r() * 12);
    const times = Array.from({ length: count }, () => {
      const h = 9 + Math.floor(r() * (lastHour - 9 + 1));
      return at(day, Math.min(h, lastHour), Math.floor(r() * 60));
    })
      .filter((t) => !isToday || t <= now)
      .sort((a, b) => a.getTime() - b.getTime());

    let cashIn = 0;
    for (const t of times) {
      const mesa = r() < 0.55;
      const o: Order = {
        id: id('ped'),
        number: 0,
        type: mesa ? 'mesa' : 'llevar',
        tableId: mesa ? pick(s.tables).id : undefined,
        customerName: !mesa && r() < 0.5 ? pick(NAMES) : '',
        status: 'pagado',
        kitchenStatus: 'entregado',
        items: makeItems(),
        discount: r() < 0.05 ? { kind: 'porcentaje', value: 10 } : undefined,
        tip: 0,
        rounding: 0,
        payments: [],
        createdBy: shift.openedBy,
        createdAt: new Date(t.getTime() - 15 * 60000).toISOString(),
        paidAt: t.toISOString(),
        paidBy: shift.openedBy,
        shiftId: shift.id,
      };
      if (mesa && r() < 0.7) o.tip = suggestedTip(o, 10);
      const { payments, rounding } = pay(o, methodFor());
      o.payments = payments;
      o.rounding = rounding;
      if (r() < 0.02) {
        o.status = 'anulado';
        o.voidReason = pick(['Cobrado dos veces', 'Error de digitación', 'Cliente no quiso el pedido']);
        o.voidedBy = admin;
        o.voidedAt = new Date(t.getTime() + 5 * 60000).toISOString();
      } else {
        cashIn += payments.filter((p) => p.method === CASH).reduce((a, p) => a + p.amount, 0);
      }
      orders.push(o);
    }

    if (r() < 0.4) {
      shift.movements.push({
        id: id('mov'),
        kind: 'retiro',
        amount: pick([4500, 8900, 12000]),
        reason: pick(['Compra de leche', 'Compra de hielo', 'Pago repartidor frutas']),
        by: shift.openedBy,
        at: at(day, 13, 10).toISOString(),
      });
    }

    if (!isToday) {
      const mov = shift.movements.reduce((a, m) => a + (m.kind === 'ingreso' ? m.amount : -m.amount), 0);
      const expected = shift.openingCash + cashIn + mov;
      const diff = r() < 0.75 ? 0 : pick([-1000, -500, 500, -2000, 100]);
      shift.closedAt = at(day, 20, 40).toISOString();
      shift.closedBy = shift.openedBy;
      shift.expectedCash = expected;
      shift.countedCash = expected + diff;
      if (diff) shift.note = diff < 0 ? 'Faltante, se revisará' : 'Sobrante';
    }
    shifts.push(shift);
  }

  // Pedidos abiertos de hoy: dos mesas y uno para llevar.
  const openShift = shifts[shifts.length - 1];
  const nowIso = (minAgo: number) => new Date(now.getTime() - minAgo * 60000).toISOString();
  const open = (type: 'mesa' | 'llevar', tableIdx: number | null, kitchen: Order['kitchenStatus'], minAgo: number, name = ''): Order => ({
    id: id('ped'),
    number: 0,
    type,
    tableId: tableIdx == null ? undefined : s.tables[tableIdx].id,
    customerName: name,
    status: 'abierto',
    kitchenStatus: kitchen,
    items: makeItems(),
    tip: 0,
    rounding: 0,
    payments: [],
    createdBy: openShift.openedBy,
    createdAt: nowIso(minAgo),
  });
  const openOrders = [open('mesa', 1, 'entregado', 35), open('mesa', 4, 'pendiente', 6), open('llevar', null, 'listo', 3, 'Javiera')];
  // Una mesa con un producto recién agregado que aún no va a cocina.
  openOrders[1].items[openOrders[1].items.length - 1].sentQty = 0;
  orders.push(...openOrders);

  orders.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  orders.forEach((o, i) => (o.number = i + 1));
  s.orders = orders;
  s.shifts = shifts;
  s.nextOrderNumber = orders.length + 1;

  // Un cambio de precio de ejemplo.
  const pie = products.find((p) => p.name === 'Pie de limón')!;
  s.priceChanges.push({
    id: id('precio'),
    productId: pie.id,
    productName: pie.name,
    before: '2990',
    after: String(pie.price),
    by: admin,
    at: new Date(today.getTime() - 12 * 86400000).toISOString(),
  });
  s.audit.push({ id: id('log'), action: 'Datos de prueba', detail: 'Se cargaron 30 días de ventas de ejemplo', by: admin, at: now.toISOString() });
  return s;
}
