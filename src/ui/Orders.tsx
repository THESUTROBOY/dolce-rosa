import { useMemo, useState } from 'react';
import { clp, dayKey, saleTotal } from '../domain/calc';
import type { KitchenStatus, Order } from '../domain/types';
import { kitchenHtml, printHtml, receiptHtml } from '../print';
import { useAction, useAppState, useSession, useStore } from '../state';
import { Empty } from './common';
import { VoidModal } from './Sell';

const KS: { v: KitchenStatus; label: string }[] = [
  { v: 'pendiente', label: 'Pendiente' },
  { v: 'listo', label: 'Listo' },
  { v: 'entregado', label: 'Entregado' },
];

export function Orders({ onOpen, onNewTable }: { onOpen(id: string): void; onNewTable(tableId: string): void }) {
  const store = useStore();
  const state = useAppState();
  const { user } = useSession();
  const run = useAction();
  const [q, setQ] = useState('');
  const [voiding, setVoiding] = useState<Order | null>(null);
  const names = useMemo(() => Object.fromEntries(state.users.map((u) => [u.id, u.name])), [state.users]);

  const open = state.orders.filter((o) => o.status === 'abierto');
  const tableName = (id?: string) => state.tables.find((t) => t.id === id)?.name ?? '';
  const match = (o: Order) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return String(o.number) === s.replace('#', '') || tableName(o.tableId).toLowerCase().includes(s) || o.customerName.toLowerCase().includes(s);
  };
  const today = dayKey(new Date().toISOString());
  const history = state.orders
    .filter((o) => o.status !== 'abierto' && dayKey(o.paidAt ?? o.voidedAt ?? o.createdAt) === today)
    .filter(match)
    .sort((a, b) => b.number - a.number);

  const KitchenSel = ({ o }: { o: Order }) => (
    <select
      value={o.kitchenStatus}
      onChange={(e) => store.setKitchenStatus(o.id, e.target.value as KitchenStatus)}
      aria-label={`Estado del pedido ${o.number}`}
      className={`ks ks-${o.kitchenStatus}`}
    >
      {KS.map((k) => (
        <option key={k.v} value={k.v}>
          {k.label}
        </option>
      ))}
    </select>
  );

  return (
    <div className="page">
      <div className="page-head">
        <h1>Pedidos</h1>
        <input type="search" placeholder="Buscar por número, mesa o cliente" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <h2>Mesas</h2>
      <div className="tables">
        {state.tables.map((t) => {
          const o = open.find((x) => x.tableId === t.id);
          return (
            <button key={t.id} className={`table-card ${o ? 'busy' : ''}`} onClick={() => (o ? onOpen(o.id) : onNewTable(t.id))}>
              <strong>{t.name}</strong>
              {o ? (
                <>
                  <span>
                    #{o.number} · {clp(saleTotal(o))}
                  </span>
                  <span className={`badge ks-${o.kitchenStatus}`}>{o.kitchenStatus}</span>
                </>
              ) : (
                <span className="muted">Libre</span>
              )}
            </button>
          );
        })}
      </div>

      <h2>Pedidos abiertos</h2>
      {open.filter(match).length === 0 ? (
        <Empty>No hay pedidos abiertos.</Empty>
      ) : (
        <table className="tbl">
          <thead>
            <tr>
              <th>#</th>
              <th>Dónde</th>
              <th>Productos</th>
              <th className="num">Total</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {open.filter(match).map((o) => (
              <tr key={o.id}>
                <td>{o.number}</td>
                <td>{o.type === 'mesa' ? tableName(o.tableId) : `Llevar${o.customerName ? ' · ' + o.customerName : ''}`}</td>
                <td className="small">{o.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}</td>
                <td className="num">{clp(saleTotal(o))}</td>
                <td>
                  <KitchenSel o={o} />
                </td>
                <td className="actions">
                  <button onClick={() => onOpen(o.id)}>Abrir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Hoy</h2>
      {history.length === 0 ? (
        <Empty>Aún no hay ventas cerradas hoy.</Empty>
      ) : (
        <table className="tbl">
          <thead>
            <tr>
              <th>#</th>
              <th>Hora</th>
              <th>Dónde</th>
              <th className="num">Total</th>
              <th>Pago</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {history.map((o) => (
              <tr key={o.id} className={o.status === 'anulado' ? 'voided' : ''}>
                <td>{o.number}</td>
                <td>{new Date(o.paidAt ?? o.voidedAt!).toLocaleTimeString('es-CL', { timeStyle: 'short' })}</td>
                <td>{o.type === 'mesa' ? tableName(o.tableId) : 'Llevar'}</td>
                <td className="num">{clp(saleTotal(o))}</td>
                <td className="small">{o.payments.map((p) => p.method).join(' + ')}</td>
                <td>
                  {o.status === 'anulado' ? (
                    <span className="badge danger" title={o.voidReason}>
                      Anulado: {o.voidReason}
                    </span>
                  ) : (
                    <KitchenSel o={o} />
                  )}
                </td>
                <td className="actions">
                  <button
                    className="ghost small"
                    onClick={() => {
                      store.logReprint(user!.id, o.id, 'Comprobante');
                      printHtml(receiptHtml(state, o, names));
                    }}
                  >
                    Reimprimir
                  </button>
                  <button
                    className="ghost small"
                    onClick={() => {
                      store.logReprint(user!.id, o.id, 'Comanda');
                      printHtml(kitchenHtml(state, o, false));
                    }}
                  >
                    Comanda
                  </button>
                  {o.status === 'pagado' && user!.role === 'admin' && (
                    <button className="danger-ghost small" onClick={() => setVoiding(o)}>
                      Anular
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {voiding && (
        <VoidModal
          title={`Anular venta #${voiding.number}`}
          onClose={() => setVoiding(null)}
          onConfirm={(reason) => {
            run(() => store.voidOrder(user!.id, voiding.id, reason), 'Venta anulada');
            setVoiding(null);
          }}
        />
      )}
    </div>
  );
}
