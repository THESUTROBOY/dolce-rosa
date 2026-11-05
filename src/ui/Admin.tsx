import { useState } from 'react';
import { clp, dayKey, summarize } from '../domain/calc';
import { demoState } from '../domain/demo';
import { seedState } from '../domain/seed';
import { uid } from '../domain/store';
import type { AppState, Category, Option, Product, Settings, Station, TableDef } from '../domain/types';
import { STATION_LABEL } from '../domain/types';
import { canPrint, useAction, useAppState, useStore, useUi } from '../state';
import { downloadFile, MoneyField, PinPad, Segmented, Sheet, toCsv } from './kit';

type Section = 'home' | 'reportes' | 'carta' | 'mesas' | 'ajustes' | 'datos';

export function Admin() {
  const store = useStore();
  const { isAdmin, setAdmin, toast } = useUi();
  const [error, setError] = useState('');
  const [section, setSection] = useState<Section>('home');

  if (!isAdmin) {
    return (
      <div className="screen screen-pin">
        <header className="large-title center">
          <h1>Modo administrador</h1>
          <p className="subtitle">Ingresa el PIN para ver reportes, editar el menú, las mesas y los turnos.</p>
        </header>
        <PinPad
          error={error}
          onSubmit={(pin) => {
            if (store.checkPin(pin)) {
              setError('');
              setAdmin(true);
              toast('Modo administrador activo');
            } else {
              setError('PIN incorrecto');
              navigator.vibrate?.([20, 40, 20]);
            }
          }}
        />
        <p className="hint center">PIN de prueba: 1234</p>
      </div>
    );
  }

  if (section !== 'home') {
    const titles: Record<Exclude<Section, 'home'>, string> = {
      reportes: 'Reportes',
      carta: 'Menú',
      mesas: 'Mesas',
      ajustes: 'Turnos, cobro y PIN',
      datos: 'Datos y respaldo',
    };
    return (
      <div className="screen">
        <header className="nav-bar">
          <button className="back" onClick={() => setSection('home')}>
            <span aria-hidden>‹</span> Configurar
          </button>
          <div className="nav-title">
            <strong>{titles[section]}</strong>
          </div>
          <span className="nav-spacer" />
        </header>
        {section === 'reportes' && <Reports />}
        {section === 'carta' && <MenuAdmin />}
        {section === 'mesas' && <TablesAdmin />}
        {section === 'ajustes' && <SettingsAdmin />}
        {section === 'datos' && <DataAdmin />}
      </div>
    );
  }

  const items: { s: Exclude<Section, 'home'>; title: string; sub: string }[] = [
    { s: 'reportes', title: 'Reportes', sub: 'Ventas por día, turno, estación y producto' },
    { s: 'carta', title: 'Menú', sub: 'Productos, precios, extras, agotados y estación' },
    { s: 'mesas', title: 'Mesas', sub: 'Agregar, renombrar o quitar mesas' },
    { s: 'ajustes', title: 'Turnos, cobro y PIN', sub: 'Hora de cambio de turno, propina, medios de pago' },
    { s: 'datos', title: 'Datos y respaldo', sub: 'Datos de prueba, respaldo y empezar de cero' },
  ];
  return (
    <div className="screen">
      <header className="large-title">
        <h1>Configurar</h1>
        <p className="subtitle">Modo administrador · ves y editas todos los datos</p>
      </header>
      <ul className="list nav-list">
        {items.map((i) => (
          <li key={i.s}>
            <button className="row-btn" onClick={() => setSection(i.s)}>
              <span className="row-main">
                <span className="row-title">{i.title}</span>
                <span className="row-sub">{i.sub}</span>
              </span>
              <span className="chev" aria-hidden>
                ›
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="actions">
        <button className="btn-secondary wide" onClick={() => setAdmin(false)}>
          Salir del modo administrador
        </button>
      </div>
    </div>
  );
}

// ---------------- Reportes ----------------
type Range = 'hoy' | '7d' | '30d' | 'mes';

function Reports() {
  const state = useAppState();
  const [range, setRange] = useState<Range>('7d');
  const today = new Date();
  const back = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return dayKey(d);
  };
  const from = range === 'hoy' ? dayKey(today) : range === '7d' ? back(6) : range === '30d' ? back(29) : dayKey(new Date(today.getFullYear(), today.getMonth(), 1));
  const to = dayKey(today);
  const s = summarize(state, from, to);
  const maxDay = Math.max(1, ...s.byDay.map((d) => d.total));
  const stationTotal = s.byStation.reduce((a, b) => a + b.total, 0) || 1;

  return (
    <div className="admin-pad">
      <Segmented<Range>
        label="Período"
        value={range}
        onChange={setRange}
        options={[
          { value: 'hoy', label: 'Hoy' },
          { value: '7d', label: '7 días' },
          { value: '30d', label: '30 días' },
          { value: 'mes', label: 'Este mes' },
        ]}
      />
      <div className="kpis">
        <div className="kpi kpi-lead">
          <span>Consumo</span>
          <strong>{clp(s.total)}</strong>
          <small>
            neto {clp(s.neto)} · IVA {clp(s.iva)}
          </small>
        </div>
        <div className="kpi">
          <span>Cuentas</span>
          <strong>{s.count}</strong>
          <small>{s.voided ? `${s.voided} anuladas` : 'sin anulaciones'}</small>
        </div>
        <div className="kpi">
          <span>Ticket promedio</span>
          <strong>{clp(s.avg)}</strong>
        </div>
        <div className="kpi">
          <span>Propinas</span>
          <strong>{clp(s.tips)}</strong>
        </div>
      </div>

      {s.byDay.length > 1 && (
        <section className="group">
          <h2 className="group-title">Por día</h2>
          <div className="bars">
            {s.byDay.map((d) => (
              <div key={d.day} className="bar-row">
                <span className="bar-label">{new Date(d.day + 'T12:00').toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric' })}</span>
                <span className="bar-track">
                  <span className="bar" style={{ width: `${(d.total / maxDay) * 100}%` }} />
                </span>
                <span className="bar-val">{clp(d.total)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="split">
        <section className="group">
          <h2 className="group-title">Por turno</h2>
          <ul className="list">
            {s.byTurno.map((t) => (
              <li key={t.turno} className="kv">
                <span className="cap">{t.turno}</span>
                <span className="muted">{t.count} cuentas</span>
                <strong>{clp(t.total)}</strong>
              </li>
            ))}
          </ul>
        </section>
        <section className="group">
          <h2 className="group-title">Por estación</h2>
          <ul className="list">
            {s.byStation.map((t) => (
              <li key={t.station} className="kv">
                <span>{STATION_LABEL[t.station as Station]}</span>
                <span className="muted">{Math.round((t.total / stationTotal) * 100)}%</span>
                <strong>{clp(t.total)}</strong>
              </li>
            ))}
          </ul>
        </section>
        <section className="group">
          <h2 className="group-title">Por medio de pago</h2>
          <ul className="list">
            {s.byMethod.map((m) => (
              <li key={m.method} className="kv">
                <span>{m.method}</span>
                <span className="muted">{m.count}</span>
                <strong>{clp(m.amount)}</strong>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="group">
        <h2 className="group-title">Más vendidos</h2>
        <ol className="list rank">
          {s.products.slice(0, 10).map((p) => (
            <li key={p.name} className="kv">
              <span>{p.name}</span>
              <span className="muted">{p.qty} u.</span>
              <strong>{clp(p.total)}</strong>
            </li>
          ))}
        </ol>
      </section>
      <section className="group">
        <h2 className="group-title">Menos vendidos</h2>
        <ul className="list">
          {[...s.products]
            .reverse()
            .slice(0, 5)
            .map((p) => (
              <li key={p.name} className="kv">
                <span>{p.name}</span>
                <span className="muted">{p.qty} u.</span>
                <strong>{clp(p.total)}</strong>
              </li>
            ))}
        </ul>
      </section>
      {canPrint && (
        <button
          className="btn-secondary wide"
          onClick={() => downloadFile(`productos_${from}_${to}.csv`, toCsv([['Producto', 'Unidades', 'Total'], ...s.products.map((p) => [p.name, p.qty, p.total])]))}
        >
          Descargar productos (CSV)
        </button>
      )}
    </div>
  );
}

// ---------------- Menú ----------------
function MenuAdmin() {
  const state = useAppState();
  const store = useStore();
  const run = useAction();
  const { isAdmin, toast } = useUi();
  const [editing, setEditing] = useState<Product | null>(null);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const cats = [...state.categories].sort((a, b) => a.sort - b.sort);
  const blank = (categoryId: string): Product => ({ id: uid('prod'), categoryId, name: '', description: '', price: 0, variants: [], extras: [], soldOut: false, archived: false });

  return (
    <div className="admin-pad">
      <div className="btn-pair">
        <button className="btn-secondary" onClick={() => setEditingCat({ id: uid('cat'), name: '', sort: cats.length, station: 'barra' })}>
          Nueva categoría
        </button>
        <button className="btn-primary" disabled={!cats.length} onClick={() => setEditing(blank(cats[0].id))}>
          Nuevo producto
        </button>
      </div>
      {cats.map((c) => (
        <section key={c.id} className="group">
          <h2 className="group-title">
            <button className="title-btn" onClick={() => setEditingCat(c)}>
              {c.name}
            </button>
            <span className={`station-tag st-${c.station}`}>{STATION_LABEL[c.station]}</span>
          </h2>
          <ul className="list">
            {state.products
              .filter((p) => p.categoryId === c.id && !p.archived)
              .map((p) => (
                <li key={p.id} className="admin-prod">
                  <button className="row-btn" onClick={() => setEditing(structuredClone(p))}>
                    <span className="row-main">
                      <span className="row-title">{p.name}</span>
                      <span className="row-sub">
                        {p.variants.length ? p.variants.map((v) => `${v.name} ${clp(v.price)}`).join(' · ') : clp(p.price)}
                        {p.extras.length ? ` · ${p.extras.length} extras` : ''}
                      </span>
                    </span>
                  </button>
                  <label className="switch" title="Agotado">
                    <input type="checkbox" checked={p.soldOut} onChange={(e) => run(() => store.setSoldOut(isAdmin, p.id, e.target.checked))} aria-label={`${p.name} agotado`} />
                    <span>Agotado</span>
                  </label>
                </li>
              ))}
          </ul>
        </section>
      ))}
      {editing && (
        <ProductSheet
          product={editing}
          categories={cats}
          onClose={() => setEditing(null)}
          onSave={(p) => {
            if (run(() => (store.saveProduct(isAdmin, p), true), 'Producto guardado')) setEditing(null);
          }}
          onRemove={
            state.products.some((x) => x.id === editing.id)
              ? () => {
                  const r = run(() => store.removeProduct(isAdmin, editing.id));
                  if (r) {
                    toast(r === 'archivado' ? 'Tiene ventas: quedó archivado' : 'Producto eliminado');
                    setEditing(null);
                  }
                }
              : undefined
          }
        />
      )}
      {editingCat && (
        <CategorySheet
          cat={editingCat}
          onClose={() => setEditingCat(null)}
          onSave={(c) => {
            if (run(() => (store.saveCategory(isAdmin, c), true), 'Categoría guardada')) setEditingCat(null);
          }}
          onDelete={
            state.categories.some((x) => x.id === editingCat.id)
              ? () => {
                  if (run(() => (store.deleteCategory(isAdmin, editingCat.id), true), 'Categoría eliminada')) setEditingCat(null);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

function CategorySheet({ cat, onClose, onSave, onDelete }: { cat: Category; onClose(): void; onSave(c: Category): void; onDelete?(): void }) {
  const [c, setC] = useState(cat);
  return (
    <Sheet
      title={cat.name ? 'Editar categoría' : 'Nueva categoría'}
      onClose={onClose}
      footer={
        <button className="btn-primary wide" onClick={() => onSave({ ...c, name: c.name.trim() })}>
          Guardar
        </button>
      }
    >
      <label className="field" htmlFor="cat-name">
        <span>Nombre</span>
        <input id="cat-name" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} />
      </label>
      <fieldset className="choice">
        <legend>Se prepara en</legend>
        <Segmented<Station>
          label="Estación"
          value={c.station}
          onChange={(station) => setC({ ...c, station })}
          options={[
            { value: 'barra', label: 'Cafetería y preparados' },
            { value: 'cocina', label: 'Cocina' },
          ]}
        />
        <p className="hint">Los productos de esta categoría se envían a esa comanda.</p>
      </fieldset>
      {onDelete && (
        <button className="btn-plain danger" onClick={onDelete}>
          Eliminar categoría
        </button>
      )}
    </Sheet>
  );
}

function OptionEditor({ label, hint, items, onChange, prefix }: { label: string; hint: string; items: Option[]; onChange(o: Option[]): void; prefix: string }) {
  return (
    <fieldset className="choice">
      <legend>{label}</legend>
      <p className="hint">{hint}</p>
      {items.map((o, i) => (
        <div className="opt-edit" key={i}>
          <input id={`${prefix}-n-${i}`} aria-label="Nombre" placeholder="Nombre" value={o.name} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
          <input
            id={`${prefix}-p-${i}`}
            aria-label="Precio"
            inputMode="numeric"
            placeholder="$0"
            value={o.price ? '$' + o.price.toLocaleString('es-CL') : ''}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, price: Number(e.target.value.replace(/\D/g, '') || 0) } : x)))}
          />
          <button className="btn-plain danger" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Quitar">
            Quitar
          </button>
        </div>
      ))}
      <button className="btn-plain" onClick={() => onChange([...items, { name: '', price: 0 }])}>
        + Agregar
      </button>
    </fieldset>
  );
}

function ProductSheet({ product, categories, onClose, onSave, onRemove }: { product: Product; categories: Category[]; onClose(): void; onSave(p: Product): void; onRemove?(): void }) {
  const [p, setP] = useState(product);
  return (
    <Sheet
      title={product.name || 'Nuevo producto'}
      onClose={onClose}
      size="tall"
      footer={
        <button
          className="btn-primary wide"
          onClick={() => {
            const variants = p.variants.filter((v) => v.name.trim());
            onSave({
              ...p,
              name: p.name.trim(),
              variants,
              extras: p.extras.filter((v) => v.name.trim()),
              price: variants.length ? Math.min(...variants.map((v) => v.price)) : p.price,
            });
          }}
        >
          Guardar producto
        </button>
      }
    >
      <label className="field" htmlFor="p-name">
        <span>Nombre</span>
        <input id="p-name" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
      </label>
      <label className="field" htmlFor="p-desc">
        <span>Descripción (opcional)</span>
        <input id="p-desc" value={p.description} onChange={(e) => setP({ ...p, description: e.target.value })} />
      </label>
      <label className="field" htmlFor="p-cat">
        <span>Categoría</span>
        <select id="p-cat" value={p.categoryId} onChange={(e) => setP({ ...p, categoryId: e.target.value })}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.station === 'cocina' ? 'Cocina' : 'Barra'})
            </option>
          ))}
        </select>
      </label>
      {p.variants.length === 0 && <MoneyField id="p-price" label="Precio con IVA" value={p.price} onChange={(price) => setP({ ...p, price })} />}
      <OptionEditor prefix="var" label="Tamaños o variantes" hint="Cada uno con su precio final. Si agregas tamaños, reemplazan al precio único." items={p.variants} onChange={(variants) => setP({ ...p, variants })} />
      <OptionEditor prefix="ext" label="Extras" hint="Se suman al precio. Ej: leche vegetal +$600." items={p.extras} onChange={(extras) => setP({ ...p, extras })} />
      {onRemove && (
        <button className="btn-plain danger" onClick={onRemove}>
          Quitar del menú
        </button>
      )}
    </Sheet>
  );
}

// ---------------- Mesas ----------------
function TablesAdmin() {
  const state = useAppState();
  const store = useStore();
  const run = useAction();
  const { isAdmin } = useUi();
  const [tables, setTables] = useState<TableDef[]>(state.tables);
  return (
    <div className="admin-pad">
      <ul className="list">
        {tables.map((t, i) => (
          <li key={t.id} className="opt-edit">
            <input id={`mesa-${t.id}`} aria-label="Nombre de la mesa" value={t.name} onChange={(e) => setTables(tables.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <button className="btn-plain danger" onClick={() => setTables(tables.filter((_, j) => j !== i))}>
              Quitar
            </button>
          </li>
        ))}
      </ul>
      <div className="btn-pair">
        <button className="btn-secondary" onClick={() => setTables([...tables, { id: uid('mesa'), name: `Mesa ${tables.length + 1}` }])}>
          Agregar mesa
        </button>
        <button className="btn-primary" onClick={() => run(() => store.saveTables(isAdmin, tables), 'Mesas guardadas')}>
          Guardar
        </button>
      </div>
    </div>
  );
}

// ---------------- Ajustes ----------------
function SettingsAdmin() {
  const state = useAppState();
  const store = useStore();
  const run = useAction();
  const { isAdmin } = useUi();
  const [s, setS] = useState<Settings>(state.settings);
  const [methods, setMethods] = useState(state.settings.paymentMethods.join(', '));
  const text = (k: 'businessName' | 'address' | 'phone' | 'footer', label: string) => (
    <label className="field" htmlFor={`set-${k}`}>
      <span>{label}</span>
      <input id={`set-${k}`} value={s[k]} onChange={(e) => setS({ ...s, [k]: e.target.value })} />
    </label>
  );
  return (
    <div className="admin-pad">
      <section className="group">
        <h2 className="group-title">Turnos</h2>
        <label className="field" htmlFor="set-turno">
          <span>El turno de la tarde empieza a las</span>
          <select id="set-turno" value={s.afternoonStartsAt} onChange={(e) => setS({ ...s, afternoonStartsAt: Number(e.target.value) })}>
            {Array.from({ length: 12 }, (_, i) => i + 10).map((h) => (
              <option key={h} value={h}>
                {h}:00
              </option>
            ))}
          </select>
        </label>
        <p className="hint">Cada detalle de cuenta queda en el turno de la hora en que se emite.</p>
      </section>
      <section className="group">
        <h2 className="group-title">Cobro</h2>
        <label className="field" htmlFor="set-tip">
          <span>Propina sugerida (%)</span>
          <input id="set-tip" inputMode="numeric" value={s.tipPercent} onChange={(e) => setS({ ...s, tipPercent: Math.min(30, Number(e.target.value.replace(/\D/g, '') || 0)) })} />
        </label>
        <label className="field" htmlFor="set-methods">
          <span>Medios de pago (separados por coma)</span>
          <input id="set-methods" value={methods} onChange={(e) => setMethods(e.target.value)} />
        </label>
      </section>
      <section className="group">
        <h2 className="group-title">Detalle de cuenta</h2>
        {text('businessName', 'Nombre del local')}
        {text('address', 'Dirección')}
        {text('phone', 'Teléfono o Instagram')}
        {text('footer', 'Texto al pie')}
      </section>
      <section className="group">
        <h2 className="group-title">PIN de administración</h2>
        <label className="field" htmlFor="set-pin">
          <span>De 4 a 6 números</span>
          <input id="set-pin" inputMode="numeric" value={s.adminPin} onChange={(e) => setS({ ...s, adminPin: e.target.value.replace(/\D/g, '').slice(0, 6) })} />
        </label>
      </section>
      <button
        className="btn-primary wide"
        onClick={() =>
          run(
            () =>
              store.saveSettings(isAdmin, {
                ...s,
                paymentMethods: methods
                  .split(',')
                  .map((m) => m.trim())
                  .filter(Boolean),
              }),
            'Cambios guardados',
          )
        }
      >
        Guardar cambios
      </button>
    </div>
  );
}

// ---------------- Datos ----------------
function DataAdmin() {
  const store = useStore();
  const run = useAction();
  const { isAdmin } = useUi();
  const [confirm, setConfirm] = useState<'demo' | 'vacio' | null>(null);
  const replace = (s: AppState, msg: string) => {
    run(() => store.replaceAll(isAdmin, s), msg);
    setConfirm(null);
  };
  return (
    <div className="admin-pad">
      <section className="group">
        <h2 className="group-title">Datos de prueba</h2>
        <p className="hint">Carga un mes de cuentas de ejemplo con mesas abiertas y comandas en cocina, o deja la app vacía con el menú base. Reemplaza todo lo que hay en este equipo.</p>
        {confirm ? (
          <div className="confirm-box">
            <p>¿Reemplazar los datos actuales? Esto no se puede deshacer.</p>
            <div className="btn-pair">
              <button className="btn-secondary" onClick={() => setConfirm(null)}>
                Cancelar
              </button>
              <button className="btn-danger" onClick={() => (confirm === 'demo' ? replace(demoState(), 'Datos de prueba cargados') : replace(seedState(), 'App vacía, lista para usar'))}>
                Sí, reemplazar
              </button>
            </div>
          </div>
        ) : (
          <div className="btn-pair">
            <button className="btn-secondary" onClick={() => setConfirm('demo')}>
              Cargar datos de prueba
            </button>
            <button className="btn-secondary danger" onClick={() => setConfirm('vacio')}>
              Empezar desde cero
            </button>
          </div>
        )}
      </section>
      <section className="group">
        <h2 className="group-title">Respaldo</h2>
        <p className="hint">Por ahora los datos viven en este equipo. Descarga un respaldo al cierre del día; con la base de datos en la nube será automático.</p>
        {canPrint ? (
          <div className="btn-pair">
            <button className="btn-secondary" onClick={() => downloadFile(`dolce-rosa-${dayKey(new Date())}.json`, JSON.stringify(store.get()), 'application/json')}>
              Descargar respaldo
            </button>
            <label className="btn-secondary file-btn">
              Restaurar
              <input
                type="file"
                accept="application/json"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const text = await f.text();
                  run(() => store.replaceAll(isAdmin, JSON.parse(text)), 'Respaldo restaurado');
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        ) : (
          <p className="hint">Disponible en la app publicada (la vista de demo no permite descargar archivos).</p>
        )}
      </section>
    </div>
  );
}
