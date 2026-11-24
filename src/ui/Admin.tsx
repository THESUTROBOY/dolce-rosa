import { useState } from 'react';
import { clp, dayKey } from '../domain/calc';
import { demoState } from '../domain/demo';
import { seedState } from '../domain/seed';
import { uid } from '../domain/store';
import type { AppState, Category, ChoiceGroup, Option, Product, Settings, Station, TableDef } from '../domain/types';
import { STATION_LABEL } from '../domain/types';
import { canPrint, useAction, useAppState, useStore, useUi, useWide } from '../state';
import { downloadFile, MoneyField, PinPad, Segmented, Sheet, Stepper } from './kit';
import { FlavorsEditor } from './TableView';
import { CashCountView, ClosesView, FinanceView, TipsView } from './Finance';
import { LedgerView } from './Ledger';
import { PeopleAdmin, PromotionsAdmin } from './People';
import { Reports } from './Reports';
import { SyncAdmin } from './Sync';

type Section = 'home' | 'finanzas' | 'cuadratura' | 'cierres' | 'propinas' | 'reportes' | 'contador' | 'carta' | 'promos' | 'mesas' | 'personas' | 'ajustes' | 'datos';

export function Admin() {
  const store = useStore();
  const { isAdmin, setAdmin, toast, adminName } = useUi();
  const [error, setError] = useState('');
  const [section, setSection] = useState<Section>('home');
  const wide = useWide();

  if (!isAdmin) {
    return (
      <div className="screen screen-pin">
        <header className="large-title center">
          <h1>Administración</h1>
          <p className="subtitle">Ingresa tu PIN para ver finanzas, reportes, cierres y editar el menú.</p>
        </header>
        <PinPad
          error={error}
          onSubmit={(pin) => {
            const admin = store.checkPin(pin);
            if (admin) {
              setError('');
              setAdmin(admin.name);
              toast(`Hola, ${admin.name}`);
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

  const items: { s: Exclude<Section, 'home'>; title: string; sub: string; group: string }[] = [
    { s: 'finanzas', title: 'Finanzas', sub: 'Saldos, compromisos, préstamos y traspasos', group: 'Dinero' },
    { s: 'cuadratura', title: 'Cuadratura', sub: 'Compara lo que hay con lo esperado', group: 'Dinero' },
    { s: 'cierres', title: 'Cierres de turno', sub: 'Cierre AM y PM, y cierres anteriores', group: 'Dinero' },
    { s: 'propinas', title: 'Propinas', sub: 'Acumuladas, pendientes y entregas', group: 'Dinero' },
    { s: 'reportes', title: 'Reportes', sub: 'Ventas, gastos, resultado y gráficos', group: 'Dinero' },
    { s: 'contador', title: 'Excel del contador', sub: 'Exportar movimientos e importar historial', group: 'Dinero' },
    { s: 'carta', title: 'Menú', sub: 'Productos, precios, extras y disponibilidad', group: 'Local' },
    { s: 'promos', title: 'Promociones', sub: 'Descuentos para aplicar en las cuentas', group: 'Local' },
    { s: 'mesas', title: 'Mesas', sub: 'Agregar, renombrar, ordenar o quitar mesas', group: 'Local' },
    { s: 'personas', title: 'Personas y registro', sub: 'Perfiles, PIN y quién cambió qué', group: 'Sistema' },
    { s: 'ajustes', title: 'Ajustes', sub: 'Turnos, propina, comisiones y listas del contador', group: 'Sistema' },
    { s: 'datos', title: 'Datos, respaldo y sincronización', sub: 'Respaldos, equipos conectados y datos de prueba', group: 'Sistema' },
  ];
  const titles = Object.fromEntries(items.map((i) => [i.s, i.title])) as Record<Exclude<Section, 'home'>, string>;
  const content = (s: Exclude<Section, 'home'>) => (
    <>
      {s === 'finanzas' && <FinanceView />}
      {s === 'cuadratura' && <CashCountView />}
      {s === 'cierres' && <ClosesView />}
      {s === 'propinas' && <TipsView />}
      {s === 'reportes' && <Reports />}
      {s === 'contador' && <LedgerView />}
      {s === 'carta' && <MenuAdmin />}
      {s === 'promos' && <PromotionsAdmin />}
      {s === 'mesas' && <TablesAdmin />}
      {s === 'personas' && <PeopleAdmin />}
      {s === 'ajustes' && <SettingsAdmin />}
      {s === 'datos' && <DataAdmin />}
    </>
  );
  const navList = (cur?: Section) =>
    [...new Set(items.map((i) => i.group))].map((g) => (
      <section key={g} className="nav-group">
        <h2 className="group-title">{g}</h2>
        <ul className="list nav-list">
          {items
            .filter((i) => i.group === g)
            .map((i) => (
              <li key={i.s}>
                <button className={`row-btn ${cur === i.s ? 'on' : ''}`} aria-current={cur === i.s ? 'page' : undefined} onClick={() => setSection(i.s)}>
                  <span className="row-main">
                    <span className="row-title">{i.title}</span>
                    <span className="row-sub">{i.sub}</span>
                  </span>
                  {!wide && (
                    <span className="chev" aria-hidden>
                      ›
                    </span>
                  )}
                </button>
              </li>
            ))}
        </ul>
      </section>
    ));

  // En el computador: lista de secciones a la izquierda y la sección abierta a la derecha.
  if (wide) {
    const cur = section === 'home' ? 'finanzas' : section;
    return (
      <div className="screen admin-split">
        <aside className="admin-side">
          <header className="large-title">
            <h1>Administración</h1>
            <p className="subtitle">{adminName}</p>
          </header>
          {navList(cur)}
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
            <span aria-hidden>‹</span> Administración
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
        <h1>Administración</h1>
        <p className="subtitle">{adminName} · ves y editas todos los datos</p>
      </header>
      {navList()}
      <div className="actions">
        <button className="btn-secondary wide" onClick={() => setAdmin(false)}>
          Salir del modo administrador
        </button>
      </div>
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
      <p className="hint">Toca un producto para cambiar nombre, descripción, precio o extras, o para eliminarlo. Usa el interruptor para activarlo o desactivarlo según disponibilidad. Toca el nombre de una categoría para editarla y darle extras compartidos (ej. agregados del gohan).</p>
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
                  <label className="switch" title="Disponible para pedir">
                    <input type="checkbox" checked={!p.soldOut} onChange={(e) => run(() => store.setSoldOut(isAdmin, p.id, !e.target.checked))} aria-label={`${p.name} disponible`} />
                    <span>{p.soldOut ? 'No disponible' : 'Disponible'}</span>
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
        <button className="btn-primary wide" onClick={() => onSave({ ...c, name: c.name.trim(), extras: (c.extras ?? []).filter((x) => x.name.trim()).length ? c.extras!.filter((x) => x.name.trim()) : undefined })}>
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
      <OptionEditor
        prefix="catx"
        label="Extras de toda la categoría"
        hint="Se ofrecen en todos sus productos, además de los extras propios de cada uno. Ej: palta +$1.000, salmón +$2.500."
        items={c.extras ?? []}
        onChange={(extras) => setC({ ...c, extras })}
      />
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
          Eliminar producto
        </button>
      )}
      {onRemove && (
        <p className="hint">Si ya tiene ventas, se archiva para no perder los reportes y puedes devolverlo al menú.</p>
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
function ListField({ id, label, value, onChange, hint }: { id: string; label: string; value: string[]; onChange(v: string[]): void; hint?: string }) {
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <textarea
        id={id}
        rows={Math.max(3, value.length + 1)}
        defaultValue={value.join('\n')}
        onChange={(e) =>
          onChange(
            e.target.value
              .split('\n')
              .map((x) => x.trim())
              .filter(Boolean),
          )
        }
      />
      {hint && <small className="hint">{hint}</small>}
    </label>
  );
}

function SettingsAdmin() {
  const state = useAppState();
  const store = useStore();
  const run = useAction();
  const { isAdmin } = useUi();
  const [s, setS] = useState<Settings>(state.settings);
  const pct = (v: string) => Math.min(19, Number(v.replace(',', '.').replace(/[^\d.]/g, '')) || 0);
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
          <span>El turno PM (tarde) empieza a las</span>
          <select id="set-turno" value={s.afternoonStartsAt} onChange={(e) => setS({ ...s, afternoonStartsAt: Number(e.target.value) })}>
            {Array.from({ length: 12 }, (_, i) => i + 10).map((h) => (
              <option key={h} value={h}>
                {h}:00
              </option>
            ))}
          </select>
        </label>
        <p className="hint">Cada venta queda en el turno AM o PM de la hora en que se cobra.</p>
      </section>
      <section className="group">
        <h2 className="group-title">Propina</h2>
        <label className="field" htmlFor="set-tip">
          <span>Propina sugerida (%)</span>
          <input id="set-tip" inputMode="numeric" value={s.tipPercent} onChange={(e) => setS({ ...s, tipPercent: Math.min(30, Number(e.target.value.replace(/\D/g, '') || 0)) })} />
        </label>
        <label className="toggle">
          <input type="checkbox" checked={!!s.tipFeeFromTip} onChange={(e) => setS({ ...s, tipFeeFromTip: e.target.checked || undefined })} />
          <span>Descontar de la propina la comisión de su parte pagada con tarjeta</span>
        </label>
      </section>
      <section className="group">
        <h2 className="group-title">Comisiones de Mercado Pago</h2>
        <p className="hint">Porcentaje con IVA incluido y días que demora el abono en llegar al banco. Revisa tu plan en Mercado Pago.</p>
        <div className="fee-grid">
          <span />
          <strong>Comisión %</strong>
          <strong>Días de abono</strong>
          {(['debito', 'credito'] as const).map((m) => (
            <FeeRow key={m} label={m === 'debito' ? 'Débito' : 'Crédito'} fee={s.fees[m]} days={s.settleDays[m]} onFee={(v) => setS({ ...s, fees: { ...s.fees, [m]: pct(v) } })} onDays={(d) => setS({ ...s, settleDays: { ...s.settleDays, [m]: d } })} />
          ))}
          <FeeRow label="Transferencia" fee={s.fees.transferencia} onFee={(v) => setS({ ...s, fees: { ...s.fees, transferencia: pct(v) } })} />
        </div>
      </section>
      <section className="group">
        <h2 className="group-title">Listas del contador</h2>
        <p className="hint">Una por línea, escritas exactamente como en el Excel «Control Gastos JJA SPA».</p>
        <ListField id="set-cats" label="Categorías de gasto" value={s.expenseCategories} onChange={(expenseCategories) => setS({ ...s, expenseCategories })} />
        <ListField id="set-methods" label="Métodos de pago" value={s.expenseMethods} onChange={(expenseMethods) => setS({ ...s, expenseMethods })} />
        <ListField id="set-docs" label="Tipos de documento" value={s.docTypes} onChange={(docTypes) => setS({ ...s, docTypes })} />
      </section>
      <section className="group">
        <h2 className="group-title">Detalle de cuenta</h2>
        <label className="toggle">
          <input type="checkbox" checked={s.printOnEmit !== false} onChange={(e) => setS({ ...s, printOnEmit: e.target.checked })} />
          <span>Imprimir el detalle apenas se emite</span>
        </label>
        <label className="toggle">
          <input type="checkbox" checked={s.printOnSend === true} onChange={(e) => setS({ ...s, printOnSend: e.target.checked })} />
          <span>Imprimir las comandas apenas se envían a cocina y barra</span>
        </label>
        {text('businessName', 'Nombre del local')}
        {text('address', 'Dirección')}
        {text('phone', 'Teléfono o Instagram')}
        {text('footer', 'Texto al pie')}
      </section>
      <button className="btn-primary wide" onClick={() => run(() => store.saveSettings(isAdmin, s), 'Cambios guardados')}>
        Guardar cambios
      </button>
    </div>
  );
}

function FeeRow({ label, fee, days, onFee, onDays }: { label: string; fee: number; days?: number; onFee(v: string): void; onDays?(d: number): void }) {
  const [v, setV] = useState(String(fee).replace('.', ','));
  return (
    <>
      <span>{label}</span>
      <input
        aria-label={`Comisión ${label}`}
        inputMode="decimal"
        value={v}
        onChange={(e) => {
          setV(e.target.value);
          onFee(e.target.value);
        }}
      />
      {onDays ? (
        <input aria-label={`Días de abono ${label}`} inputMode="numeric" value={days ?? 0} onChange={(e) => onDays(Math.min(60, Number(e.target.value.replace(/\D/g, '') || 0)))} />
      ) : (
        <span className="muted">al momento</span>
      )}
    </>
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
      <SyncAdmin />
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
