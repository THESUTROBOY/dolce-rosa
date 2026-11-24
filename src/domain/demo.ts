import { accountTotal, addDays, dayKey, scoopsFor, suggestedTip, turnoOf, weekOf } from './calc';
import { EXPENSE_CATEGORIES } from './defaults';
import { bucketOf, makePayment, methodsLabel, shiftReport, splitTip } from './money';
import { seedState } from './seed';
import type { Account, AppState, Comanda, Expense, Line, Option, PayMethod, Product, Station, TipPayout } from './types';

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

const NOTES = ['Sin azúcar', 'Bien caliente', 'Con hielo aparte', 'Sin crema', 'Para compartir', 'Separar salsa'];

/**
 * Carta base + 30 días de cuentas emitidas en dos turnos, con mesas abiertas hoy
 * y comandas en distintos estados para que cocina tenga trabajo.
 */
export function demoState(now = new Date()): AppState {
  const r = rng(20261105);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const s = seedState();
  s.settings.address = 'Av. Ejemplo 123, Santiago';
  s.settings.phone = '@dolcerosa.cafe';
  let n = 0;
  const id = (p: string) => `${p}_demo_${++n}`;
  const station = (p: Product): Station => s.categories.find((c) => c.id === p.categoryId)!.station;
  const weighted: Product[] = s.products.flatMap((p) => {
    const c = s.categories.find((x) => x.id === p.categoryId)!.name;
    const w: Record<string, number> = { 'Cafetería caliente': 5, 'Cafetería fría': 3, Pastelería: 2, Tortas: 3, Fondue: 1, Desayunos: 2 };
    return Array(w[c] ?? 2).fill(p);
  });
  const tables = s.tables;

  const flavors = s.settings.iceCreamFlavors ?? ['Vainilla'];
  const demoChoices = (p: Product, extras: string[]) => {
    const out = (p.choices ?? []).map((g) => {
      const v = g.multi && r() < 0.4 ? g.options.map((o) => o.toLowerCase()).join(' y ') : pick(g.options);
      return /^(con|sin) /i.test(v) ? v : `${g.name} ${v.toLowerCase()}`;
    });
    const n = scoopsFor(p, extras);
    if (n) out.push(`Helado ${Array.from({ length: n }, () => pick(flavors).toLowerCase()).join(' y ')}`);
    return out.length ? out : undefined;
  };
  const line = (at: Date, sent = true): Line => {
    const p = pick(weighted);
    const variant = p.variants.length ? pick(p.variants) : undefined;
    const extras: Option[] = p.extras.length && r() < 0.3 ? [pick(p.extras)] : [];
    return {
      id: id('lin'),
      productId: p.id,
      name: p.name,
      variant: variant?.name,
      extras: extras.map((e) => e.name),
      choices: demoChoices(p, extras.map((e) => e.name)),
      unitPrice: (variant?.price ?? p.price) + extras.reduce((a, e) => a + e.price, 0),
      qty: r() < 0.2 ? 2 : 1,
      note: r() < 0.12 ? pick(NOTES) : '',
      station: station(p),
      addedAt: at.toISOString(),
      sentAt: sent ? at.toISOString() : undefined,
    };
  };

  const at = (day: Date, h: number, m: number) => {
    const d = new Date(day);
    d.setHours(h, m, Math.floor(r() * 60), 0);
    return d;
  };

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const accounts: Account[] = [];
  const comandas: Comanda[] = [];
  const method = (): PayMethod => {
    const x = r();
    return x < 0.28 ? 'efectivo' : x < 0.62 ? 'debito' : x < 0.85 ? 'credito' : 'transferencia';
  };

  let boleta = 41200;
  for (let back = 30; back >= 0; back--) {
    const day = new Date(today);
    day.setDate(today.getDate() - back);
    if (day.getDay() === 1 && back > 0) continue; // lunes cerrado
    const weekend = day.getDay() === 0 || day.getDay() === 6;
    const count = Math.round((weekend ? 46 : 30) + r() * 10);
    for (let i = 0; i < count; i++) {
      const close = at(day, 9 + Math.floor(r() * 11), Math.floor(r() * 60));
      if (close > now) continue;
      const open = new Date(close.getTime() - (20 + r() * 40) * 60000);
      const t = pick(tables);
      const lines = Array.from({ length: 1 + Math.floor(r() * 4) }, () => line(open));
      const a: Account = {
        id: id('cta'),
        number: 0,
        tableId: t.id,
        tableName: t.name,
        status: 'emitida',
        lines,
        openedAt: open.toISOString(),
        emittedAt: close.toISOString(),
        paidAt: new Date(close.getTime() + (2 + r() * 6) * 60000).toISOString(),
        day: dayKey(close),
        turno: turnoOf(close, s.settings.afternoonStartsAt),
        payDay: dayKey(close),
        payTurno: turnoOf(close, s.settings.afternoonStartsAt),
        tip: 0,
      };
      if (t.name !== 'Para llevar' && r() < 0.7) a.tip = suggestedTip(accountTotal(a), s.settings.tipPercent);
      // Uno de cada diez paga combinado: parte en efectivo y el resto con tarjeta.
      const due = accountTotal(a) + a.tip;
      const parts: [PayMethod, number][] = r() < 0.1 ? [['efectivo', Math.round((due * 0.4) / 1000) * 1000 || 1000], ['debito', 0]] : [[method(), due]];
      if (parts.length === 2) parts[1][1] = due - parts[0][1];
      const tips = splitTip(parts.map((x) => x[1]), a.tip);
      a.payments = parts.filter((x) => x[1] > 0).map(([m, amt], i) => makePayment(m, amt, tips[i], a.day!, s.settings, back > 1 || r() < 0.7));
      a.paymentMethod = methodsLabel(a.payments);
      // Casi todo lo pasado ya está cuadrado con su boleta; hoy queda la mitad por revisar.
      a.boleta = String(boleta++);
      a.checked = back > 0 ? r() < 0.97 : r() < 0.5;
      if (r() < 0.015) {
        a.status = 'anulada';
        a.voidReason = pick(['Cliente se fue sin consumir', 'Mesa ingresada por error']);
        a.voidedAt = close.toISOString();
        a.boleta = undefined;
        a.paidAt = a.payments = a.paymentMethod = undefined;
        a.tip = 0;
      }
      accounts.push(a);
      for (const st of ['cocina', 'barra'] as Station[]) {
        const ls = lines.filter((l) => l.station === st);
        if (!ls.length) continue;
        const c: Comanda = {
          id: id('com'),
          number: 0,
          accountId: a.id,
          tableName: a.tableName,
          station: st,
          items: ls.map((l) => ({ name: l.name, variant: l.variant, extras: l.extras, choices: l.choices, qty: l.qty, note: l.note })),
          createdAt: open.toISOString(),
          status: 'entregado',
          updatedAt: close.toISOString(),
        };
        ls.forEach((l) => (l.comandaId = c.id));
        comandas.push(c);
      }
    }
  }

  // Mesas abiertas ahora, en distintos momentos del servicio.
  const minsAgo = (m: number) => new Date(now.getTime() - m * 60000);
  const openTable = (name: string, plan: { ago: number; status: Comanda['status'] }[], unsent = 0) => {
    const t = s.tables.find((x) => x.name === name)!;
    const a: Account = {
      id: id('cta'),
      number: 0,
      tableId: t.id,
      tableName: t.name,
      status: 'abierta',
      lines: [],
      openedAt: minsAgo(plan[0]?.ago ?? 2).toISOString(),
      tip: 0,
    };
    for (const step of plan) {
      const when = minsAgo(step.ago);
      const ls = Array.from({ length: 2 + Math.floor(r() * 2) }, () => line(when));
      // Asegura que haya algo para cocina en las mesas con más pedidos.
      if (!ls.some((l) => l.station === 'cocina')) {
        const w = s.products.find((p) => p.name === 'Encanto')!;
        ls.push({ ...line(when), productId: w.id, name: w.name, variant: undefined, extras: ['Bola de helado extra'], choices: demoChoices(w, ['Bola de helado extra']), unitPrice: w.price + 990, station: 'cocina', note: '' });
      }
      a.lines.push(...ls);
      for (const st of ['cocina', 'barra'] as Station[]) {
        const sl = ls.filter((l) => l.station === st);
        if (!sl.length) continue;
        const c: Comanda = {
          id: id('com'),
          number: 0,
          accountId: a.id,
          tableName: a.tableName,
          station: st,
          items: sl.map((l) => ({ name: l.name, variant: l.variant, extras: l.extras, choices: l.choices, qty: l.qty, note: l.note })),
          createdAt: when.toISOString(),
          // La barra es más rápida que la cocina.
          status: st === 'barra' && step.status !== 'pendiente' ? 'entregado' : step.status,
          updatedAt: when.toISOString(),
        };
        sl.forEach((l) => (l.comandaId = c.id));
        comandas.push(c);
      }
    }
    for (let i = 0; i < unsent; i++) a.lines.push(line(minsAgo(1), false));
    accounts.push(a);
    return a;
  };
  // Mesa 6 ya pidió la cuenta: detalle emitido, falta cobrar.
  const m6 = openTable('Mesa 6', [{ ago: 38, status: 'entregado' }]);
  const emittedAt = minsAgo(3);
  Object.assign(m6, { status: 'emitida', emittedAt: emittedAt.toISOString(), day: dayKey(emittedAt), turno: turnoOf(emittedAt, s.settings.afternoonStartsAt) });
  openTable('Mesa 2', [{ ago: 42, status: 'entregado' }]);
  openTable('Mesa 3', [{ ago: 18, status: 'listo' }]);
  openTable('Mesa 5', [{ ago: 9, status: 'preparando' }]);
  openTable('Mesa 8', [{ ago: 4, status: 'pendiente' }]);
  openTable('Mesa 7', [], 2);

  accounts.sort((a, b) => a.openedAt.localeCompare(b.openedAt));
  accounts.forEach((a, i) => (a.number = i + 1));
  comandas.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  comandas.forEach((c, i) => (c.number = i + 1));
  s.accounts = accounts;
  s.comandas = comandas;
  s.nextAccount = accounts.length + 1;
  const emitted = accounts.filter((a) => a.emittedAt).sort((a, b) => a.emittedAt!.localeCompare(b.emittedAt!));
  emitted.forEach((a, i) => (a.folio = i + 1));
  s.nextFolio = emitted.length + 1;
  s.nextComanda = comandas.length + 1;

  // Finanzas: saldos al inicio del mes de prueba, gastos, propinas entregadas y algún movimiento.
  const first = dayKey(new Date(today.getTime() - 30 * 86400000));
  Object.assign(s.settings, { openingCash: 150000, openingBank: 1800000, openingDate: first });
  const [arriendo, sueldos, software, insumos, envases, marketing, , mantencion] = EXPENSE_CATEGORIES;
  const expenses: Expense[] = [];
  const gasto = (date: string, description: string, category: string, amount: number, fund: Expense['fund'], docType = 'Boleta') =>
    expenses.push({
      id: id('gas'),
      date,
      description,
      category,
      amount,
      method: fund === 'efectivo' ? 'Efectivo' : 'Transferencia',
      fund,
      docType,
      notes: '',
      createdAt: new Date(date + 'T10:30:00').toISOString(),
      by: 'Administración',
    });
  for (let back = 30; back >= 0; back--) {
    const day = dayKey(new Date(today.getTime() - back * 86400000));
    const dom = new Date(day + 'T12:00').getDate();
    const wd = new Date(day + 'T12:00').getDay();
    if (dom === 1) {
      gasto(day, 'Arriendo local', arriendo, 950000, 'banco', 'Factura');
      gasto(day, 'Suscripción Canva y software', software, 24990, 'banco', 'Factura');
    }
    if (dom === 5) gasto(day, 'Luz y agua', arriendo, 138400, 'banco', 'Factura');
    if (dom === 30 || (dom === 28 && new Date(day + 'T12:00').getMonth() === 1)) gasto(day, 'Sueldos', sueldos, 1450000, 'banco', 'Sin documento');
    if (wd === 2) gasto(day, 'Mercadería distribuidora', insumos, 180000 + Math.round(r() * 60000), 'banco', 'Factura');
    if (wd === 4 || wd === 6) gasto(day, pick(['Leche y crema', 'Frutillas y plátanos', 'Pan Selezione', 'Huevos y palta']), insumos, 12000 + Math.round(r() * 20) * 1000, 'efectivo');
    if (wd === 3 && r() < 0.5) gasto(day, 'Vasos y bolsas para llevar', envases, 32990, 'banco', 'Factura');
    if (dom === 15) gasto(day, 'Publicidad Instagram', marketing, 40000, 'banco', 'Factura');
    if (dom === 20) gasto(day, 'Mantención máquina de café', mantencion, 65000, 'efectivo', 'Boleta');
  }
  s.expenses = expenses;
  // Propinas entregadas cada lunes de las semanas ya cerradas.
  const payouts: TipPayout[] = [];
  const weekTips = new Map<string, { lv: number; sd: number }>();
  for (const a of accounts) {
    if (!a.paidAt || !a.tip || a.status !== 'emitida') continue;
    const w = weekOf(a.payDay!);
    const v = weekTips.get(w) ?? { lv: 0, sd: 0 };
    v[bucketOf(a.payDay!)] += a.tip;
    weekTips.set(w, v);
  }
  const thisWeek = weekOf(dayKey(today));
  for (const [week, v] of weekTips) {
    if (week >= thisWeek) continue;
    const date = addDays(week, 7);
    for (const bucket of ['lv', 'sd'] as const)
      if (v[bucket]) payouts.push({ id: id('prp'), date, amount: v[bucket], fund: bucket === 'lv' ? 'banco' : 'efectivo', bucket, week, note: '', createdAt: new Date(date + 'T18:00:00').toISOString(), by: 'Administración' });
  }
  s.tipPayouts = payouts;
  const mid = dayKey(new Date(today.getTime() - 12 * 86400000));
  // Cada lunes se deposita en el banco casi todo el efectivo de la semana anterior.
  const cashByWeek = new Map<string, number>();
  for (const a of accounts)
    for (const p of a.status === 'emitida' ? (a.payments ?? []) : [])
      if (p.method === 'efectivo') cashByWeek.set(weekOf(a.payDay!), (cashByWeek.get(weekOf(a.payDay!)) ?? 0) + p.amount);
  const deposits = [...cashByWeek]
    .filter(([w]) => w < thisWeek)
    .map(([w, amt]) => {
      const date = addDays(w, 7);
      return { id: id('mov'), date, kind: 'traspaso' as const, amount: Math.floor((amt * 0.8) / 10000) * 10000, fund: 'efectivo' as const, toFund: 'banco' as const, description: 'Depósito de caja', createdAt: new Date(date + 'T19:00:00').toISOString(), by: 'Administración' };
    });
  s.movements = [
    ...deposits,
    { id: id('mov'), date: mid, kind: 'prestamo_entregado', amount: 50000, fund: 'efectivo', counterpart: 'Proveedor de pasteles', description: 'Adelanto', createdAt: new Date(mid + 'T12:00:00').toISOString(), by: 'Administración' },
  ];
  s.reserves = [{ id: id('res'), name: 'Arriendo del próximo mes', amount: 950000 }];
  s.promotions = [
    { id: id('pro'), name: 'Café + pastel 10%', kind: 'percent', value: 10, productIds: [], categoryIds: [], active: true },
    { id: id('pro'), name: 'Martes de waffles −$1.000', kind: 'amount', value: 1000, productIds: s.products.filter((p) => p.categoryId === s.categories.find((c) => c.name === 'Waffles')?.id).map((p) => p.id), categoryIds: [], active: true, weekdays: [2] },
  ];
  // Cierres de los turnos ya terminados (menos los de hoy, para probar el cierre).
  const closeDays = [...new Set(accounts.filter((a) => a.payDay && a.payDay < dayKey(today)).map((a) => a.payDay!))].sort();
  for (const day of closeDays)
    for (const turno of ['mañana', 'tarde'] as const) {
      const report = shiftReport(s, day, turno, new Date(day + 'T23:59:00'));
      if (!report.sales) continue;
      const closedAt = new Date(day + (turno === 'mañana' ? 'T15:05:00' : 'T20:10:00')).toISOString();
      const off = r() < 0.15 ? pick([-2000, -500, 1000]) : 0;
      s.closes.push({ id: id('cie'), day, turno, closedAt, by: pick(['Camila', 'Fernanda']), report, countedCash: report.cashEnd + off, note: off ? 'Revisar vuelto' : '' });
    }
  s.staff.push({ id: id('per'), name: 'Camila', role: 'trabajador', active: true }, { id: id('per'), name: 'Fernanda', role: 'trabajador', active: true });
  return s;
}
