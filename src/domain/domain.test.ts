import { describe, expect, it } from 'vitest';
import { amountDue, buildReport, expectedCash, netAndTax, roundCash, saleTotal } from './calc';
import { memoryPersistence, Store } from './store';
import { CASH, type OrderItem } from './types';

const item = (unitPrice: number, qty = 1, productId = 'p'): OrderItem => ({
  id: Math.random().toString(),
  productId,
  name: 'X',
  extras: [],
  unitPrice,
  qty,
  note: '',
  sentQty: 0,
});

describe('cálculos', () => {
  it('redondeo del efectivo a la decena', () => {
    expect(roundCash(3990)).toBe(3990);
    expect(roundCash(3991)).toBe(3990);
    expect(roundCash(3995)).toBe(3990);
    expect(roundCash(3996)).toBe(4000);
    expect(roundCash(3999)).toBe(4000);
  });

  it('neto e IVA desde total con IVA incluido', () => {
    expect(netAndTax(11900)).toEqual({ neto: 10000, iva: 1900 });
    const { neto, iva } = netAndTax(3333);
    expect(neto + iva).toBe(3333);
  });

  it('descuentos por monto y porcentaje, sin pasar el subtotal', () => {
    const items = [item(2000, 2), item(1000)];
    expect(saleTotal({ items, discount: { kind: 'porcentaje', value: 10 } })).toBe(4500);
    expect(saleTotal({ items, discount: { kind: 'monto', value: 9999 } })).toBe(0);
    expect(amountDue({ items, tip: 500, rounding: -5 })).toBe(5495);
  });
});

describe('flujo de venta y caja', () => {
  const setup = () => {
    const s = new Store(memoryPersistence());
    const admin = s.login('1234');
    const cajero = s.login('0000');
    return { s, admin, cajero };
  };

  it('no permite cobrar sin caja abierta', () => {
    const { s, cajero } = setup();
    const o = s.saveOrder(cajero.id, { ...s.newOrder(cajero.id, 'llevar'), items: [item(2900)] });
    expect(() => s.pay(cajero.id, o.id, [{ method: CASH, amount: 2900 }], 0, 0)).toThrow(/Abre la caja/);
  });

  it('cobra, cuadra la caja y reporta', () => {
    const { s, cajero, admin } = setup();
    s.startShift(cajero.id, 20000);
    const o1 = s.saveOrder(cajero.id, { ...s.newOrder(cajero.id, 'llevar'), items: [item(2995, 1, 'a')] });
    // Efectivo: 2995 se redondea a 2990
    s.pay(cajero.id, o1.id, [{ method: CASH, amount: 2990, received: 5000 }], 0, -5);
    const mesa = s.get().tables[0].id;
    const o2 = s.saveOrder(cajero.id, { ...s.newOrder(cajero.id, 'mesa', mesa), items: [item(5000, 2, 'b')] });
    expect(o2.number).toBe(2);
    // Propina 1000, pago dividido
    s.pay(cajero.id, o2.id, [
      { method: 'Tarjeta débito', amount: 6000 },
      { method: CASH, amount: 5000 },
    ], 1000, 0);
    s.addMovement(cajero.id, 'retiro', 3000, 'Compra de leche');

    const shift = s.openShift()!;
    expect(expectedCash(s.get(), shift)).toBe(20000 + 2990 + 5000 - 3000);

    const r = buildReport(s.get(), new Date(0), new Date(Date.now() + 1000));
    expect(r.orders).toBe(2);
    expect(r.total).toBe(2995 + 10000);
    expect(r.tips).toBe(1000);
    expect(r.products[0].qty).toBe(2);

    expect(() => s.voidOrder(cajero.id, o1.id, 'error')).toThrow(/administrador/);
    s.voidOrder(admin.id, o1.id, 'cobrado dos veces');
    expect(buildReport(s.get(), new Date(0), new Date(Date.now() + 1000)).voided.count).toBe(1);

    s.closeShift(cajero.id, 21990);
    const closed = s.get().shifts[0];
    expect(closed.expectedCash).toBe(20000 + 5000 - 3000);
    expect(s.openShift()).toBeUndefined();
  });

  it('rechaza pagos que no cuadran y mesas ocupadas', () => {
    const { s, cajero } = setup();
    s.startShift(cajero.id, 0);
    const mesa = s.get().tables[0].id;
    const o = s.saveOrder(cajero.id, { ...s.newOrder(cajero.id, 'mesa', mesa), items: [item(1000)] });
    expect(() => s.pay(cajero.id, o.id, [{ method: CASH, amount: 900 }], 0, 0)).toThrow(/no cuadran/);
    expect(() => s.saveOrder(cajero.id, { ...s.newOrder(cajero.id, 'mesa', mesa), items: [item(1)] })).toThrow(
      /ya tiene/,
    );
  });

  it('archiva en vez de borrar productos con ventas y registra cambio de precio', () => {
    const { s, admin, cajero } = setup();
    const p = s.get().products[0];
    s.saveOrder(cajero.id, { ...s.newOrder(cajero.id, 'llevar'), items: [item(p.price, 1, p.id)] });
    expect(s.deleteProduct(admin.id, p.id)).toBe('archivado');
    s.saveProduct(admin.id, { ...p, price: p.price + 100 });
    expect(s.get().priceChanges).toHaveLength(1);
    expect(() => s.saveProduct(cajero.id, { ...p, price: 1 })).toThrow(/administrador/);
  });
});

describe('datos de prueba', () => {
  it('genera un mes de ventas consistente', async () => {
    const { demoState } = await import('./demo');
    const { amountDue, paidSoFar } = await import('./calc');
    const now = new Date('2026-11-03T16:30:00');
    const s = demoState(now);
    const paid = s.orders.filter((o) => o.status === 'pagado');
    expect(paid.length).toBeGreaterThan(600);
    for (const o of paid) expect(paidSoFar(o)).toBe(amountDue(o));
    expect(s.shifts.filter((x) => !x.closedAt)).toHaveLength(1);
    expect(s.orders.filter((o) => o.status === 'abierto')).toHaveLength(3);
    const store = new Store(memoryPersistence(), () => s);
    for (const sh of store.get().shifts.filter((x) => x.closedAt))
      expect(sh.expectedCash).toBe(expectedCash(store.get(), sh));
    expect(store.login('1111').name).toBe('Camila');
  });
});
