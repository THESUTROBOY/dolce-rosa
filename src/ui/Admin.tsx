import { useState } from 'react';
import { clp, dayKey, summarize } from '../domain/calc';
import { demoState } from '../domain/demo';
import { seedState } from '../domain/seed';
import { uid } from '../domain/store';
import type { AppState, Category, ChoiceGroup, Option, Product, Settings, Station, TableDef } from '../domain/types';
import { STATION_LABEL } from '../domain/types';
import { canPrint, useAction, useAppState, useStore, useUi, useWide } from '../state';
import { downloadFile, MoneyField, PinPad, Segmented, Sheet, Stepper, toCsv } from './kit';
import { FlavorsEditor } from './TableView';

type Section = 'home' | 'reportes' | 'carta' | 'mesas' | 'ajustes' | 'datos';

export function Admin() {
  const store = useStore();
  const { isAdmin, setAdmin, toast } = useUi();
  const [error, setError] = useState('');
  const [section, setSection] = useState<Section>('home');
  const wide = useWide();

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

  const titles: Record<Exclude<Section, 'home'>, string> = {
    reportes: 'Reportes',
    carta: 'Menú',
    mesas: 'Mesas',
    ajustes: 'Turnos, cobro y PIN',
    datos: 'Datos y respaldo',
  };
  const content = (s: Exclude<Section, 'home'>) => (
    <>
      {s === 'reportes' && <Reports />}
      {s === 'carta' && <MenuAdmin />}
      {s === 'mesas' && <TablesAdmin />}
      {s === 'ajustes' && <SettingsAdmin />}
      {s === 'datos' && <DataAdmin />}
    </>
  );
  const items: { s: Exclude<Section, 'home'>; title: string; sub: string }[] = [
    { s: 'reportes', title: 'Reportes', sub: 'Ventas por día, turno, estación y producto' },
    { s: 'carta', title: 'Menú', sub: 'Productos, precios, extras, agotados y estación' },
    { s: 'mesas', title: 'Mesas', sub: 'Agregar, renombrar, ordenar o quitar mesas' },
    { s: 'ajustes', title: 'Turnos, cobro y PIN', sub: 'Hora de cambio de turno, propina, medios de pago' },
    { s: 'datos', title: 'Datos y respaldo', sub: 'Datos de prueba, respaldo y empezar de cero' },
  ];

  // En el computador: lista de secciones a la izquierda y la sección abierta a la derecha.
  if (wide) {
    const cur = section === 'home' ? 'reportes' : section;
    return (
      <div className="screen admin-split">
        <aside className="admin-side">
          <header className="large-title">
            <h1>Configurar</h1>
            <p className="subtitle">Modo administrador</p>
          </header>
          <ul className="list nav-list">
            {items.map((i) => (
              <li key={i.s}>
                <button className={`row-btn ${cur === i.s ? 'on' : ''}`} aria-current={cur === i.s ? 'page' : undefined} onClick={() => setSection(i.s)}>
                  <span className="row-main">
                    <span className="row-title">{i.title}</span>
                    <span className="row-sub">{i.sub}</span>
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
        </aside>
        <section className="admin-main" aria-label={titles[cur]}>
          <header className="large-title">
            <h1>{titles[cur]}</h1>
          </header>
          {content(cur)}
        </section>
      </div>
    );
  }

  if (section !== 'home') {
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
        {content(section)}
      </div>
    );
  }

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
  const [q, setQ] = useState('');
  const cats = [...state.categories].sort((a, b) => a.sort - b.sort);
  const norm = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const match = (p: Product) => !q.trim() || norm(p.name).includes(norm(q.trim()));
  const archived = state.products.filter((p) => p.archived && match(p));
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
      <details className="flavors-admin">
        <summary>Sabores de helado ({(state.settings.iceCreamFlavors ?? []).length})</summary>
        <FlavorsEditor />
      </details>
      <input className="search admin-search" type="search" placeholder="Buscar producto" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar producto" />
      <p className="hint">Toca un producto para cambiar su nombre, precio o extras, o para quitarlo. Toca el nombre de una categoría para editarla.</p>
      {cats.map((c) => (
        <section key={c.id} className="group" hidden={!!q.trim() && !state.products.some((p) => p.categoryId === c.id && !p.archived && match(p))}>
          <h2 className="group-title">
            <button className="title-btn" onClick={() => setEditingCat(c)}>
              {c.name}
            </button>
            <span className={`station-tag st-${c.station}`}>{STATION_LABEL[c.station]}</span>
          </h2>
          <ul className="list">
            {state.products
              .filter((p) => p.categoryId === c.id && !p.archived && match(p))
              .map((p) => (
                <li key={p.id} className="admin-prod">
                  <button className="row-btn" onClick={() => setEditing(structuredClone(p))}>
                    <span className="row-main">
                      <span className="row-title">{p.name}</span>
                      <span className="row-sub">
                        {p.variants.length ? p.variants.map((v) => `${v.name} ${clp(v.price)}`).join(' · ') : clp(p.price)}
                        {p.extras.length ? ` · ${p.extras.length} ${p.extras.length === 1 ? 'extra' : 'extras'}` : ''}
                      </span>
                    </span>
                  </button>
                  {p.variants.length === 0 && <InlinePrice key={p.price} product={p} />}
                  <label className="switch" title="Agotado">
                    <input type="checkbox" checked={p.soldOut} onChange={(e) => run(() => store.setSoldOut(isAdmin, p.id, e.target.checked))} aria-label={`${p.name} agotado`} />
                    <span>Agotado</span>
                  </label>
                </li>
              ))}
            {!q.trim() && (
              <li>
                <button className="row-btn add-row" onClick={() => setEditing(blank(c.id))}>
                  <span className="add-dot" aria-hidden>
                    +
                  </span>
                  <span className="row-title">Agregar producto en {c.name}</span>
                </button>
              </li>
            )}
          </ul>
        </section>
      ))}
      {archived.length > 0 && (
        <section className="group">
          <h2 className="group-title">Quitados del menú</h2>
          <p className="hint">Tienen ventas, por eso se guardan para los reportes. Puedes devolverlos al menú.</p>
          <ul className="list">
            {archived.map((p) => (
              <li key={p.id} className="admin-prod">
                <span className="row-main pad-row">
                  <span className="row-title">{p.name}</span>
                  <span className="row-sub">{clp(p.price)}</span>
                </span>
                <button
                  className="btn-plain"
                  onClick={() => {
                    const categoryId = state.categories.some((c) => c.id === p.categoryId) ? p.categoryId : cats[0]?.id;
                    run(() => store.saveProduct(isAdmin, { ...p, categoryId, archived: false }), 'Volvió al menú');
                  }}
                >
                  Volver al menú
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
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

/** Cambio rápido de precio en el computador: se guarda al salir del campo o con Enter. */
function InlinePrice({ product }: { product: Product }) {
  const store = useStore();
  const run = useAction();
  const { isAdmin } = useUi();
  const [v, setV] = useState(product.price);
  const commit = () => {
    if (v !== product.price) run(() => store.saveProduct(isAdmin, { ...product, price: v }), `${product.name}: ${clp(v)}`);
  };
  return (
    <input
      className="inline-price"
      inputMode="numeric"
      aria-label={`Precio de ${product.name}`}
      value={'$' + v.toLocaleString('es-CL')}
      onChange={(e) => setV(Number(e.target.value.replace(/\D/g, '') || 0))}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  );
}

/** Opciones sin costo que se eligen al pedir: un grupo por línea, opciones separadas por coma. */
function ChoiceEditor({ groups, onChange }: { groups: ChoiceGroup[]; onChange(g: ChoiceGroup[]): void }) {
  const set = (i: number, g: ChoiceGroup) => onChange(groups.map((x, j) => (j === i ? g : x)));
  return (
    <fieldset className="choice">
      <legend>Opciones para elegir (sin costo)</legend>
      <p className="hint">Ej: Salsa → chocolate, caramelo, frambuesa. Al pedir hay que elegir una de cada grupo.</p>
      {groups.map((g, i) => (
        <div key={i} className="choice-edit">
          <input aria-label="Nombre del grupo" placeholder="Grupo (ej: Salsa)" value={g.name} onChange={(e) => set(i, { ...g, name: e.target.value })} />
          <input
            aria-label={`Opciones de ${g.name || 'este grupo'}`}
            placeholder="Opciones separadas por coma"
            defaultValue={g.options.join(', ')}
            onChange={(e) => set(i, { ...g, options: e.target.value.split(',') })}
          />
          <button type="button" className="btn-plain danger" onClick={() => onChange(groups.filter((_, j) => j !== i))}>
            Quitar
          </button>
          <label className="toggle choice-multi">
            <input type="checkbox" checked={!!g.multi} onChange={(e) => set(i, { ...g, multi: e.target.checked || undefined })} />
            <span>Se puede elegir más de una</span>
          </label>
        </div>
      ))}
      <button type="button" className="btn-plain" onClick={() => onChange([...groups, { name: '', options: [] }])}>
        + Agregar grupo
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
            const choices = (p.choices ?? [])
              .map((g) => ({ name: g.name.trim(), options: g.options.map((o) => o.trim()).filter(Boolean), multi: g.multi }))
              .filter((g) => g.name && g.options.length);
            onSave({
              ...p,
              choices: choices.length ? choices : undefined,
              scoops: p.scoops || undefined,
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
              {c.name} ({c.station === 'cocina' ? 'Cocina' : 'Cafetería'})
            </option>
          ))}
        </select>
      </label>
      {p.variants.length === 0 && <MoneyField id="p-price" label="Precio con IVA" value={p.price} onChange={(price) => setP({ ...p, price })} />}
      <OptionEditor prefix="var" label="Tamaños o variantes" hint="Cada uno con su precio final. Si agregas tamaños, reemplazan al precio único." items={p.variants} onChange={(variants) => setP({ ...p, variants })} />
      <OptionEditor prefix="ext" label="Extras" hint="Se suman al precio. Ej: leche vegetal +$600." items={p.extras} onChange={(extras) => setP({ ...p, extras })} />
      <ChoiceEditor groups={p.choices ?? []} onChange={(choices) => setP({ ...p, choices })} />
      <fieldset className="choice">
        <legend>Bolas de helado incluidas</legend>
        <p className="hint">Al pedir se elige un sabor por bola. Si tiene el extra "Bola de helado extra", pide un sabor más.</p>
        <Stepper value={p.scoops ?? 0} onChange={(scoops) => setP({ ...p, scoops })} label="Bolas de helado" />
      </fieldset>
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
  // Cada cambio se guarda al tiro; el nombre se guarda al salir del campo.
  const [names, setNames] = useState<Record<string, string>>({});
  const save = (tables: TableDef[], msg?: string) => run(() => (store.saveTables(isAdmin, tables), true), msg);
  const nextName = () => {
    let n = 1;
    while (state.tables.some((t) => t.name.toLowerCase() === `mesa ${n}`)) n++;
    return `Mesa ${n}`;
  };
  const move = (i: number, d: number) => {
    const t = [...state.tables];
    [t[i], t[i + d]] = [t[i + d], t[i]];
    save(t);
  };
  return (
    <div className="admin-pad">
      <p className="hint">Los cambios se guardan solos. Una mesa con cuenta abierta no se puede quitar hasta emitir su detalle.</p>
      <ul className="list">
        {state.tables.map((t, i) => (
          <li key={t.id} className="opt-edit table-edit">
            <input
              id={`mesa-${t.id}`}
              aria-label="Nombre de la mesa"
              value={names[t.id] ?? t.name}
              onChange={(e) => setNames({ ...names, [t.id]: e.target.value })}
              onBlur={() => {
                const name = names[t.id];
                if (name === undefined || name.trim() === t.name) return;
                if (!save(state.tables.map((x) => (x.id === t.id ? { ...x, name } : x)), 'Nombre guardado')) return;
                setNames(({ [t.id]: _, ...rest }) => rest);
              }}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
            <button className="icon-btn" aria-label={`Subir ${t.name}`} disabled={i === 0} onClick={() => move(i, -1)}>
              ↑
            </button>
            <button className="icon-btn" aria-label={`Bajar ${t.name}`} disabled={i === state.tables.length - 1} onClick={() => move(i, 1)}>
              ↓
            </button>
            <button className="btn-plain danger" onClick={() => save(state.tables.filter((x) => x.id !== t.id), `${t.name} quitada`)}>
              Quitar
            </button>
          </li>
        ))}
      </ul>
      <button className="btn-primary wide" onClick={() => save([...state.tables, { id: uid('mesa'), name: nextName() }], 'Mesa agregada')}>
        Agregar mesa
      </button>
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
        <label className="toggle">
          <input type="checkbox" checked={s.printOnEmit !== false} onChange={(e) => setS({ ...s, printOnEmit: e.target.checked })} />
          <span>Imprimir el detalle apenas se emite</span>
        </label>
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
