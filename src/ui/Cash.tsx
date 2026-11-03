import { useMemo, useState } from 'react';
import { clp, expectedCash, saleTotal, shiftOrders } from '../domain/calc';
import { CASH } from '../domain/types';
import { printHtml, shiftHtml } from '../print';
import { useAction, useAppState, useSession, useStore } from '../state';
import { Empty, MoneyInput } from './common';

export function Cash() {
  const store = useStore();
  const state = useAppState();
  const { user } = useSession();
  const run = useAction();
  const names = useMemo(() => Object.fromEntries(state.users.map((u) => [u.id, u.name])), [state.users]);
  const shift = state.shifts.find((s) => !s.closedAt);

  const [opening, setOpening] = useState<number | ''>('');
  const [movKind, setMovKind] = useState<'retiro' | 'ingreso'>('retiro');
  const [movAmount, setMovAmount] = useState<number | ''>('');
  const [movReason, setMovReason] = useState('');
  const [counted, setCounted] = useState<number | ''>('');
  const [note, setNote] = useState('');

  const closed = [...state.shifts].filter((s) => s.closedAt).reverse().slice(0, 20);
  const openOrders = state.orders.filter((o) => o.status === 'abierto').length;

  if (!shift) {
    return (
      <div className="page narrow">
        <h1>Caja</h1>
        <div className="card">
          <h2>Abrir caja</h2>
          <p className="muted">Cuenta el efectivo con que parte el turno.</p>
          <MoneyInput label="Efectivo inicial" value={opening} onChange={setOpening} autoFocus />
          <button
            className="primary wide"
            onClick={() => run(() => store.startShift(user!.id, opening === '' ? 0 : opening), 'Caja abierta')}
          >
            Abrir caja
          </button>
        </div>
        <History />
      </div>
    );
  }

  const orders = shiftOrders(state, shift);
  const cashSales = orders.reduce((s, o) => s + o.payments.filter((p) => p.method === CASH).reduce((a, p) => a + p.amount, 0), 0);
  const ingresos = shift.movements.filter((m) => m.kind === 'ingreso').reduce((s, m) => s + m.amount, 0);
  const retiros = shift.movements.filter((m) => m.kind === 'retiro').reduce((s, m) => s + m.amount, 0);
  const expected = expectedCash(state, shift);
  const byMethod = new Map<string, number>();
  orders.forEach((o) => o.payments.forEach((p) => byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + p.amount)));

  return (
    <div className="page">
      <div className="page-head">
        <h1>Caja abierta</h1>
        <span className="muted">
          desde {new Date(shift.openedAt).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })} por {names[shift.openedBy]}
        </span>
      </div>
      <div className="kpis">
        <div className="kpi">
          <span>Ventas del turno</span>
          <strong>{clp(orders.reduce((s, o) => s + saleTotal(o), 0))}</strong>
          <small>{orders.length} pedidos</small>
        </div>
        <div className="kpi">
          <span>Propinas</span>
          <strong>{clp(orders.reduce((s, o) => s + o.tip, 0))}</strong>
        </div>
        <div className="kpi">
          <span>Efectivo esperado</span>
          <strong>{clp(expected)}</strong>
          <small>
            inicial {clp(shift.openingCash)} + ventas {clp(cashSales)} + ingresos {clp(ingresos)} − retiros {clp(retiros)}
          </small>
        </div>
      </div>

      <div className="two-col">
        <div className="card">
          <h2>Por medio de pago</h2>
          {byMethod.size === 0 ? (
            <Empty>Sin ventas aún.</Empty>
          ) : (
            <table className="tbl">
              <tbody>
                {[...byMethod].map(([m, a]) => (
                  <tr key={m}>
                    <td>{m}</td>
                    <td className="num">{clp(a)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <h2>Ingresos y retiros</h2>
          <div className="seg">
            <button className={movKind === 'retiro' ? 'on' : ''} onClick={() => setMovKind('retiro')}>
              Retiro
            </button>
            <button className={movKind === 'ingreso' ? 'on' : ''} onClick={() => setMovKind('ingreso')}>
              Ingreso
            </button>
          </div>
          <div className="form-row">
            <MoneyInput label="Monto" value={movAmount} onChange={setMovAmount} />
            <label className="field grow">
              <span>Motivo</span>
              <input value={movReason} onChange={(e) => setMovReason(e.target.value)} placeholder="Ej: compra de leche" />
            </label>
          </div>
          <button
            onClick={() => {
              const ok = run(() => {
                store.addMovement(user!.id, movKind, movAmount === '' ? 0 : movAmount, movReason);
                return true;
              }, 'Movimiento registrado');
              if (ok) {
                setMovAmount('');
                setMovReason('');
              }
            }}
          >
            Registrar {movKind}
          </button>
          <ul className="simple-list">
            {shift.movements.map((m) => (
              <li key={m.id}>
                <span>
                  {m.kind === 'ingreso' ? '+' : '−'} {m.reason} <span className="muted small">({names[m.by]})</span>
                </span>
                <span>{clp(m.amount)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h2>Cerrar caja</h2>
          {openOrders > 0 && <div className="alert">Hay {openOrders} pedido(s) abiertos sin cobrar. Puedes cerrar igual; quedan para el próximo turno.</div>}
          <MoneyInput label="Efectivo contado" value={counted} onChange={setCounted} />
          {counted !== '' && (
            <div className={`row total ${counted - expected === 0 ? 'ok' : 'bad'}`}>
              <span>Diferencia</span>
              <span>
                {counted - expected > 0 ? '+' : ''}
                {clp(counted - expected)}
              </span>
            </div>
          )}
          <label className="field">
            <span>Observación (opcional)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="btn-row">
            <button onClick={() => printHtml(shiftHtml(state, shift, names))}>Imprimir resumen</button>
            <button
              className="primary"
              disabled={counted === ''}
              onClick={() => {
                const ok = run(() => {
                  store.closeShift(user!.id, counted as number, note);
                  return true;
                }, 'Caja cerrada');
                if (ok) {
                  const s = store.get().shifts.find((x) => x.id === shift.id)!;
                  printHtml(shiftHtml(store.get(), s, names));
                  setCounted('');
                  setNote('');
                }
              }}
            >
              Cerrar caja
            </button>
          </div>
        </div>
      </div>
      <History />
    </div>
  );

  function History() {
    return (
      <div className="card">
        <h2>Cierres anteriores</h2>
        {closed.length === 0 ? (
          <Empty>Todavía no hay cierres.</Empty>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Cierre</th>
                <th>Por</th>
                <th className="num">Esperado</th>
                <th className="num">Contado</th>
                <th className="num">Diferencia</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {closed.map((s) => {
                const d = (s.countedCash ?? 0) - (s.expectedCash ?? 0);
                return (
                  <tr key={s.id}>
                    <td>{new Date(s.closedAt!).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td>{names[s.closedBy!]}</td>
                    <td className="num">{clp(s.expectedCash ?? 0)}</td>
                    <td className="num">{clp(s.countedCash ?? 0)}</td>
                    <td className={`num ${d === 0 ? '' : 'bad-text'}`}>{clp(d)}</td>
                    <td className="actions">
                      <button className="ghost small" onClick={() => printHtml(shiftHtml(state, s, names))}>
                        Imprimir
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    );
  }
}
