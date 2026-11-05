import { describe, expect, it } from 'vitest';
import { accountDue, accountTotal, netAndTax, summarize, turnoOf } from './calc';
import { demoState } from './demo';
import { memoryPersistence, Store } from './store';

const setup = (at = '2026-11-05T11:00:00') => {
  const s = new Store(memoryPersistence());
  s.now = () => new Date(at);
  const st = s.get();
  const table = st.tables[0];
  const prod = (name: string) => st.products.find((p) => p.name === name)!;
  return { s, table, prod };
};

describe('cálculos', () => {
  it('neto e IVA', () => {
    expect(netAndTax(11900)).toEqual({ neto: 10000, iva: 1900 });
  });
  it('turno según la hora de cambio', () => {
    expect(turnoOf(new Date('2026-11-05T14:59:00'), 15)).toBe('mañana');
    expect(turnoOf(new Date('2026-11-05T15:00:00'), 15)).toBe('tarde');
  });
});

describe('mesa: pedido, comandas y detalle', () => {
  it('suma extras y separa automáticamente barra y cocina', () => {
    const { s, table, prod } = setup();
    s.addLine(table.id, { productId: prod('Latte').id, extras: ['Leche de almendras'], qty: 2, note: 'sin azúcar' });
    const acc = s.addLine(table.id, { productId: prod('Tentación').id, extras: ['Bola de helado extra'], qty: 1, note: '' });
    expect(accountTotal(acc)).toBe((3290 + 700) * 2 + 5490 + 990);
    const counts = s.send(acc.id);
    expect(counts).toEqual({ barra: 2, cocina: 1 });
    const coms = s.get().comandas;
    expect(coms.map((c) => c.station).sort()).toEqual(['barra', 'cocina']);
    expect(coms.find((c) => c.station === 'barra')!.items[0].note).toBe('sin azúcar');
    expect(() => s.send(acc.id)).toThrow(/No hay productos nuevos/);
    // El mesero puede entregar todo aunque siga en preparación.
    expect(s.markServed(acc.id)).toBe(2);
    expect(s.get().comandas.every((c) => c.status === 'entregado')).toBe(true);
    expect(() => s.markServed(acc.id)).toThrow(/nada pendiente/);
  });

  it('solo se editan productos sin enviar y la cuenta vacía desaparece', () => {
    const { s, table, prod } = setup();
    const acc = s.addLine(table.id, { productId: prod('Espresso').id, extras: [], qty: 1, note: '' });
    s.updateUnsent(acc.id, acc.lines[0].id, { qty: 0 });
    expect(s.openAccountFor(table.id)).toBeUndefined();
    const a2 = s.addLine(table.id, { productId: prod('Espresso').id, extras: [], qty: 1, note: '' });
    s.send(a2.id);
    expect(() => s.updateUnsent(a2.id, a2.lines[0].id, { qty: 3 })).toThrow(/administración/);
    expect(() => s.removeSent(false, a2.id, a2.lines[0].id, 'x')).toThrow(/administración/);
    s.removeSent(true, a2.id, a2.lines[0].id, 'error del mesero');
    expect(s.openAccountFor(table.id)).toBeUndefined();
  });

  it('pide tamaño, rechaza agotados y extras inventados', () => {
    const { s, table, prod } = setup();
    expect(() => s.addLine(table.id, { productId: prod('Amanecer luco').id, extras: [], qty: 1, note: '' })).toThrow(/tamaño|opción|elige/i);
    expect(() => s.addLine(table.id, { productId: prod('Espresso').id, extras: ['Oro'], qty: 1, note: '' })).toThrow(/Extra/);
    s.setSoldOut(true, prod('Pie de limón').id, true);
    expect(() => s.addLine(table.id, { productId: prod('Pie de limón').id, extras: [], qty: 1, note: '' })).toThrow(/agotado/);
  });

  it('emite el detalle antes del pago, cobra después y recién ahí libera la mesa', () => {
    const { s, table, prod } = setup('2026-11-05T16:20:00');
    const acc = s.addLine(table.id, { productId: prod('Espresso').id, extras: [], qty: 1, note: '' });
    expect(() => s.emit(acc.id)).toThrow(/sin enviar/);
    s.send(acc.id);
    s.emit(acc.id);
    let e = s.get().accounts.find((a) => a.id === acc.id)!;
    expect(e).toMatchObject({ status: 'emitida', turno: 'tarde', day: '2026-11-05', folio: 1 });
    expect(e.paymentMethod).toBeUndefined();
    // Emitido pero sin cobrar: la mesa sigue ocupada y no acepta productos nuevos.
    expect(s.openAccountFor(table.id)?.id).toBe(acc.id);
    expect(() => s.addLine(table.id, { productId: prod('Espresso').id, extras: [], qty: 1, note: '' })).toThrow(/Reábrelo/);
    // Reabrir para agregar algo conserva el ID del detalle.
    s.reopen(acc.id);
    s.addLine(table.id, { productId: prod('Espresso').id, extras: [], qty: 1, note: '' });
    s.send(acc.id);
    s.emit(acc.id);
    expect(s.get().accounts.find((a) => a.id === acc.id)!.folio).toBe(1);
    expect(() => s.pay(acc.id, { tip: 0, paymentMethod: '' })).toThrow(/medio de pago/);
    s.pay(acc.id, { tip: 400, paymentMethod: 'Débito', boleta: '123' });
    e = s.get().accounts.find((a) => a.id === acc.id)!;
    expect(e).toMatchObject({ paymentMethod: 'Débito', boleta: '123', tip: 400 });
    expect(accountDue(e)).toBe(1990 * 2 + 400);
    expect(s.openAccountFor(table.id)).toBeUndefined();
    expect(() => s.pay(acc.id, { tip: 0, paymentMethod: 'Efectivo' })).toThrow(/ya está pagado/);
    // El siguiente detalle toma el número siguiente, aunque sea de otra mesa.
    const other = s.addLine(s.get().tables[1].id, { productId: prod('Espresso').id, extras: [], qty: 1, note: '' });
    s.send(other.id);
    s.emit(other.id);
    expect(s.get().accounts.find((a) => a.id === other.id)!.folio).toBe(2);
    // Un trabajador no puede tocar cuentas de otro turno.
    s.now = () => new Date('2026-11-06T10:00:00');
    expect(() => s.updateEmitted(false, acc.id, { checked: true })).toThrow(/tu turno/);
    s.updateEmitted(true, acc.id, { checked: true });
  });

  it('cambia la cuenta de mesa sin pisar otra ocupada', () => {
    const { s, prod } = setup();
    const [t1, t2, t3] = s.get().tables;
    const a = s.addLine(t1.id, { productId: prod('Espresso').id, extras: [], qty: 1, note: '' });
    s.addLine(t2.id, { productId: prod('Espresso').id, extras: [], qty: 1, note: '' });
    expect(() => s.moveTable(a.id, t2.id)).toThrow(/ya tiene/);
    s.moveTable(a.id, t3.id);
    expect(s.openAccountFor(t3.id)?.id).toBe(a.id);
  });
});

describe('datos de prueba', () => {
  it('son consistentes y tienen trabajo para cocina', () => {
    const now = new Date('2026-11-05T16:30:00');
    const st = demoState(now);
    const sum = summarize(st, '2026-10-06', '2026-11-05');
    expect(sum.count).toBeGreaterThan(700);
    expect(sum.byTurno.every((t) => t.count > 0)).toBe(true);
    expect(st.accounts.filter((a) => a.status === 'abierta')).toHaveLength(5);
    expect(st.accounts.filter((a) => a.status === 'emitida' && !a.paidAt)).toHaveLength(1);
    const kitchen = st.comandas.filter((c) => c.station === 'cocina' && c.status !== 'entregado');
    expect(kitchen.length).toBeGreaterThanOrEqual(3);
    // Las líneas de cuentas abiertas apuntan a comandas existentes.
    for (const a of st.accounts.filter((x) => x.status === 'abierta'))
      for (const l of a.lines) if (l.sentAt) expect(st.comandas.some((c) => c.id === l.comandaId)).toBe(true);
    expect(st.accounts.every((a) => a.status !== 'emitida' || a.emittedAt! <= now.toISOString())).toBe(true);
    // Cada detalle emitido tiene un ID único y correlativo.
    const folios = st.accounts.filter((a) => a.emittedAt).map((a) => a.folio!).sort((x, y) => x - y);
    expect(folios).toEqual(folios.map((_, i) => i + 1));
    expect(st.nextFolio).toBe(folios.length + 1);
  });
});
