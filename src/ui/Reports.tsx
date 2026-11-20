import { useState } from 'react';
import { clp, dayKey, fmtDay } from '../domain/calc';
import { COST_GROUP_LABEL, costGroup } from '../domain/defaults';
import { change, periodReport, type Bucket, type PeriodReport } from '../domain/reports';
import { PAY_LABEL, TURNO_LABEL } from '../domain/types';
import { canPrint, useAppState } from '../state';
import { downloadFile, Kpi, periodOf, PeriodPicker, previousPeriod, periodLabel, toCsv, type Period } from './kit';

export function Reports() {
  const state = useAppState();
  const today = dayKey(new Date());
  const [period, setPeriod] = useState<Period>(() => periodOf('mes', today));
  const r = periodReport(state, period.from, period.to);
  const prevP = previousPeriod(period);
  const p = periodReport(state, prevP.from, prevP.to);
  const maxCat = Math.max(1, ...r.byCategory.map((c) => c.amount));
  const maxProd = Math.max(1, ...r.products.slice(0, 10).map((x) => x.qty));

  return (
    <div className="admin-pad">
      <PeriodPicker value={period} onChange={setPeriod} today={today} />
      <div className="kpis">
        <Kpi lead label="Total de ventas" value={clp(r.income + r.importedIncome)} sub={<Delta cur={r.income + r.importedIncome} prev={p.income + p.importedIncome} />} />
        <Kpi label="Total de gastos" value={clp(r.expenses)} sub={<Delta cur={r.expenses} prev={p.expenses} invert />} />
        <Kpi label="Balance ingresos − egresos" value={clp(r.operating)} tone={r.operating < 0 ? 'danger' : 'ok'} sub="ventas − comisiones − gastos" />
        <Kpi label="Ticket promedio" value={clp(r.avgTicket)} sub={<Delta cur={r.avgTicket} prev={p.avgTicket} />} />
        <Kpi label="Cuentas" value={r.sales} sub={<Delta cur={r.sales} prev={p.sales} />} />
        <Kpi label="Productos vendidos" value={r.units.toLocaleString('es-CL')} sub={<Delta cur={r.units} prev={p.units} />} />
      </div>
      <p className="hint">Comparado con {periodLabel(prevP)}. Las propinas ({clp(r.tips)}) no son ventas y no están en estos totales.</p>

      <section className="group">
        <h2 className="group-title">Evolución de ingresos y gastos</h2>
        <IncomeChart r={r} />
      </section>

      <div className="split">
        <section className="group">
          <h2 className="group-title">Resultado operacional</h2>
          <ul className="list">
            <li className="kv">
              <span>Ventas sin propina</span>
              <span className="muted">{r.discounts ? `descuentos ${clp(r.discounts)}` : ''}</span>
              <strong>{clp(r.income)}</strong>
            </li>
            {r.importedIncome > 0 && (
              <li className="kv">
                <span>Ingresos del historial importado</span>
                <span />
                <strong>{clp(r.importedIncome)}</strong>
              </li>
            )}
            <li className="kv">
              <span>Comisiones medios de pago</span>
              <span />
              <strong>−{clp(r.fees)}</strong>
            </li>
            {(Object.keys(r.byGroup) as (keyof typeof r.byGroup)[]).map((g) => (
              <li key={g} className="kv">
                <span>{COST_GROUP_LABEL[g]}</span>
                <span className="muted">{r.expenses ? `${Math.round((r.byGroup[g] / r.expenses) * 100)}% de los gastos` : ''}</span>
                <strong>−{clp(r.byGroup[g])}</strong>
              </li>
            ))}
            <li className="kv kv-total">
              <span>Resultado</span>
              <span />
              <strong className={r.operating < 0 ? 'neg' : ''}>{clp(r.operating)}</strong>
            </li>
          </ul>
        </section>
        <section className="group">
          <h2 className="group-title">Flujo de caja</h2>
          <ul className="list">
            {r.cashFlow.map((x) => (
              <li key={x.label} className="kv">
                <span>{x.label}</span>
                <span />
                <strong>{x.amount < 0 ? `−${clp(-x.amount)}` : clp(x.amount)}</strong>
              </li>
            ))}
            <li className="kv kv-total">
              <span>Variación de la caja y el banco</span>
              <span />
              <strong className={r.cashIn - r.cashOut < 0 ? 'neg' : ''}>{clp(r.cashIn - r.cashOut)}</strong>
            </li>
          </ul>
          <p className="hint">El flujo de caja cuenta toda la plata que entra y sale (propinas, préstamos, aportes). El resultado operacional mide solo el negocio.</p>
        </section>
      </div>

      <div className="split">
        <section className="group">
          <h2 className="group-title">Gastos por categoría</h2>
          <div className="bars">
            {r.byCategory.map((c) => (
              <div key={c.category} className="bar-row">
                <span className="bar-label wide-label">{c.category}</span>
                <span className="bar-track">
                  <span className={`bar bar-${costGroup(c.category)}`} style={{ width: `${(c.amount / maxCat) * 100}%` }} />
                </span>
                <span className="bar-val">{clp(c.amount)}</span>
              </div>
            ))}
            {!r.byCategory.length && <p className="hint">Sin gastos en el período.</p>}
          </div>
        </section>
        <section className="group">
          <h2 className="group-title">Medios de pago y turnos</h2>
          <ul className="list">
            {r.byMethod.map((m) => (
              <li key={m.method} className="kv">
                <span>{PAY_LABEL[m.method]}</span>
                <span className="muted">{m.count}</span>
                <strong>{clp(m.amount)}</strong>
              </li>
            ))}
            {r.byTurno.map((t) => (
              <li key={t.turno} className="kv">
                <span>Turno {TURNO_LABEL[t.turno]}</span>
                <span className="muted">{t.count} cuentas</span>
                <strong>{clp(t.total)}</strong>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="group">
        <h2 className="group-title">Productos más vendidos</h2>
        <div className="bars">
          {r.products.slice(0, 10).map((x) => (
            <div key={x.name} className="bar-row">
              <span className="bar-label wide-label">{x.name}</span>
              <span className="bar-track">
                <span className="bar" style={{ width: `${(x.qty / maxProd) * 100}%` }} />
              </span>
              <span className="bar-val">
                {x.qty} u. · {clp(x.total)}
              </span>
            </div>
          ))}
          {!r.products.length && <p className="hint">Sin ventas en el período.</p>}
        </div>
      </section>
      {canPrint && (
        <div className="btn-pair">
          <button
            className="btn-secondary"
            onClick={() => downloadFile(`productos_${r.from}_${r.to}.csv`, toCsv([['Producto', 'Unidades', 'Total'], ...r.products.map((x) => [x.name, x.qty, x.total])]))}
          >
            Productos (CSV)
          </button>
          <button
            className="btn-secondary"
            onClick={() => downloadFile(`ingresos-gastos_${r.from}_${r.to}.csv`, toCsv([['Período', 'Ingresos', 'Gastos'], ...r.series.map((x) => [x.key, x.income, x.expenses])]))}
          >
            Ingresos y gastos (CSV)
          </button>
        </div>
      )}
    </div>
  );
}

function Delta({ cur, prev, invert }: { cur: number; prev: number; invert?: boolean }) {
  const c = change(cur, prev);
  if (c === null) return <span className="muted">sin datos del período anterior</span>;
  const good = invert ? c <= 0 : c >= 0;
  return (
    <span className={good ? 'delta-up' : 'delta-down'}>
      {c > 0 ? '▲' : c < 0 ? '▼' : '='} {Math.abs(c).toLocaleString('es-CL')}% vs. anterior
    </span>
  );
}

const bucketLabel = (k: string, b: Bucket) =>
  b === 'dia' ? fmtDay(k, { day: 'numeric', month: 'short' }) : b === 'semana' ? `sem. ${fmtDay(k, { day: 'numeric', month: 'short' })}` : new Date(k + '-15T12:00').toLocaleDateString('es-CL', { month: 'short', year: '2-digit' });

/** Barras agrupadas: ingresos (burdeos) y gastos (dorado), un solo eje en pesos. */
function IncomeChart({ r }: { r: PeriodReport }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const data = r.series;
  const max = Math.max(1, ...data.map((d) => Math.max(d.income, d.expenses)));
  const nice = niceMax(max);
  const W = 640;
  const H = 220;
  const L = 84;
  const B = 24;
  const T = 8;
  const plotW = W - L - 8;
  const plotH = H - B - T;
  const slot = plotW / Math.max(1, data.length);
  const bw = Math.max(2, Math.min(18, (slot - 6) / 2));
  const y = (v: number) => T + plotH - (v / nice) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((k) => k * nice);
  const every = Math.ceil(data.length / 8);
  const h = hover !== null ? data[hover] : null;
  return (
    <div className="chart">
      <div className="chart-head">
        <div className="legend">
          <span>
            <i className="sw sw-1" /> Ingresos
          </span>
          <span>
            <i className="sw sw-2" /> Gastos
          </span>
        </div>
        <button className="btn-plain small" onClick={() => setTable(!table)}>
          {table ? 'Ver gráfico' : 'Ver tabla'}
        </button>
      </div>
      {table ? (
        <table className="data-table">
          <thead>
            <tr>
              <th>Período</th>
              <th>Ingresos</th>
              <th>Gastos</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.key}>
                <td>{bucketLabel(d.key, r.bucket)}</td>
                <td>{clp(d.income)}</td>
                <td>{clp(d.expenses)}</td>
                <td>{clp(d.income - d.expenses)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="chart-wrap" onMouseLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Ingresos y gastos por período">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={L} x2={W - 8} y1={y(t)} y2={y(t)} className="grid" />
                <text x={L - 6} y={y(t) + 4} className="axis" textAnchor="end">
                  {short(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const x0 = L + i * slot + slot / 2;
              return (
                <g key={d.key} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)}>
                  <rect x={L + i * slot} y={T} width={slot} height={plotH} className={`hit ${hover === i ? 'on' : ''}`} />
                  {d.income > 0 && <path d={bar(x0 - bw - 1, y(d.income), bw, T + plotH - y(d.income))} className="s1" />}
                  {d.expenses > 0 && <path d={bar(x0 + 1, y(d.expenses), bw, T + plotH - y(d.expenses))} className="s2" />}
                  {i % every === 0 && (
                    <text x={x0} y={H - 6} className="axis" textAnchor="middle">
                      {bucketLabel(d.key, r.bucket)}
                    </text>
                  )}
                </g>
              );
            })}
            <line x1={L} x2={W - 8} y1={T + plotH} y2={T + plotH} className="baseline" />
          </svg>
          {h && (
            <div className="tooltip" style={{ left: `${((L + hover! * slot + slot / 2) / W) * 100}%` }}>
              <strong>{bucketLabel(h.key, r.bucket)}</strong>
              <span>
                <i className="sw sw-1" /> Ingresos {clp(h.income)}
              </span>
              <span>
                <i className="sw sw-2" /> Gastos {clp(h.expenses)}
              </span>
              <span className="muted">Balance {clp(h.income - h.expenses)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Barra con las esquinas de arriba redondeadas (4px) y la base recta. */
function bar(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function niceMax(v: number) {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  return [1, 2, 2.5, 5, 10].map((k) => k * p).find((x) => x >= v) ?? v;
}

const short = (v: number) => clp(v);
