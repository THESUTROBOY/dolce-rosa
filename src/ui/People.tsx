import { useState } from 'react';
import { clp } from '../domain/calc';
import { uid } from '../domain/store';
import type { Promotion, Role, Staff } from '../domain/types';
import { useAction, useAppState, useStore, useUi } from '../state';
import { Empty, MoneyField, Segmented, Sheet } from './kit';

const DAYS = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];

// ---------------- Promociones ----------------
export function PromotionsAdmin() {
  const state = useAppState();
  const store = useStore();
  const run = useAction();
  const { isAdmin } = useUi();
  const [editing, setEditing] = useState<Promotion | null>(null);
  return (
    <div className="admin-pad">
      <p className="hint">Las promociones activas aparecen en cada cuenta en «Aplicar promoción o descuento». Cualquier trabajadora puede aplicarlas; los descuentos manuales solo administración.</p>
      <button className="btn-primary wide" onClick={() => setEditing({ id: uid('pro'), name: '', kind: 'percent', value: 10, productIds: [], categoryIds: [], active: true })}>
        Nueva promoción
      </button>
      {state.promotions.length === 0 ? (
        <Empty title="Sin promociones" />
      ) : (
        <ul className="list">
          {state.promotions.map((p) => (
            <li key={p.id} className="admin-prod">
              <button className="row-btn" onClick={() => setEditing(structuredClone(p))}>
                <span className="row-main">
                  <span className="row-title">{p.name}</span>
                  <span className="row-sub">
                    {p.kind === 'percent' ? `${p.value}%` : clp(p.value)} · {p.productIds.length || p.categoryIds.length ? `${p.productIds.length + p.categoryIds.length} seleccionados` : 'toda la cuenta'}
                    {p.weekdays?.length ? ` · ${p.weekdays.map((d) => DAYS[d]).join(' ')}` : ''}
                  </span>
                </span>
              </button>
              <label className="switch">
                <input type="checkbox" checked={p.active} onChange={(e) => run(() => store.savePromotion(isAdmin, { ...p, active: e.target.checked }))} aria-label={`${p.name} activa`} />
                <span>{p.active ? 'Activa' : 'Inactiva'}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {editing && <PromoSheet promo={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function PromoSheet({ promo, onClose }: { promo: Promotion; onClose(): void }) {
  const state = useAppState();
  const store = useStore();
  const run = useAction();
  const { isAdmin } = useUi();
  const [p, setP] = useState(promo);
  const [scope, setScope] = useState<'cuenta' | 'productos'>(promo.productIds.length || promo.categoryIds.length ? 'productos' : 'cuenta');
  const exists = state.promotions.some((x) => x.id === p.id);
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const cats = [...state.categories].sort((a, b) => a.sort - b.sort);
  return (
    <Sheet
      title={exists ? 'Editar promoción' : 'Nueva promoción'}
      onClose={onClose}
      size="tall"
      footer={
        <button
          className="btn-primary wide"
          onClick={() => {
            const clean = scope === 'cuenta' ? { ...p, productIds: [], categoryIds: [] } : p;
            if (run(() => (store.savePromotion(isAdmin, { ...clean, name: clean.name.trim() }), true), 'Promoción guardada')) onClose();
          }}
        >
          Guardar
        </button>
      }
    >
      <label className="field" htmlFor="pr-name">
        <span>Nombre</span>
        <input id="pr-name" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} placeholder="Ej: Martes de waffles" />
      </label>
      <Segmented<'percent' | 'amount'>
        label="Tipo"
        value={p.kind}
        onChange={(kind) => setP({ ...p, kind })}
        options={[
          { value: 'percent', label: 'Porcentaje' },
          { value: 'amount', label: 'Monto fijo' },
        ]}
      />
      {p.kind === 'percent' ? (
        <label className="field" htmlFor="pr-val">
          <span>Porcentaje de descuento</span>
          <input id="pr-val" inputMode="numeric" value={p.value || ''} onChange={(e) => setP({ ...p, value: Math.min(100, Number(e.target.value.replace(/\D/g, '') || 0)) })} />
        </label>
      ) : (
        <MoneyField id="pr-amt" label={scope === 'productos' ? 'Monto de descuento por unidad' : 'Monto de descuento'} value={p.value} onChange={(value) => setP({ ...p, value })} />
      )}
      <fieldset className="choice">
        <legend>Aplica a</legend>
        <Segmented<'cuenta' | 'productos'>
          label="Alcance"
          value={scope}
          onChange={setScope}
          options={[
            { value: 'cuenta', label: 'Toda la cuenta' },
            { value: 'productos', label: 'Productos o categorías' },
          ]}
        />
        {scope === 'productos' && (
          <div className="promo-pick">
            {cats.map((c) => (
              <details key={c.id} open={p.categoryIds.includes(c.id) || state.products.some((x) => x.categoryId === c.id && p.productIds.includes(x.id))}>
                <summary>
                  <label className="toggle" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={p.categoryIds.includes(c.id)} onChange={() => setP({ ...p, categoryIds: toggle(p.categoryIds, c.id) })} />
                    <span>{c.name} (toda la categoría)</span>
                  </label>
                </summary>
                {state.products
                  .filter((x) => x.categoryId === c.id && !x.archived)
                  .map((x) => (
                    <label key={x.id} className="toggle sub">
                      <input type="checkbox" disabled={p.categoryIds.includes(c.id)} checked={p.categoryIds.includes(c.id) || p.productIds.includes(x.id)} onChange={() => setP({ ...p, productIds: toggle(p.productIds, x.id) })} />
                      <span>{x.name}</span>
                    </label>
                  ))}
              </details>
            ))}
          </div>
        )}
      </fieldset>
      <fieldset className="choice">
        <legend>Días en que vale (ninguno = todos)</legend>
        <div className="chips">
          {DAYS.map((d, i) => {
            const on = p.weekdays?.includes(i);
            return (
              <button key={d} type="button" className={`chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => setP({ ...p, weekdays: on ? p.weekdays!.filter((x) => x !== i) : [...(p.weekdays ?? []), i] })}>
                {d}
              </button>
            );
          })}
        </div>
      </fieldset>
      <label className="toggle">
        <input type="checkbox" checked={p.active} onChange={(e) => setP({ ...p, active: e.target.checked })} />
        <span>Activa</span>
      </label>
      {exists && (
        <button
          className="btn-plain danger"
          onClick={() => {
            if (run(() => (store.deletePromotion(isAdmin, p.id), true), 'Promoción eliminada')) onClose();
          }}
        >
          Eliminar promoción
        </button>
      )}
    </Sheet>
  );
}

// ---------------- Personas y registro ----------------
export function PeopleAdmin() {
  const state = useAppState();
  const store = useStore();
  const run = useAction();
  const { isAdmin } = useUi();
  const [staff, setStaff] = useState<Staff[]>(state.staff);
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(50);
  const set = (i: number, patch: Partial<Staff>) => setStaff(staff.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const norm = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const log = [...state.audit].reverse().filter((e) => !q.trim() || norm(`${e.action} ${e.detail} ${e.by ?? ''}`).includes(norm(q.trim())));
  return (
    <div className="admin-pad">
      <section className="group">
        <h2 className="group-title">Perfiles</h2>
        <p className="hint">Administración entra con su PIN y ve finanzas. Las trabajadoras eligen su nombre en Mesas (sin PIN): queda registrado quién cobra, anota gastos o cierra el turno.</p>
        {staff.map((p, i) => (
          <div key={p.id} className="staff-row">
            <input aria-label="Nombre" placeholder="Nombre" value={p.name} onChange={(e) => set(i, { name: e.target.value })} />
            <select aria-label="Perfil" value={p.role} onChange={(e) => set(i, { role: e.target.value as Role, pin: e.target.value === 'admin' ? (p.pin ?? '') : undefined })}>
              <option value="trabajador">Trabajadora</option>
              <option value="admin">Administración</option>
            </select>
            {p.role === 'admin' ? (
              <input aria-label="PIN" inputMode="numeric" placeholder="PIN" value={p.pin ?? ''} onChange={(e) => set(i, { pin: e.target.value.replace(/\D/g, '').slice(0, 6) })} />
            ) : (
              <span />
            )}
            <label className="toggle">
              <input type="checkbox" checked={p.active} onChange={(e) => set(i, { active: e.target.checked })} />
              <span>Activa</span>
            </label>
          </div>
        ))}
        <div className="btn-pair">
          <button className="btn-secondary" onClick={() => setStaff([...staff, { id: uid('per'), name: '', role: 'trabajador', active: true }])}>
            + Agregar persona
          </button>
          <button className="btn-primary" onClick={() => run(() => store.saveStaff(isAdmin, staff), 'Perfiles guardados')}>
            Guardar perfiles
          </button>
        </div>
      </section>
      <section className="group">
        <h2 className="group-title">Registro de cambios y anulaciones</h2>
        <input className="search" type="search" placeholder="Buscar por persona, acción o detalle" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar en el registro" />
        {log.length === 0 ? (
          <Empty title="Sin registros" />
        ) : (
          <ul className="list audit">
            {log.slice(0, limit).map((e) => (
              <li key={e.id}>
                <div className="audit-head">
                  <strong>{e.action}</strong>
                  <span className="muted">
                    {e.by ?? '—'} · {new Date(e.at).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                </div>
                <div className="audit-detail">{e.detail}</div>
              </li>
            ))}
          </ul>
        )}
        {log.length > limit && (
          <button className="btn-plain" onClick={() => setLimit(limit + 100)}>
            Ver más
          </button>
        )}
      </section>
    </div>
  );
}
