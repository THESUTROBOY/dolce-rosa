import { useEffect, useState } from 'react';
import { clp, dayKey, fmtDay } from '../domain/calc';
import { COST_GROUP_LABEL, costGroup, type CostGroup } from '../domain/defaults';
import type { Expense, Fund } from '../domain/types';
import { FUND_LABEL } from '../domain/types';
import { photoUrl, savePhoto } from '../photos';
import { useAction, useAppState, useStore, useUi } from '../state';
import { Chips, Empty, Kpi, MoneyField, periodOf, PeriodPicker, Sheet, type Period } from './kit';
import { ReasonSheet } from './TableView';

export function Expenses() {
  const state = useAppState();
  const { isAdmin, who } = useUi();
  const today = dayKey(new Date());
  const [period, setPeriod] = useState<Period>(() => periodOf('mes', today));
  const [cat, setCat] = useState('');
  const [fund, setFund] = useState<Fund | ''>('');
  const [showVoided, setShowVoided] = useState(false);
  const [editing, setEditing] = useState<Expense | 'new' | null>(null);

  // Las trabajadoras ven solo lo que se anotó hoy; administración ve todo.
  const visible = state.expenses.filter((e) =>
    isAdmin ? e.date >= period.from && e.date <= period.to && (!cat || e.category === cat) && (!fund || e.fund === fund) && (showVoided || !e.voided) : dayKey(e.createdAt) === today && !e.voided,
  );
  const list = [...visible].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const live = list.filter((e) => !e.voided);
  const total = live.reduce((a, e) => a + e.amount, 0);
  const byGroup = (g: CostGroup) => live.filter((e) => costGroup(e.category) === g).reduce((a, e) => a + e.amount, 0);
  const byCat = state.settings.expenseCategories.map((c) => ({ c, amount: live.filter((e) => e.category === c).reduce((a, e) => a + e.amount, 0) })).filter((x) => x.amount);
  const maxCat = Math.max(1, ...byCat.map((x) => x.amount));

  return (
    <div className="screen">
      <header className="large-title with-action">
        <div>
          <h1>Gastos</h1>
          <p className="subtitle">{isAdmin ? 'Compras y salidas de dinero del negocio' : `Gastos anotados hoy${who ? ` · atiende ${who}` : ''}`}</p>
        </div>
        <button className="btn-primary" onClick={() => setEditing('new')}>
          + Nuevo gasto
        </button>
      </header>

      {isAdmin && (
        <div className="admin-pad">
          <PeriodPicker value={period} onChange={setPeriod} today={today} />
          <div className="kpis">
            <Kpi lead label="Total gastos" value={clp(total)} sub={`${live.length} ${live.length === 1 ? 'gasto' : 'gastos'}`} />
            <Kpi label={COST_GROUP_LABEL.fijo} value={clp(byGroup('fijo'))} />
            <Kpi label={COST_GROUP_LABEL.variable} value={clp(byGroup('variable'))} />
            <Kpi label={COST_GROUP_LABEL.extraordinario} value={clp(byGroup('extraordinario'))} />
          </div>
          {byCat.length > 0 && (
            <section className="group">
              <h2 className="group-title">Por categoría</h2>
              <div className="bars">
                {byCat.map((x) => (
                  <button key={x.c} className={`bar-row bar-btn ${cat === x.c ? 'on' : ''}`} onClick={() => setCat(cat === x.c ? '' : x.c)} aria-pressed={cat === x.c}>
                    <span className="bar-label wide-label">{x.c}</span>
                    <span className="bar-track">
                      <span className={`bar bar-${costGroup(x.c)}`} style={{ width: `${(x.amount / maxCat) * 100}%` }} />
                    </span>
                    <span className="bar-val">{clp(x.amount)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
          <div className="filters">
            <select aria-label="Categoría" value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="">Todas las categorías</option>
              {state.settings.expenseCategories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <select aria-label="Fondo" value={fund} onChange={(e) => setFund(e.target.value as Fund | '')}>
              <option value="">Efectivo y banco</option>
              <option value="efectivo">{FUND_LABEL.efectivo}</option>
              <option value="banco">{FUND_LABEL.banco}</option>
            </select>
            <label className="toggle">
              <input type="checkbox" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} />
              <span>Ver anulados</span>
            </label>
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <Empty title="Sin gastos">{isAdmin ? 'No hay gastos en este período.' : 'Si pagaste algo con plata de la caja, anótalo aquí con su boleta.'}</Empty>
      ) : (
        <ul className="list exp-list">
          {list.map((e) => (
            <li key={e.id} className={e.voided ? 'voided' : ''}>
              <button className="row-btn" onClick={() => setEditing(e)}>
                <span className="row-main">
                  <span className="row-title">
                    {e.description}
                    {e.photo && (
                      <span className="pill tag-gap" title="Con foto">
                        foto
                      </span>
                    )}
                    {e.voided && <span className="pill pill-danger tag-gap">Anulado</span>}
                  </span>
                  <span className="row-sub">
                    {fmtDay(e.date)} · {e.category.replace(/^.* - /, '')} · {e.fund === 'efectivo' ? 'caja' : 'banco'} · {e.docType}
                    {e.docNumber ? ` ${e.docNumber}` : ''}
                  </span>
                </span>
                <span className="row-price">{clp(e.amount)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && <ExpenseSheet expense={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ExpenseSheet({ expense, onClose }: { expense?: Expense; onClose(): void }) {
  const state = useAppState();
  const store = useStore();
  const run = useAction();
  const { isAdmin, toast } = useUi();
  const st = state.settings;
  const readOnly = !!expense && (!isAdmin || !!expense.voided);
  const [e, setE] = useState<Omit<Expense, 'id' | 'createdAt' | 'by'>>(
    () =>
      expense ?? {
        date: dayKey(new Date()),
        description: '',
        category: '',
        amount: 0,
        method: st.expenseMethods[0],
        fund: /efectivo/i.test(st.expenseMethods[0]) ? 'efectivo' : 'banco',
        docType: st.docTypes[0],
        docNumber: '',
        notes: '',
      },
  );
  const [busy, setBusy] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null;
    if (e.photo) photoUrl(e.photo).then((x) => setUrl((u = x)));
    else setUrl(null);
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [e.photo]);

  const save = () => {
    const ok = expense ? run(() => (store.updateExpense(isAdmin, { ...expense, ...e }), true), 'Gasto actualizado') : run(() => (store.addExpense(e), true), 'Gasto anotado');
    if (ok) onClose();
  };

  return (
    <Sheet
      title={expense ? (readOnly ? expense.description : 'Editar gasto') : 'Nuevo gasto'}
      onClose={onClose}
      size="tall"
      footer={
        !readOnly && (
          <button className="btn-primary wide" disabled={busy} onClick={save}>
            {expense ? 'Guardar cambios' : `Anotar gasto${e.amount ? ` · ${clp(e.amount)}` : ''}`}
          </button>
        )
      }
    >
      <fieldset disabled={readOnly} className="plain-fieldset">
        <div className="field-row">
          <label className="field grow" htmlFor="g-date">
            <span>Fecha</span>
            <input id="g-date" type="date" value={e.date} max={dayKey(new Date())} onChange={(x) => setE({ ...e, date: x.target.value })} />
          </label>
          <MoneyField id="g-amount" label="Monto" value={e.amount} onChange={(amount) => setE({ ...e, amount })} />
        </div>
        <label className="field" htmlFor="g-desc">
          <span>Descripción del gasto</span>
          <input id="g-desc" value={e.description} onChange={(x) => setE({ ...e, description: x.target.value })} placeholder="Ej: leche y crema para la semana" />
        </label>
        <label className="field" htmlFor="g-cat">
          <span>Categoría (del contador)</span>
          <select id="g-cat" value={e.category} onChange={(x) => setE({ ...e, category: x.target.value })}>
            <option value="">Elige una categoría</option>
            {st.expenseCategories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <fieldset className="choice">
          <legend>Método de pago</legend>
          <Chips label="Método de pago" value={e.method} options={st.expenseMethods.map((m) => ({ value: m, label: m }))} onChange={(method) => setE({ ...e, method, fund: /efectivo/i.test(method) ? 'efectivo' : 'banco' })} />
        </fieldset>
        <fieldset className="choice">
          <legend>Se pagó desde</legend>
          <Chips
            label="Fondo"
            value={e.fund}
            options={[
              { value: 'efectivo', label: FUND_LABEL.efectivo },
              { value: 'banco', label: FUND_LABEL.banco },
            ]}
            onChange={(fund) => setE({ ...e, fund: fund as Fund })}
          />
          <p className="hint">El monto se descuenta automáticamente de este fondo.</p>
        </fieldset>
        <fieldset className="choice">
          <legend>Documento</legend>
          <Chips label="Tipo de documento" value={e.docType} options={st.docTypes.map((m) => ({ value: m, label: m }))} onChange={(docType) => setE({ ...e, docType })} />
          <label className="field" htmlFor="g-doc">
            <span>N° de documento (opcional)</span>
            <input id="g-doc" value={e.docNumber ?? ''} onChange={(x) => setE({ ...e, docNumber: x.target.value })} />
          </label>
        </fieldset>
        <fieldset className="choice">
          <legend>Foto de la boleta o factura (opcional)</legend>
          {url && <img className="receipt-photo" src={url} alt="Foto del documento" />}
          {!readOnly && (
            <label className="btn-secondary file-btn">
              {busy ? 'Procesando foto…' : e.photo ? 'Cambiar foto' : 'Sacar o elegir foto'}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={async (x) => {
                  const f = x.target.files?.[0];
                  if (!f) return;
                  setBusy(true);
                  try {
                    const k = await savePhoto(f);
                    setE((cur) => ({ ...cur, photo: k }));
                  } catch {
                    toast('No se pudo guardar la foto', 'error');
                  }
                  setBusy(false);
                  x.target.value = '';
                }}
              />
            </label>
          )}
        </fieldset>
        <label className="field" htmlFor="g-notes">
          <span>Observaciones</span>
          <input id="g-notes" value={e.notes} onChange={(x) => setE({ ...e, notes: x.target.value })} />
        </label>
      </fieldset>
      {expense && (
        <p className="hint">
          Anotado por {expense.by} el {new Date(expense.createdAt).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}
          {expense.voided && ` · Anulado por ${expense.voided.by}: ${expense.voided.reason}`}
        </p>
      )}
      {expense && isAdmin && !expense.voided && (
        <button className="btn-plain danger" onClick={() => setVoiding(true)}>
          Anular gasto
        </button>
      )}
      {voiding && expense && (
        <ReasonSheet
          title={`Anular ${expense.description}`}
          onClose={() => setVoiding(false)}
          onConfirm={(r) => {
            if (run(() => (store.voidExpense(isAdmin, expense.id, r), true), 'Gasto anulado')) onClose();
          }}
        />
      )}
    </Sheet>
  );
}
