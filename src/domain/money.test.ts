import { describe, expect, it } from 'vitest';
import { accountTotal, suggestedTip } from './calc';
import { finance, sales, shiftReport, splitTip, tipWeeks } from './money';
import { memoryPersistence, Store } from './store';

const setup = (at = '2026-11-18T11:00:00') => {
  const s = new Store(memoryPersistence());
  s.now = () => new Date(at);
  s.actor = 'Camila';
  const st = s.get();
  const prod = (name: string) => st.products.find((p) => p.name === name)!;
  /** Abre, envía y emite una cuenta con los productos dados. */
  const emitted = (names: string[], table = 0) => {
    const t = s.get().tables[table];
    let acc = s.addLine(t.id, { productId: prod(names[0]).id, extras: [], qty: 1, note: '' });
    for (const n of names.slice(1)) acc = s.addLine(t.id, { productId: prod(n).id, extras: [], qty: 1, note: '' });
    s.send(acc.id);
    s.emit(acc.id);
    return s.get().accounts.find((a) => a.id === acc.id)!;
  };
  return { s, prod, emitted };
};

describe('propina', () => {
  it('es exactamente el 10 % del consumo, redondeado solo al peso', () => {
    expect(suggestedTip(12345, 10)).toBe(1235);
    expect(suggestedTip(5490, 10)).toBe(549);
    expect(suggestedTip(3290, 10)).toBe(329);
  });
  it('se reparte entre pagos combinados en proporción', () => {
    expect(splitTip([6000, 4000], 1000)).toEqual([600, 400]);
    expect(splitTip([3333, 3333, 3334], 1001)).toEqual([334, 334, 333]);
    expect(splitTip([5000], 0)).toEqual([0]);
  });
});

describe('descuentos y promociones', () => {
  it('aplica promociones por producto o por cuenta y bloquea descuentos manuales a trabajadores', () => {
    const { s, prod, emitted } = setup();
    const a = emitted(['Latte', 'Brownie']);
    s.savePromotion(true, { id: 'p1', name: 'Latte 20%', kind: 'percent', value: 20, productIds: [prod('Latte').id], categoryIds: [], active: true });
    s.applyDiscount(false, a.id, { promoId: 'p1', name: 'Latte 20%', kind: 'percent', value: 20, productIds: [prod('Latte').id] });
    expect(accountTotal(s.get().accounts.find((x) => x.id === a.id)!)).toBe(3290 + 3290 - 658);
    expect(() => s.applyDiscount(false, a.id, { promoId: 'p1', name: 'Latte 20%', kind: 'percent', value: 20 })).toThrow(/ya está aplicada/);
    expect(() => s.applyDiscount(false, a.id, { name: 'Amigo', kind: 'amount', value: 1000 })).toThrow(/administración/);
    s.applyDiscount(true, a.id, { name: 'Cortesía', kind: 'amount', value: 99999 });
    // Nunca deja la cuenta en negativo.
    expect(accountTotal(s.get().accounts.find((x) => x.id === a.id)!)).toBe(0);
    expect(s.get().audit.at(-1)).toMatchObject({ action: 'Aplicar descuento', by: 'Camila' });
  });
});

describe('cobro', () => {
  it('registra pagos combinados con propina, comisión y abono pendiente', () => {
    const { s, emitted } = setup();
    const a = emitted(['Latte', 'Brownie']); // 6.580
    const tip = suggestedTip(6580, 10); // 658
    expect(() => s.pay(a.id, { tip, payments: [{ method: 'efectivo', amount: 3000 }] })).toThrow(/deben sumar \$7.238/);
    s.pay(a.id, { tip, payments: [{ method: 'efectivo', amount: 3000, tip: 0 }, { method: 'debito', amount: 4238, tip: 658 }] });
    const paid = s.get().accounts.find((x) => x.id === a.id)!;
    expect(paid.paymentMethod).toBe('Efectivo + Débito');
    expect(paid.tip).toBe(658);
    expect(paid.payments![1]).toMatchObject({ method: 'debito', fee: Math.round(4238 * 0.019), settleOn: '2026-11-19' });
    const [sale] = sales(s.get());
    expect(sale).toMatchObject({ consumo: 6580, tip: 658, fee: 81, net: 6580 - 81, turno: 'mañana' });
    // Hoy el abono del débito aún no llega; mañana sí.
    const today = finance(s.get(), new Date('2026-11-18T20:00:00'));
    expect(today).toMatchObject({ cash: 3000, bank: 0, pendingMp: 4238 - 81, income: 6580, tipsPending: 658, tipsBank: 658 });
    const tomorrow = finance(s.get(), new Date('2026-11-19T09:00:00'));
    expect(tomorrow).toMatchObject({ bank: 4238 - 81, pendingMp: 0 });
  });

  it('la comisión de la propina puede descontarse de la propina', () => {
    const { s, emitted } = setup();
    s.saveSettings(true, { ...s.get().settings, tipFeeFromTip: true });
    const a = emitted(['Latte']);
    s.pay(a.id, { tip: 329, paymentMethod: 'credito' });
    const [sale] = sales(s.get());
    expect(sale.fee).toBe(Math.round(3619 * 0.034));
    // Exacto: comisión total menos la comisión que habría tenido solo el consumo.
    expect(sale.tipFee).toBe(sale.fee - Math.round(3290 * 0.034));
    expect(sale.cafeFee).toBe(Math.round(3290 * 0.034));
    expect(sale.net).toBe(3290 - sale.cafeFee);
    const f = finance(s.get());
    expect(f.fees).toBe(sale.cafeFee);
    expect(f.tipsByMethod.credito).toBe(329 - sale.tipFee);
  });

  it('propina exacta por medio en pago combinado, separada por efectivo y débito', () => {
    const { s, emitted } = setup();
    const a = emitted(['Latte']);
    // Consumo 3290, propina 329: el efectivo dejó 300 y el débito 29.
    s.pay(a.id, { tip: 329, payments: [{ method: 'efectivo', amount: 2000, tip: 300 }, { method: 'debito', amount: 1619, tip: 29 }] });
    const f = finance(s.get());
    expect(f.tipsByMethod).toMatchObject({ efectivo: 300, debito: 29 });
    expect(f.income).toBe(3290);
    expect(() => {
      const b = emitted(['Latte']);
      s.pay(b.id, { tip: 329, payments: [{ method: 'efectivo', amount: 2000, tip: 300 }, { method: 'debito', amount: 1619, tip: 20 }] });
    }).toThrow();
  });

  it('transferencias pendientes hasta marcarlas recibidas', () => {
    const { s, emitted } = setup();
    const a = emitted(['Latte']);
    s.pay(a.id, { tip: 0, payments: [{ method: 'transferencia', amount: 3290, received: false }] });
    expect(finance(s.get()).pendingTransfers).toBe(3290);
    s.setTransferReceived(true, a.id, 0, true);
    expect(finance(s.get())).toMatchObject({ pendingTransfers: 0, bank: 3290 });
  });
});

describe('gastos, movimientos y finanzas', () => {
  it('cada gasto sale de su fondo y los traspasos no duplican ingresos', () => {
    const { s, emitted } = setup();
    s.saveSettings(true, { ...s.get().settings, openingCash: 50000, openingBank: 200000, openingDate: '2026-11-01' });
    const a = emitted(['Latte']);
    s.pay(a.id, { tip: 0, paymentMethod: 'efectivo' });
    s.addExpense({ date: '2026-11-18', description: 'Leche', category: 'Costo Variable - Mercadería e Insumos', amount: 8000, method: 'Efectivo', fund: 'efectivo', docType: 'Boleta', notes: '' });
    s.addExpense({ date: '2026-11-18', description: 'Arriendo', category: 'Costo Fijo - Arriendo y Servicios', amount: 100000, method: 'Transferencia', fund: 'banco', docType: 'Factura', notes: '' });
    s.addMovement(true, { date: '2026-11-18', kind: 'traspaso', amount: 20000, fund: 'efectivo', toFund: 'banco', description: 'Depósito' });
    s.addMovement(true, { date: '2026-11-18', kind: 'prestamo_entregado', amount: 5000, fund: 'efectivo', counterpart: 'Vecino', description: '' });
    s.addMovement(true, { date: '2026-11-18', kind: 'prestamo_recibido', amount: 30000, fund: 'banco', counterpart: 'Socia', description: '' });
    const f = finance(s.get());
    expect(f.income).toBe(3290);
    expect(f.expenses).toBe(108000);
    expect(f.cash).toBe(50000 + 3290 - 8000 - 20000 - 5000);
    expect(f.bank).toBe(200000 - 100000 + 20000 + 30000);
    expect(f).toMatchObject({ lentOut: 5000, borrowed: 30000 });
    // Anular un gasto devuelve la plata a su fondo.
    s.voidExpense(true, s.get().expenses[0].id, 'mal ingresado');
    expect(finance(s.get()).cash).toBe(50000 + 3290 - 20000 - 5000);
    expect(() => s.voidExpense(false, s.get().expenses[1].id, 'x')).toThrow(/administrador/);
  });

  it('propinas por semana: lunes a viernes y fin de semana, con entregas', () => {
    const { s, emitted } = setup('2026-11-20T11:00:00'); // viernes
    const a = emitted(['Latte']);
    s.pay(a.id, { tip: 329, paymentMethod: 'efectivo' });
    s.now = () => new Date('2026-11-21T11:00:00'); // sábado
    const b = emitted(['Brownie'], 1);
    s.pay(b.id, { tip: 500, paymentMethod: 'debito' });
    let [w] = tipWeeks(s.get());
    expect(w).toMatchObject({ week: '2026-11-16', accrued: { lv: 329, sd: 500 }, paid: { lv: 0, sd: 0 } });
    expect(w.byMethod).toMatchObject({ efectivo: 329, debito: 500 });
    s.payTips(true, { date: '2026-11-21', amount: 329, fund: 'efectivo', bucket: 'lv', week: '2026-11-16', note: '' });
    [w] = tipWeeks(s.get());
    expect(w.paid.lv).toBe(329);
    const f = finance(s.get(), new Date('2026-11-22T10:00:00'));
    expect(f).toMatchObject({ tipsAccrued: 829, tipsPaid: 329, tipsPending: 500, cash: 3290 + 329 - 329 });
  });
});

describe('cierres de turno', () => {
  it('resume el turno y el efectivo pasa al siguiente', () => {
    const { s, emitted } = setup('2026-11-18T10:00:00');
    const a = emitted(['Latte']);
    s.pay(a.id, { tip: 329, paymentMethod: 'efectivo' });
    s.addExpense({ date: '2026-11-18', description: 'Pan', category: 'Costo Variable - Mercadería e Insumos', amount: 2000, method: 'Efectivo', fund: 'efectivo', docType: 'Boleta', notes: '' });
    s.now = () => new Date('2026-11-18T15:05:00');
    s.closeShift('2026-11-18', 'mañana', { countedCash: 1600, note: '' });
    const c = s.get().closes[0];
    expect(c.report).toMatchObject({ sales: 1, consumo: 3290, tips: 329, cashStart: 0, cashEnd: 3290 + 329 - 2000 });
    expect(c.report.byMethod.find((m) => m.method === 'efectivo')).toMatchObject({ count: 1, amount: 3619 });
    expect(() => s.closeShift('2026-11-18', 'mañana', { note: '' })).toThrow(/ya está cerrado/);
    const b = emitted(['Brownie'], 1);
    s.pay(b.id, { tip: 0, paymentMethod: 'efectivo' });
    const pm = shiftReport(s.get(), '2026-11-18', 'tarde', new Date('2026-11-18T18:00:00'));
    expect(pm).toMatchObject({ sales: 1, cashStart: 1619, cashEnd: 1619 + 3290 });
  });
});
