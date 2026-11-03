import { useMemo, useState } from 'react';
import { buildReport, clp, dayKey, netAndTax, saleTotal } from '../domain/calc';
import { useAppState } from '../state';
import { downloadFile, Empty, toCsv } from './common';

type Preset = 'hoy' | 'semana' | 'mes' | 'rango';

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function rangeFor(p: Preset, from: string, to: string): [Date, Date] {
  const today = startOfDay(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (p === 'hoy') return [today, tomorrow];
  if (p === 'semana') {
    const mon = new Date(today);
    mon.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    return [mon, tomorrow];
  }
  if (p === 'mes') return [new Date(today.getFullYear(), today.getMonth(), 1), tomorrow];
  const f = from ? new Date(from + 'T00:00') : today;
  const t = to ? new Date(to + 'T00:00') : today;
  t.setDate(t.getDate() + 1);
  return [f, t];
}

export function Reports() {
  const state = useAppState();
  const [preset, setPreset] = useState<Preset>('hoy');
  const [from, setFrom] = useState(dayKey(new Date().toISOString()));
  const [to, setTo] = useState(dayKey(new Date().toISOString()));
  const [range0, range1] = rangeFor(preset, from, to);
  const r = useMemo(() => buildReport(state, range0, range1), [state, range0.getTime(), range1.getTime()]); // eslint-disable-line

  const label = `${dayKey(range0.toISOString())}_a_${dayKey(new Date(range1.getTime() - 1).toISOString())}`;
  const maxDay = Math.max(1, ...r.byDay.map((d) => d.total));
  const least = [...r.products].sort((a, b) => a.qty - b.qty).slice(0, 5);

  const exportSales = () => {
    const names = Object.fromEntries(state.users.map((u) => [u.id, u.name]));
    const rows: (string | number)[][] = [
      ['Pedido', 'Fecha', 'Estado', 'Tipo', 'Mesa', 'Usuario', 'Total', 'Neto', 'IVA', 'Descuento incluido', 'Propina', 'Medios de pago'],
    ];
    state.orders
      .filter((o) => o.status !== 'abierto')
      .filter((o) => {
        const at = new Date(o.paidAt ?? o.voidedAt!);
        return at >= range0 && at < range1;
      })
      .forEach((o) => {
        const t = saleTotal(o);
        const { neto, iva } = netAndTax(t);
        rows.push([
          o.number,
          new Date(o.paidAt ?? o.voidedAt!).toLocaleString('es-CL'),
          o.status,
          o.type,
          state.tables.find((x) => x.id === o.tableId)?.name ?? '',
          names[o.paidBy ?? o.createdBy] ?? '',
          t,
          neto,
          iva,
          o.items.reduce((s, i) => s + i.unitPrice * i.qty, 0) - t,
          o.tip,
          o.payments.map((p) => `${p.method} ${p.amount}`).join(' + '),
        ]);
      });
    downloadFile(`ventas_${label}.csv`, toCsv(rows));
  };

  const exportProducts = () => {
    downloadFile(
      `productos_${label}.csv`,
      toCsv([['Producto', 'Categoría', 'Cantidad', 'Total'], ...r.products.map((p) => [p.name, p.category, p.qty, p.total])]),
    );
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Reportes</h1>
        <div className="seg">
          {(['hoy', 'semana', 'mes', 'rango'] as Preset[]).map((p) => (
            <button key={p} className={preset === p ? 'on' : ''} onClick={() => setPreset(p)}>
              {{ hoy: 'Hoy', semana: 'Esta semana', mes: 'Este mes', rango: 'Rango' }[p]}
            </button>
          ))}
        </div>
        {preset === 'rango' && (
          <div className="form-row">
            <label className="field">
              <span>Desde</span>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="field">
              <span>Hasta</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
        )}
      </div>

      <div className="kpis">
        <div className="kpi">
          <span>Total vendido</span>
          <strong>{clp(r.total)}</strong>
          <small>
            neto {clp(r.neto)} · IVA {clp(r.iva)}
          </small>
        </div>
        <div className="kpi">
          <span>Pedidos</span>
          <strong>{r.orders}</strong>
        </div>
        <div className="kpi">
          <span>Ticket promedio</span>
          <strong>{clp(r.avgTicket)}</strong>
        </div>
        <div className="kpi">
          <span>Propinas</span>
          <strong>{clp(r.tips)}</strong>
          <small>no son venta</small>
        </div>
        <div className="kpi">
          <span>Descuentos</span>
          <strong>{clp(r.discounts)}</strong>
        </div>
        <div className="kpi">
          <span>Anulaciones</span>
          <strong>{r.voided.count}</strong>
          <small>{clp(r.voided.total)}</small>
        </div>
      </div>

      <div className="btn-row">
        <button onClick={exportSales}>Descargar ventas (CSV)</button>
        <button onClick={exportProducts}>Descargar productos (CSV)</button>
      </div>

      {r.orders === 0 ? (
        <Empty>No hay ventas en este período.</Empty>
      ) : (
        <>
          {r.byDay.length > 1 && (
            <div className="card">
              <h2>Ventas por día</h2>
              <div className="bars">
                {r.byDay.map((d) => (
                  <div key={d.day} className="bar-row">
                    <span className="bar-label">{d.day.slice(5)}</span>
                    <span className="bar" style={{ width: `${(d.total / maxDay) * 100}%` }} />
                    <span className="bar-val">{clp(d.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="two-col">
            <div className="card">
              <h2>Productos más vendidos</h2>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th className="num">Cant.</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {r.products.slice(0, 15).map((p) => (
                    <tr key={p.name}>
                      <td>{p.name}</td>
                      <td className="num">{p.qty}</td>
                      <td className="num">{clp(p.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <h2>Menos vendidos</h2>
              <table className="tbl">
                <tbody>
                  {least.map((p) => (
                    <tr key={p.name}>
                      <td>{p.name}</td>
                      <td className="num">{p.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted small">Los productos que no se vendieron nada no aparecen.</p>
            </div>
            <div className="card">
              <h2>Por medio de pago</h2>
              <table className="tbl">
                <tbody>
                  {r.byMethod.map((m) => (
                    <tr key={m.method}>
                      <td>{m.method}</td>
                      <td className="num">{clp(m.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted small">Incluye propinas y redondeo, porque es lo que entró por cada medio.</p>
              <h2>Por categoría</h2>
              <table className="tbl">
                <tbody>
                  {r.categories.map((c) => (
                    <tr key={c.name}>
                      <td>{c.name}</td>
                      <td className="num">{c.qty}</td>
                      <td className="num">{clp(c.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <h2>Por usuario</h2>
              <table className="tbl">
                <tbody>
                  {r.byUser.map((u) => (
                    <tr key={u.user}>
                      <td>{u.user}</td>
                      <td className="num">{u.orders}</td>
                      <td className="num">{clp(u.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
