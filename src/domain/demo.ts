import { accountTotal, dayKey, suggestedTip, turnoOf } from './calc';
import { seedState } from './seed';
import type { Account, AppState, Comanda, Line, Option, Product, Station } from './types';

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
    return Array(c === 'Cafés' ? 6 : c === 'Tortas y pasteles' ? 3 : 2).fill(p);
  });
  const tables = s.tables.filter((t) => t.name !== 'Barra');

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
  const method = () => {
    const x = r();
    return x < 0.28 ? 'Efectivo' : x < 0.62 ? 'Débito' : x < 0.85 ? 'Crédito' : 'Transferencia';
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
        day: dayKey(close),
        turno: turnoOf(close, s.settings.afternoonStartsAt),
        tip: 0,
        paymentMethod: method(),
      };
      if (t.name !== 'Para llevar' && r() < 0.7) a.tip = suggestedTip(accountTotal(a), s.settings.tipPercent);
      // Casi todo lo pasado ya está cuadrado con su boleta; hoy queda la mitad por revisar.
      a.boleta = String(boleta++);
      a.checked = back > 0 ? r() < 0.97 : r() < 0.5;
      if (r() < 0.015) {
        a.status = 'anulada';
        a.voidReason = pick(['Cliente se fue sin consumir', 'Mesa ingresada por error']);
        a.voidedAt = close.toISOString();
        a.boleta = undefined;
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
          items: ls.map((l) => ({ name: l.name, variant: l.variant, extras: l.extras, qty: l.qty, note: l.note })),
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
        const w = s.products.find((p) => p.name.startsWith('Waffle Nutella'))!;
        ls.push({ ...line(when), productId: w.id, name: w.name, variant: undefined, extras: ['Helado'], unitPrice: w.price + 900, station: 'cocina', note: '' });
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
          items: sl.map((l) => ({ name: l.name, variant: l.variant, extras: l.extras, qty: l.qty, note: l.note })),
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
  };
  openTable('Mesa 2', [{ ago: 42, status: 'entregado' }]);
  openTable('Mesa 3', [{ ago: 18, status: 'listo' }]);
  openTable('Mesa 5', [{ ago: 9, status: 'preparando' }]);
  openTable('Terraza 1', [{ ago: 4, status: 'pendiente' }]);
  openTable('Mesa 7', [], 2);

  accounts.sort((a, b) => a.openedAt.localeCompare(b.openedAt));
  accounts.forEach((a, i) => (a.number = i + 1));
  comandas.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  comandas.forEach((c, i) => (c.number = i + 1));
  s.accounts = accounts;
  s.comandas = comandas;
  s.nextAccount = accounts.length + 1;
  s.nextComanda = comandas.length + 1;
  return s;
}
