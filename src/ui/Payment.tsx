import { useState } from 'react';
import { clp, roundCash, saleTotal, suggestedTip } from '../domain/calc';
import { CASH, type Order, type Payment } from '../domain/types';
import { printHtml, receiptHtml } from '../print';
import { useAction, useAppState, useSession, useStore } from '../state';
import { Modal, MoneyInput } from './common';

export function PaymentModal({ order, onClose, onPaid }: { order: Order; onClose(): void; onPaid(): void }) {
  const store = useStore();
  const state = useAppState();
  const { user } = useSession();
  const run = useAction();
  const methods = state.settings.paymentMethods;

  const sale = saleTotal(order);
  const suggested = suggestedTip(order, state.settings.tipPercent);
  const [tip, setTip] = useState(order.type === 'mesa' ? suggested : 0);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [rounding, setRounding] = useState(0);
  const [method, setMethod] = useState(methods[0] ?? CASH);
  const [amount, setAmount] = useState<number | ''>('');
  const [print, setPrint] = useState(true);
  const [done, setDone] = useState<{ change: number } | null>(null);

  const base = sale + tip;
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const remaining = base + rounding - paid;
  const isCash = method === CASH;
  const cashDue = isCash ? roundCash(remaining) : remaining;
  const shiftOpen = !!store.openShift();

  const add = (value: number | '' = amount) => {
    const v = value === '' ? cashDue : value;
    if (v <= 0 || remaining <= 0) return;
    if (isCash) {
      if (v >= roundCash(remaining)) {
        const applied = roundCash(remaining);
        setRounding((r) => r + applied - remaining);
        setPayments((p) => [...p, { method, amount: applied, received: v }]);
      } else {
        setPayments((p) => [...p, { method, amount: v, received: v }]);
      }
    } else {
      setPayments((p) => [...p, { method, amount: Math.min(v, remaining) }]);
    }
    setAmount('');
  };

  const removePayment = (idx: number) => {
    // Al quitar pagos se recalcula todo desde cero para no arrastrar redondeos.
    const rest = payments.filter((_, i) => i !== idx);
    setPayments([]);
    setRounding(0);
    let r = 0;
    let acc = 0;
    const rebuilt: Payment[] = [];
    for (const p of rest) {
      const rem = base + r - acc;
      if (p.method === CASH && (p.received ?? p.amount) >= roundCash(rem)) {
        const applied = roundCash(rem);
        r += applied - rem;
        rebuilt.push({ ...p, amount: applied });
        acc += applied;
      } else {
        const a = Math.min(p.amount, rem);
        rebuilt.push({ ...p, amount: a });
        acc += a;
      }
    }
    setPayments(rebuilt);
    setRounding(r);
  };

  const confirm = () => {
    const ok = run(() => {
      store.pay(user!.id, order.id, payments, tip, rounding);
      return true;
    });
    if (!ok) return;
    const paidOrder = store.get().orders.find((o) => o.id === order.id)!;
    if (print) {
      const names = Object.fromEntries(store.get().users.map((u) => [u.id, u.name]));
      printHtml(receiptHtml(store.get(), paidOrder, names));
    }
    const change = payments.reduce((s, p) => s + (p.method === CASH && p.received ? p.received - p.amount : 0), 0);
    setDone({ change });
  };

  if (done) {
    return (
      <Modal
        title={`Pedido #${order.number} pagado`}
        onClose={onPaid}
        footer={
          <button className="primary wide" onClick={onPaid}>
            Listo
          </button>
        }
      >
        <div className="paid-big">
          {done.change > 0 ? (
            <>
              <span className="muted">Vuelto</span>
              <strong>{clp(done.change)}</strong>
            </>
          ) : (
            <strong>✓ Pago registrado</strong>
          )}
        </div>
      </Modal>
    );
  }

  const quick = isCash
    ? [...new Set([roundCash(remaining), ...[1000, 2000, 5000, 10000, 20000].filter((b) => b > roundCash(remaining))].slice(0, 4))]
    : [];

  return (
    <Modal
      title={`Cobrar pedido #${order.number}`}
      onClose={onClose}
      wide
      footer={
        <>
          <label className="check">
            <input type="checkbox" checked={print} onChange={(e) => setPrint(e.target.checked)} /> Imprimir comprobante
          </label>
          <button className="primary" disabled={remaining !== 0 || !shiftOpen} onClick={confirm}>
            Confirmar pago
          </button>
        </>
      }
    >
      {!shiftOpen && <div className="alert">La caja está cerrada. Ábrela en la pestaña Caja para poder cobrar.</div>}
      <div className="pay-grid">
        <div>
          <div className="row">
            <span>Total venta</span>
            <strong>{clp(sale)}</strong>
          </div>
          <div className="tip-box">
            <div className="row">
              <span>Propina (voluntaria)</span>
              <MoneyInput value={tip} onChange={(v) => payments.length === 0 && setTip(v === '' ? 0 : v)} />
            </div>
            <div className="chips">
              <button className="chip" disabled={payments.length > 0} onClick={() => setTip(0)}>
                Sin propina
              </button>
              <button className="chip" disabled={payments.length > 0} onClick={() => setTip(suggested)}>
                {state.settings.tipPercent}% ({clp(suggested)})
              </button>
            </div>
            {payments.length > 0 && <p className="muted small">Para cambiar la propina quita los pagos.</p>}
          </div>
          {rounding !== 0 && (
            <div className="row muted">
              <span>Redondeo efectivo</span>
              <span>{clp(rounding)}</span>
            </div>
          )}
          <div className="row total">
            <span>A pagar</span>
            <span>{clp(base + rounding)}</span>
          </div>
          <ul className="pay-list">
            {payments.map((p, i) => (
              <li key={i}>
                <span>
                  {p.method}
                  {p.method === CASH && p.received && p.received > p.amount && (
                    <span className="muted small"> · recibe {clp(p.received)}, vuelto {clp(p.received - p.amount)}</span>
                  )}
                </span>
                <span>
                  {clp(p.amount)}{' '}
                  <button className="ghost small" onClick={() => removePayment(i)} aria-label="Quitar pago">
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <div className={`row total ${remaining === 0 ? 'ok' : ''}`}>
            <span>{remaining === 0 ? 'Pagado completo' : 'Falta'}</span>
            <span>{clp(Math.max(remaining, 0))}</span>
          </div>
        </div>

        {remaining > 0 && (
          <div>
            <div className="methods">
              {methods.map((m) => (
                <button key={m} className={m === method ? 'on' : ''} onClick={() => setMethod(m)}>
                  {m}
                </button>
              ))}
            </div>
            <MoneyInput
              label={isCash ? `Recibido (a cobrar ${clp(cashDue)})` : `Monto (falta ${clp(remaining)})`}
              value={amount}
              onChange={setAmount}
            />
            {quick.length > 0 && (
              <div className="chips">
                {quick.map((q) => (
                  <button key={q} className="chip" onClick={() => add(q)}>
                    {clp(q)}
                  </button>
                ))}
              </div>
            )}
            <button className="primary wide" onClick={() => add()}>
              Agregar {amount === '' ? clp(cashDue) : clp(amount)} en {method}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
