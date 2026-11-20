import { useMemo, useState } from 'react';
import { accountDiscount, accountDue, accountSubtotal, accountTotal, clp, discountOf, folioLabel, lineTotal, netAndTax, occupiesTable, scoopsFor, suggestedTip } from '../domain/calc';
import { splitTip } from '../domain/money';
import type { Account, Comanda, Line, PayMethod, Product, Station } from '../domain/types';
import { PAY_LABEL, PAY_METHODS, STATION_LABEL } from '../domain/types';
import { accountHtml, printHtml } from '../print';
import { canPrint, useAction, useAppState, useStore, useUi, useWide } from '../state';
import { MoneyField, Segmented, Sheet, Stepper } from './kit';

type Pane = 'menu' | 'cuenta';

export function TableView({ tableId, onBack }: { tableId: string; onBack(): void }) {
  const state = useAppState();
  const table = state.tables.find((t) => t.id === tableId);
  const account = state.accounts.find((a) => a.tableId === tableId && occupiesTable(a));
  const pending = !!account && account.status === 'emitida';
  const [pane, setPane] = useState<Pane>(account ? 'cuenta' : 'menu');
  const [adding, setAdding] = useState<Product | null>(null);
  const [sending, setSending] = useState(false);
  const [emitted, setEmitted] = useState<Account | null>(null);
  const wide = useWide();

  if (emitted) return <PaidView account={emitted} onDone={onBack} />;
  if (!table) return null;

  const unsent = account?.lines.filter((l) => !l.sentAt) ?? [];
  const count = account?.lines.reduce((s, l) => s + l.qty, 0) ?? 0;

  return (
    <div className="screen screen-table">
      <header className="nav-bar">
        <button className="back" onClick={onBack} aria-label="Volver a mesas">
          <span aria-hidden>‹</span> Mesas
        </button>
        <div className="nav-title">
          <strong>{table.name}</strong>
          {account && <span>{clp(accountTotal(account))}</span>}
        </div>
        <span className="nav-spacer" />
      </header>
      {pending ? (
        <div className="pending-pane">
          <AccountPane account={account} onEmitted={setEmitted} onGoMenu={() => setPane('menu')} />
        </div>
      ) : wide ? (
        <div className="table-split">
          <div className="split-main">
            <MenuPane onPick={setAdding} />
          </div>
          <aside className="split-side" aria-label="Detalle de cuenta">
            <h2 className="group-title">Detalle de cuenta{count ? ` · ${count}` : ''}</h2>
            {unsent.length > 0 && account && (
              <div className="send-bar send-inline">
                <div>
                  <strong>{unsent.reduce((s, l) => s + l.qty, 0)} por enviar</strong>
                  <span>{clp(unsent.reduce((s, l) => s + lineTotal(l), 0))}</span>
                </div>
                <button className="btn-primary" onClick={() => setSending(true)}>
                  Revisar y enviar
                </button>
              </div>
            )}
            <AccountPane account={account} onEmitted={setEmitted} onGoMenu={() => document.querySelector<HTMLInputElement>('.menu-pane input')?.focus()} />
          </aside>
        </div>
      ) : (
        <>
      <div className="pane-switch">
        <Segmented<Pane>
          label="Sección de la mesa"
          value={pane}
          onChange={setPane}
          options={[
            { value: 'menu', label: 'Menú' },
            { value: 'cuenta', label: `Detalle de cuenta${count ? ` · ${count}` : ''}` },
          ]}
        />
      </div>

      {pane === 'menu' ? <MenuPane onPick={setAdding} /> : <AccountPane account={account} onEmitted={setEmitted} onGoMenu={() => setPane('menu')} />}

      {unsent.length > 0 && account && (
        <div className="send-bar">
          <div>
            <strong>
              {unsent.reduce((s, l) => s + l.qty, 0)} por enviar
            </strong>
            <span>{clp(unsent.reduce((s, l) => s + lineTotal(l), 0))}</span>
          </div>
          <button className="btn-primary" onClick={() => setSending(true)}>
            Revisar y enviar
          </button>
        </div>
      )}
        </>
      )}

      {adding && (
        <AddSheet tableId={tableId} product={adding} onClose={() => setAdding(null)} />
      )}
      {sending && account && <SendSheet account={account} onClose={() => setSending(false)} />}
    </div>
  );
}

function MenuPane({ onPick }: { onPick(p: Product): void }) {
  const state = useAppState();
  const [q, setQ] = useState('');
  const cats = [...state.categories].sort((a, b) => a.sort - b.sort);
  const query = q.trim().toLowerCase();
  const visible = (p: Product) => !p.archived && (!query || p.name.toLowerCase().includes(query));

  return (
    <div className="menu-pane">
      <div className="menu-tools">
        <input id="menu-search" type="search" className="search" placeholder="Buscar en el menú" value={q} onChange={(e) => setQ(e.target.value)} />
        {!query && (
          <nav className="cat-chips" aria-label="Categorías">
            {cats.map((c) => (
              <a key={c.id} href={`#cat-${c.id}`} className="chip" onClick={(e) => {
                e.preventDefault();
                document.getElementById(`cat-${c.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}>
                {c.name}
              </a>
            ))}
          </nav>
        )}
      </div>
      {cats.map((c) => {
        const prods = state.products.filter((p) => p.categoryId === c.id && visible(p));
        if (!prods.length) return null;
        return (
          <section key={c.id} id={`cat-${c.id}`} className="group">
            <h2 className="group-title">
              {c.name}
              <span className={`station-tag st-${c.station}`}>{c.station === 'cocina' ? 'Cocina' : 'Cafetería'}</span>
            </h2>
            <ul className="list">
              {prods.map((p) => (
                <li key={p.id}>
                  <button className="row-btn" disabled={p.soldOut} onClick={() => onPick(p)}>
                    <span className="row-main">
                      <span className="row-title">{p.name}</span>
                      <span className="row-sub">
                        {p.soldOut ? 'No disponible' : [p.description, p.extras.length ? `${p.extras.length} ${p.extras.length === 1 ? 'extra' : 'extras'}` : ''].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="row-price">{priceLabel(p)}</span>
                    <span className="add-dot" aria-hidden>
                      +
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {query && !state.products.some(visible) && <p className="hint">No hay productos con “{q}”.</p>}
    </div>
  );
}

function priceLabel(p: Product) {
  if (!p.variants.length) return clp(p.price);
  const prices = p.variants.map((v) => v.price);
  const min = Math.min(...prices);
  return min === Math.max(...prices) ? clp(min) : `desde ${clp(min)}`;
}

const QUICK_NOTES = ['Sin azúcar', 'Con endulzante', 'Bien caliente', 'Tibio', 'Con hielo aparte', 'Para llevar', 'Separar salsa'];

function AddSheet({ tableId, product, onClose }: { tableId: string; product: Product; onClose(): void }) {
  const run = useAction();
  const store = useStore();
  const [variant, setVariant] = useState(product.variants[0]?.name);
  const [extras, setExtras] = useState<string[]>([]);
  const state0 = useAppState();
  const catExtras = state0.categories.find((c) => c.id === product.categoryId)?.extras ?? [];
  // Extras del producto y de su categoría (ej. agregados del gohan), sin repetir.
  const allExtras = [...product.extras, ...catExtras.filter((c) => !product.extras.some((x) => x.name === c.name))];
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const [choices, setChoices] = useState<Record<string, string[]>>({});
  const [flavors, setFlavors] = useState<string[]>([]);
  const scoops = scoopsFor(product, extras);
  const missing =
    (product.choices ?? []).find((g) => !choices[g.name]?.length)?.name.toLowerCase() ??
    (Array.from({ length: scoops }, (_, i) => flavors[i]?.trim()).some((f) => !f) ? (scoops === 1 ? 'sabor del helado' : 'sabores del helado') : null);
  const unit = (variant ? product.variants.find((v) => v.name === variant)!.price : product.price) + extras.reduce((s, e) => s + (allExtras.find((x) => x.name === e)?.price ?? 0), 0);
  const station: Station = store.stationOf(product.id);
  const samePrice = product.variants.every((v) => v.price === product.variants[0].price);

  return (
    <Sheet
      title={product.name}
      onClose={onClose}
      size="tall"
      footer={
        <div className="foot-row">
          <Stepper value={qty} onChange={setQty} min={1} label="Cantidad" />
          <button
            className="btn-primary grow"
            onClick={() => {
              const ok = run(() => (store.addLine(tableId, { productId: product.id, variant, extras, choices, flavors: flavors.slice(0, scoops), qty, note }), true));
              if (ok) onClose();
            }}
            disabled={!!missing}
          >
            {missing ? `Elige ${missing}` : `Agregar ${clp(unit * qty)}`}
          </button>
        </div>
      }
    >
      {product.description && <p className="sheet-desc">{product.description}</p>}
      <p className="sheet-note">
        Va a <strong>{STATION_LABEL[station]}</strong> al enviar el pedido.
      </p>
      {product.variants.length > 0 && (
        <fieldset className="choice">
          <legend>{samePrice ? 'Elige una opción' : 'Tamaño'}</legend>
          {product.variants.map((v) => (
            <label key={v.name} className={`choice-row ${variant === v.name ? 'on' : ''}`}>
              <input type="radio" name="variant" checked={variant === v.name} onChange={() => setVariant(v.name)} />
              <span>{v.name}</span>
              {!samePrice && <span className="choice-price">{clp(v.price)}</span>}
            </label>
          ))}
        </fieldset>
      )}
      {allExtras.length > 0 && (
        <fieldset className="choice">
          <legend>Extras</legend>
          {allExtras.map((x) => {
            const on = extras.includes(x.name);
            return (
              <label key={x.name} className={`choice-row ${on ? 'on' : ''}`}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => setExtras((s) => (on ? s.filter((n) => n !== x.name) : allExtras.map((y) => y.name).filter((n) => s.includes(n) || n === x.name)))}
                />
                <span>{x.name}</span>
                <span className="choice-price">+{clp(x.price)}</span>
              </label>
            );
          })}
        </fieldset>
      )}
      {(product.choices ?? []).map((g) => (
        <fieldset key={g.name} className="choice">
          <legend>
            {g.name}
            {g.multi && <span className="legend-hint"> · puedes elegir más de una</span>}
          </legend>
          <div className="chips-wrap pick" role={g.multi ? 'group' : 'radiogroup'} aria-label={g.name}>
            {g.options.map((o) => {
              const on = !!choices[g.name]?.includes(o);
              const cur = choices[g.name] ?? [];
              return (
                <button
                  key={o}
                  type="button"
                  role={g.multi ? 'checkbox' : 'radio'}
                  aria-checked={on}
                  className={`chip ${on ? 'on' : ''}`}
                  onClick={() => setChoices({ ...choices, [g.name]: g.multi ? (on ? cur.filter((x) => x !== o) : [...cur, o]) : [o] })}
                >
                  {o}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
      {scoops > 0 && (
        <FlavorPicker
          scoops={scoops}
          value={flavors}
          onChange={setFlavors}
        />
      )}
      <label className="field" htmlFor="line-note">
        <span>Nota para preparación</span>
        <textarea id="line-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej: sin azúcar, tibio" />
      </label>
      <div className="chips-wrap">
        {QUICK_NOTES.map((n) => (
          <button key={n} type="button" className="chip" onClick={() => setNote((s) => (s ? `${s}, ${n.toLowerCase()}` : n))}>
            {n}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

/** Lista de sabores de helado: se quitan los que se acaban y se agregan los nuevos, sin PIN. */
export function FlavorsEditor() {
  const state = useAppState();
  const store = useStore();
  const run = useAction();
  const list = state.settings.iceCreamFlavors ?? [];
  const [newFlavor, setNewFlavor] = useState('');
  const add = () => {
    if (!newFlavor.trim()) return;
    run(() => store.setFlavors([...list, newFlavor]), `Sabor agregado: ${newFlavor.trim()}`);
    setNewFlavor('');
  };
  return (
    <div className="flavor-edit">
      <p className="hint">Quita los que se acabaron y agrega los nuevos. Se actualiza para todos.</p>
      <div className="chips-wrap">
        {list.map((f) => (
          <button key={f} type="button" className="chip chip-x" onClick={() => run(() => store.setFlavors(list.filter((x) => x !== f)), `${f} quitado`)} aria-label={`Quitar ${f}`}>
            {f} <span aria-hidden>×</span>
          </button>
        ))}
        {list.length === 0 && <span className="hint">No hay sabores cargados.</span>}
      </div>
      <div className="field-row">
        <input aria-label="Nuevo sabor" placeholder="Nuevo sabor" value={newFlavor} onChange={(e) => setNewFlavor(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button type="button" className="btn-secondary" onClick={add}>
          Agregar
        </button>
      </div>
    </div>
  );
}

/** Sabor por bola de helado. La lista de sabores se edita aquí mismo cuando uno se acaba o llega otro. */
function FlavorPicker({ scoops, value, onChange }: { scoops: number; value: string[]; onChange(v: string[]): void }) {
  const state = useAppState();
  const list = state.settings.iceCreamFlavors ?? [];
  const [editing, setEditing] = useState(false);
  const [other, setOther] = useState<number | null>(null);
  const set = (i: number, f: string) => {
    const next = [...value];
    next[i] = f;
    onChange(next);
  };
  return (
    <fieldset className="choice">
      <legend className="legend-row">
        <span>{scoops === 1 ? 'Sabor del helado' : `Sabores del helado (${scoops} bolas)`}</span>
        <button type="button" className="btn-plain small" onClick={() => setEditing(!editing)}>
          {editing ? 'Listo' : 'Editar sabores'}
        </button>
      </legend>
      {editing ? (
        <FlavorsEditor />
      ) : (
        Array.from({ length: scoops }, (_, i) => (
          <div key={i} className="scoop">
            {scoops > 1 && <span className="scoop-n">Bola {i + 1}</span>}
            <div className="chips-wrap pick">
              {list.map((f) => (
                <button key={f} type="button" className={`chip ${value[i] === f && other !== i ? 'on' : ''}`} onClick={() => (setOther(null), set(i, f))}>
                  {f}
                </button>
              ))}
              <button type="button" className={`chip ${other === i ? 'on' : ''}`} onClick={() => (setOther(i), set(i, ''))}>
                Otro…
              </button>
            </div>
            {other === i && <input className="scoop-other" aria-label={`Sabor de la bola ${i + 1}`} placeholder="Escribe el sabor" value={value[i] ?? ''} onChange={(e) => set(i, e.target.value)} autoFocus />}
          </div>
        ))
      )}
    </fieldset>
  );
}

function SendSheet({ account, onClose }: { account: Account; onClose(): void }) {
  const store = useStore();
  const run = useAction();
  const { toast } = useUi();
  const [editing, setEditing] = useState<Line | null>(null);
  const live = store.get().accounts.find((a) => a.id === account.id);
  const unsent = live?.lines.filter((l) => !l.sentAt) ?? [];
  const groups = (['cocina', 'barra'] as Station[]).map((s) => ({ s, lines: unsent.filter((l) => l.station === s) })).filter((g) => g.lines.length);

  if (!unsent.length) {
    onClose();
    return null;
  }
  return (
    <Sheet
      title={`Enviar pedido · ${account.tableName}`}
      onClose={onClose}
      size="tall"
      footer={
        <button
          className="btn-primary wide"
          onClick={() => {
            const r = run(() => store.send(account.id));
            if (!r) return;
            const parts = [r.cocina && `${r.cocina} a cocina`, r.barra && `${r.barra} a barra`].filter(Boolean).join(' y ');
            toast(`Enviado: ${parts}`);
            navigator.vibrate?.(15);
            onClose();
          }}
        >
          Enviar {groups.length === 2 ? 'a cocina y barra' : groups[0].s === 'cocina' ? 'a cocina' : 'a barra'}
        </button>
      }
    >
      <p className="sheet-note">El pedido se separa solo según dónde se prepara cada producto.</p>
      {groups.map((g) => (
        <section key={g.s} className="group">
          <h3 className="group-title">
            {STATION_LABEL[g.s]} <span className={`station-tag st-${g.s}`}>{g.lines.reduce((s, l) => s + l.qty, 0)}</span>
          </h3>
          <ul className="list">
            {g.lines.map((l) => (
              <li key={l.id} className="line-row">
                <div className="row-main">
                  <span className="row-title">
                    {l.name}
                    {l.variant && <span className="muted"> · {l.variant}</span>}
                  </span>
                  {l.extras.length > 0 && <span className="row-sub">+ {l.extras.join(', ')}</span>}
                  {l.choices && <span className="row-sub">{l.choices.join(' · ')}</span>}
                  {l.note ? (
                    <button className="note-link" onClick={() => setEditing(l)}>
                      “{l.note}”
                    </button>
                  ) : (
                    <button className="note-link add" onClick={() => setEditing(l)}>
                      Agregar nota
                    </button>
                  )}
                </div>
                <Stepper value={l.qty} onChange={(q) => run(() => store.updateUnsent(account.id, l.id, { qty: q }))} label={`Cantidad de ${l.name}`} />
              </li>
            ))}
          </ul>
        </section>
      ))}
      {editing && (
        <NoteSheet
          initial={editing.note}
          title={editing.name}
          onClose={() => setEditing(null)}
          onSave={(note) => {
            run(() => store.updateUnsent(account.id, editing.id, { note }));
            setEditing(null);
          }}
        />
      )}
    </Sheet>
  );
}

function NoteSheet({ initial, title, onClose, onSave }: { initial: string; title: string; onClose(): void; onSave(n: string): void }) {
  const [note, setNote] = useState(initial);
  return (
    <Sheet
      title={`Nota · ${title}`}
      onClose={onClose}
      footer={
        <button className="btn-primary wide" onClick={() => onSave(note)}>
          Guardar nota
        </button>
      }
    >
      <textarea id="edit-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
      <div className="chips-wrap">
        {QUICK_NOTES.map((n) => (
          <button key={n} className="chip" onClick={() => setNote((s) => (s ? `${s}, ${n.toLowerCase()}` : n))}>
            {n}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

const LINE_STATE: Record<string, { label: string; cls: string }> = {
  nuevo: { label: 'Sin enviar', cls: 'pill-brand' },
  pendiente: { label: 'En cola', cls: 'pill-warn' },
  preparando: { label: 'Preparando', cls: 'pill-warn' },
  listo: { label: 'Listo', cls: 'pill-ok' },
  entregado: { label: 'Servido', cls: 'pill-soft' },
};

function AccountPane({ account, onEmitted, onGoMenu }: { account?: Account; onEmitted(a: Account): void; onGoMenu(): void }) {
  const state = useAppState();
  const store = useStore();
  const run = useAction();
  const { isAdmin } = useUi();
  const [payOpen, setPayOpen] = useState(false);
  const [moving, setMoving] = useState(false);
  const [removing, setRemoving] = useState<Line | null>(null);
  const [discounting, setDiscounting] = useState(false);
  const comandas = useMemo(() => new Map<string, Comanda>(state.comandas.map((c) => [c.id, c])), [state.comandas]);

  if (!account) {
    return (
      <div className="pane-empty">
        <strong>Mesa libre</strong>
        <p>Agrega productos desde el menú para abrir la cuenta.</p>
        <button className="btn-primary" onClick={onGoMenu}>
          Ir al menú
        </button>
      </div>
    );
  }
  const total = accountTotal(account);
  const { neto, iva } = netAndTax(total);
  const hasUnsent = account.lines.some((l) => !l.sentAt);
  const pending = account.status === 'emitida';
  const toServe = state.comandas.filter((c) => c.accountId === account.id && c.status !== 'entregado').length;
  const suggested = suggestedTip(total, state.settings.tipPercent);
  const emitNow = () => {
    const ok = run(() => (store.emit(account.id), true));
    if (!ok) return;
    navigator.vibrate?.([10, 40, 10]);
    // Se imprime en el mismo toque para que el navegador no lo bloquee.
    const done = store.get().accounts.find((a) => a.id === account.id);
    if (done && canPrint && state.settings.printOnEmit !== false) printHtml(accountHtml(done, state.settings));
  };

  return (
    <div className="account-pane">
      <article className="receipt" aria-label="Detalle de cuenta">
        <header>
          <strong>{state.settings.businessName}</strong>
          <span>{pending ? `Detalle de cuenta N° ${folioLabel(account.folio)}` : `${account.tableName} · Cuenta abierta`}</span>
          {pending && <span>{account.tableName}</span>}
        </header>
        <ul>
          {account.lines.map((l) => {
            const st = l.sentAt ? comandas.get(l.comandaId!)?.status ?? 'entregado' : 'nuevo';
            return (
              <li key={l.id}>
                <div className="rc-line">
                  <span>
                    {l.qty} × {l.name}
                    {l.variant ? ` ${l.variant}` : ''}
                  </span>
                  <span>{clp(lineTotal(l))}</span>
                </div>
                {l.extras.length > 0 && <div className="rc-sub">+ {l.extras.join(', ')}</div>}
                {l.choices && <div className="rc-sub">{l.choices.join(' · ')}</div>}
                {l.note && <div className="rc-sub rc-note">“{l.note}”</div>}
                <div className="rc-meta">
                  <span className={`pill ${LINE_STATE[st].cls}`}>{LINE_STATE[st].label}</span>
                  {isAdmin && l.sentAt && !pending && (
                    <button className="btn-plain danger small" onClick={() => setRemoving(l)}>
                      Quitar
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <footer>
          {(account.discounts?.length ?? 0) > 0 && (
            <>
              <div className="rc-line">
                <span>Subtotal</span>
                <span>{clp(accountSubtotal(account))}</span>
              </div>
              {account.discounts!.map((d) => (
                <div className="rc-line rc-discount" key={d.id}>
                  <span>
                    {d.name}
                    <button className="btn-plain danger small" onClick={() => run(() => store.removeDiscount(account.id, d.id), 'Descuento quitado')} aria-label={`Quitar ${d.name}`}>
                      Quitar
                    </button>
                  </span>
                  <span>−{clp(discountOf(d, account.lines))}</span>
                </div>
              ))}
            </>
          )}
          <div className="rc-line rc-total">
            <span>Total</span>
            <span>{clp(total)}</span>
          </div>
          <div className="rc-line rc-small">
            <span>Neto {clp(neto)}</span>
            <span>IVA {clp(iva)}</span>
          </div>
          {state.settings.tipPercent > 0 && (
            <>
              <div className="rc-line rc-small">
                <span>Propina sugerida {state.settings.tipPercent}%</span>
                <span>{clp(suggested)}</span>
              </div>
              <div className="rc-line rc-small">
                <span>Total con propina</span>
                <span>{clp(total + suggested)}</span>
              </div>
            </>
          )}
        </footer>
      </article>

      <div className="actions">
        {pending ? (
          <>
            <p className="pending-note">
              <span className="pill pill-warn">Por cobrar</span> El detalle ya se entregó. Cuando paguen, registra el pago y la mesa queda libre.
            </p>
            {!canPrint && <p className="hint">En esta vista de prueba no se puede imprimir. En la app instalada en el local, el detalle se imprime solo al emitir.</p>}
            <button className="btn-primary wide" onClick={() => setPayOpen(true)}>
              Registrar pago
            </button>
            <div className="btn-pair">
              <button className="btn-secondary" onClick={() => run(() => store.reopen(account.id), 'Cuenta reabierta: agrega lo que falte y vuelve a emitir')}>
                Reabrir para agregar
              </button>
              {canPrint ? (
                <button className="btn-secondary" onClick={() => printHtml(accountHtml(account, state.settings))}>
                  Imprimir de nuevo
                </button>
              ) : (
                <button className="btn-secondary" onClick={() => setMoving(true)}>
                  Cambiar de mesa
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            {toServe > 0 ? (
              <button className="btn-ok wide" onClick={() => run(() => store.markServed(account.id), 'Todo entregado en la mesa')}>
                Marcar todo entregado
              </button>
            ) : (
              account.lines.length > 0 && !hasUnsent && <p className="served-note">✓ Todo lo pedido ya está entregado en la mesa.</p>
            )}
            {hasUnsent && <p className="hint">Hay productos sin enviar. Envíalos antes de emitir el detalle.</p>}
            <button className="btn-primary wide" disabled={hasUnsent} onClick={emitNow}>
              {canPrint && state.settings.printOnEmit !== false ? 'Emitir e imprimir detalle' : 'Emitir detalle de cuenta'}
            </button>
            <button className="btn-secondary wide" onClick={() => setMoving(true)}>
              Cambiar de mesa
            </button>
          </>
        )}
        {account.lines.length > 0 && (state.promotions.some((p) => p.active) || isAdmin) && (
          <button className="btn-plain" onClick={() => setDiscounting(true)}>
            Aplicar promoción o descuento
          </button>
        )}
        {isAdmin && (
          <button className="btn-plain danger" onClick={() => setRemoving({ id: '__all__' } as Line)}>
            Anular cuenta completa
          </button>
        )}
      </div>

      {payOpen && (
        <PaySheet
          account={account}
          onClose={() => setPayOpen(false)}
          onDone={() => {
            setPayOpen(false);
            onEmitted(store.get().accounts.find((a) => a.id === account.id)!);
          }}
        />
      )}
      {discounting && <DiscountSheet account={account} onClose={() => setDiscounting(false)} />}
      {moving && (
        <Sheet title="Cambiar de mesa" onClose={() => setMoving(false)}>
          <div className="move-grid">
            {state.tables
              .filter((t) => t.id !== account.tableId)
              .map((t) => {
                const busy = !!store.openAccountFor(t.id);
                return (
                  <button
                    key={t.id}
                    className="btn-secondary"
                    disabled={busy}
                    onClick={() => {
                      if (run(() => (store.moveTable(account.id, t.id), true), `Cuenta movida a ${t.name}`)) setMoving(false);
                    }}
                  >
                    {t.name}
                    {busy ? ' (ocupada)' : ''}
                  </button>
                );
              })}
          </div>
        </Sheet>
      )}
      {removing && (
        <ReasonSheet
          title={removing.id === '__all__' ? 'Anular cuenta completa' : `Quitar ${removing.qty} × ${removing.name}`}
          onClose={() => setRemoving(null)}
          onConfirm={(reason) => {
            const ok =
              removing.id === '__all__'
                ? run(() => (store.voidAccount(isAdmin, account.id, reason), true), 'Cuenta anulada')
                : run(() => (store.removeSent(isAdmin, account.id, removing.id, reason), true), 'Producto quitado');
            if (ok) setRemoving(null);
          }}
        />
      )}
    </div>
  );
}

function DiscountSheet({ account, onClose }: { account: Account; onClose(): void }) {
  const store = useStore();
  const run = useAction();
  const { isAdmin } = useUi();
  const promos = store.activePromotions();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'percent' | 'amount'>('percent');
  const [value, setValue] = useState(0);
  const applied = new Set(account.discounts?.map((d) => d.promoId));
  return (
    <Sheet title="Promociones y descuentos" onClose={onClose}>
      {promos.length > 0 ? (
        <ul className="list">
          {promos.map((p) => (
            <li key={p.id}>
              <button
                className="row-btn"
                disabled={applied.has(p.id)}
                onClick={() => {
                  if (run(() => (store.applyPromotion(account.id, p.id), true), `${p.name} aplicada`)) onClose();
                }}
              >
                <span className="row-main">
                  <span className="row-title">{p.name}</span>
                  <span className="row-sub">
                    {p.kind === 'percent' ? `${p.value}% de descuento` : `${clp(p.value)} menos`}
                    {p.productIds.length || p.categoryIds.length ? ' en productos seleccionados' : ' en toda la cuenta'}
                    {applied.has(p.id) ? ' · ya aplicada' : ''}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">No hay promociones activas hoy. Administración las crea en Configurar → Promociones.</p>
      )}
      {isAdmin && (
        <fieldset className="choice">
          <legend>Descuento manual (administración)</legend>
          <label className="field" htmlFor="dto-name">
            <span>Motivo o nombre</span>
            <input id="dto-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: cortesía, cliente frecuente" />
          </label>
          <Segmented<'percent' | 'amount'>
            label="Tipo"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'percent', label: 'Porcentaje' },
              { value: 'amount', label: 'Monto fijo' },
            ]}
          />
          {kind === 'percent' ? (
            <label className="field" htmlFor="dto-pct">
              <span>Porcentaje</span>
              <input id="dto-pct" inputMode="numeric" value={value || ''} placeholder="0" onChange={(e) => setValue(Math.min(100, Number(e.target.value.replace(/\D/g, '') || 0)))} />
            </label>
          ) : (
            <MoneyField id="dto-amt" label="Monto" value={value} onChange={setValue} />
          )}
          <button
            className="btn-primary wide"
            disabled={!name.trim() || !value}
            onClick={() => {
              if (run(() => (store.applyDiscount(isAdmin, account.id, { name, kind, value }), true), 'Descuento aplicado')) onClose();
            }}
          >
            Aplicar descuento
          </button>
        </fieldset>
      )}
    </Sheet>
  );
}

export function ReasonSheet({ title, onClose, onConfirm }: { title: string; onClose(): void; onConfirm(reason: string): void }) {
  const [reason, setReason] = useState('');
  return (
    <Sheet
      title={title}
      onClose={onClose}
      footer={
        <button className="btn-danger wide" disabled={!reason.trim()} onClick={() => onConfirm(reason)}>
          Confirmar
        </button>
      }
    >
      <label className="field" htmlFor="reason">
        <span>Motivo (queda registrado)</span>
        <input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej: ingresado por error" autoFocus />
      </label>
    </Sheet>
  );
}

type TipMode = 'sugerida' | 'otra' | 'sin';
interface PayRow {
  method: PayMethod;
  amount: number;
  received: boolean;
}

export function PaySheet({ account, onClose, onDone, correcting }: { account: Account; onClose(): void; onDone(): void; correcting?: boolean }) {
  const state = useAppState();
  const store = useStore();
  const run = useAction();
  const { isAdmin } = useUi();
  const total = accountTotal(account);
  const pct = state.settings.tipPercent;
  const suggested = suggestedTip(total, pct);
  const [tipMode, setTipMode] = useState<TipMode>(correcting ? (account.tip === suggested ? 'sugerida' : account.tip ? 'otra' : 'sin') : account.tableName === 'Para llevar' ? 'sin' : 'sugerida');
  const [otherTip, setOtherTip] = useState(correcting ? account.tip : 0);
  const tip = tipMode === 'sugerida' ? suggested : tipMode === 'otra' ? otherTip : 0;
  const due = total + tip;
  const [rows, setRows] = useState<PayRow[]>(() => (correcting && account.payments?.length ? account.payments.map((p) => ({ method: p.method, amount: p.amount, received: p.received !== false })) : []));
  const [split, setSplit] = useState(rows.length > 1);
  const [cashGiven, setCashGiven] = useState(0);
  const [boleta, setBoleta] = useState(account.boleta ?? '');
  const [reason, setReason] = useState('');
  // Un solo medio: el monto sigue al total (cambia si cambia la propina).
  const effective: PayRow[] = split ? rows : rows.slice(0, 1).map((r) => ({ ...r, amount: due }));
  const paid = effective.reduce((a, r) => a + r.amount, 0);
  const left = due - paid;
  const tips = splitTip(effective.map((r) => r.amount), tip);
  const ready = effective.length > 0 && left === 0 && effective.every((r) => r.amount > 0) && (!correcting || reason.trim());
  const cashRow = effective.find((r) => r.method === 'efectivo');
  const pick = (m: PayMethod) => setRows([{ method: m, amount: due, received: true }]);
  const setRow = (i: number, patch: Partial<PayRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const submit = () => {
    const input = { tip, boleta, payments: effective.map((r, i) => ({ method: r.method, amount: r.amount, tip: tips[i], received: r.received })) };
    const ok = run(() => (correcting ? store.correctPayment(isAdmin, account.id, input, reason) : store.pay(account.id, input), true), correcting ? 'Pago corregido' : undefined);
    if (ok) {
      navigator.vibrate?.([10, 40, 10]);
      onDone();
    }
  };

  return (
    <Sheet
      title={`${correcting ? 'Corregir pago' : 'Registrar pago'} · ${folioLabel(account.folio)}`}
      onClose={onClose}
      size="tall"
      footer={
        <button className="btn-primary wide" disabled={!ready} onClick={submit}>
          {!effective.length ? 'Elige el medio de pago' : left > 0 ? `Faltan ${clp(left)}` : left < 0 ? `Sobran ${clp(-left)}` : `${correcting ? 'Guardar corrección' : 'Registrar pago'} · ${clp(due)}`}
        </button>
      }
    >
      <div className="emit-total">
        <span>Consumo{accountDiscount(account) ? ` (con ${clp(accountDiscount(account))} de descuento)` : ''}</span>
        <strong>{clp(total)}</strong>
      </div>
      <fieldset className="choice">
        <legend>Propina (voluntaria, no es venta)</legend>
        <Segmented<TipMode>
          label="Propina"
          value={tipMode}
          onChange={setTipMode}
          options={[
            { value: 'sugerida', label: `${pct}% · ${clp(suggested)}` },
            { value: 'otra', label: 'Otro monto' },
            { value: 'sin', label: 'Sin propina' },
          ]}
        />
        {tipMode === 'otra' && (
          <>
            <MoneyField id="tip-other" label="Monto de propina (puede ser más o menos que el 10 %)" value={otherTip} onChange={setOtherTip} />
            {total > 0 && otherTip > 0 && <p className="hint">Equivale al {Math.round((otherTip / total) * 1000) / 10}% del consumo.</p>}
          </>
        )}
      </fieldset>
      <fieldset className="choice">
        <legend>
          Medio de pago
          <label className="toggle inline-toggle">
            <input
              type="checkbox"
              checked={split}
              onChange={(e) => {
                setSplit(e.target.checked);
                if (e.target.checked) setRows(rows.length ? [{ ...rows[0], amount: due }] : [{ method: 'efectivo', amount: due, received: true }]);
                else setRows(rows.slice(0, 1));
              }}
            />
            <span>Pago combinado</span>
          </label>
        </legend>
        {!split ? (
          <div className="method-grid">
            {PAY_METHODS.map((m) => (
              <button key={m} className={`method ${rows[0]?.method === m ? 'on' : ''}`} onClick={() => pick(m)} aria-pressed={rows[0]?.method === m}>
                {PAY_LABEL[m]}
              </button>
            ))}
          </div>
        ) : (
          <div className="pay-rows">
            {rows.map((r, i) => (
              <div className="pay-row" key={i}>
                <select aria-label="Medio" value={r.method} onChange={(e) => setRow(i, { method: e.target.value as PayMethod })}>
                  {PAY_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {PAY_LABEL[m]}
                    </option>
                  ))}
                </select>
                <input
                  aria-label="Monto"
                  inputMode="numeric"
                  value={r.amount ? '$' + r.amount.toLocaleString('es-CL') : ''}
                  placeholder="$0"
                  onChange={(e) => setRow(i, { amount: Number(e.target.value.replace(/\D/g, '') || 0) })}
                />
                <span className="pay-tip muted">{tips[i] ? `propina ${clp(tips[i])}` : ''}</span>
                {rows.length > 1 && (
                  <button className="btn-plain danger small" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Quitar medio">
                    Quitar
                  </button>
                )}
              </div>
            ))}
            <button className="btn-plain" onClick={() => setRows([...rows, { method: rows.some((x) => x.method === 'efectivo') ? 'debito' : 'efectivo', amount: Math.max(0, left), received: true }])}>
              + Agregar otro medio {left > 0 ? `por ${clp(left)}` : ''}
            </button>
            <p className={`hint ${left ? 'warn-text' : ''}`}>{left === 0 ? 'Los pagos cuadran con el total.' : left > 0 ? `Faltan ${clp(left)} por asignar.` : `Los pagos suman ${clp(-left)} de más.`}</p>
          </div>
        )}
        {effective.some((r) => r.method === 'transferencia') && (
          <label className="toggle">
            <input
              type="checkbox"
              checked={effective.filter((r) => r.method === 'transferencia').every((r) => r.received)}
              onChange={(e) => setRows(rows.map((r) => (r.method === 'transferencia' ? { ...r, received: e.target.checked } : r)))}
            />
            <span>La transferencia ya se ve en la cuenta</span>
          </label>
        )}
        {cashRow && !correcting && (
          <div className="cash-change">
            <MoneyField id="cash-given" label="Efectivo recibido (para calcular el vuelto)" value={cashGiven} onChange={setCashGiven} />
            {cashGiven > cashRow.amount && (
              <p className="change-due">
                Vuelto: <strong>{clp(cashGiven - cashRow.amount)}</strong>
              </p>
            )}
          </div>
        )}
      </fieldset>
      <label className="field" htmlFor="boleta">
        <span>N° de boleta (opcional, para cuadrar)</span>
        <input id="boleta" inputMode="numeric" value={boleta} onChange={(e) => setBoleta(e.target.value.replace(/[^\d-]/g, ''))} placeholder="Se puede agregar después" />
      </label>
      {correcting && (
        <label className="field" htmlFor="pay-reason">
          <span>Motivo de la corrección (queda registrado)</span>
          <input id="pay-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
      )}
      <div className="emit-total big">
        <span>Total a pagar</span>
        <strong>{clp(due)}</strong>
      </div>
    </Sheet>
  );
}

function PaidView({ account, onDone }: { account: Account; onDone(): void }) {
  const state = useAppState();
  return (
    <div className="screen emitted">
      <div className="emitted-check" aria-hidden>
        ✓
      </div>
      <h1>Pago registrado</h1>
      <p className="subtitle">
        {account.tableName} quedó libre. El detalle {folioLabel(account.folio)} está en Cuentas del turno {account.turno}.
      </p>
      <article className="receipt">
        <header>
          <strong>{state.settings.businessName}</strong>
          <span>Detalle de cuenta N° {folioLabel(account.folio)}</span>
        </header>
        <ul>
          {account.lines.map((l) => (
            <li key={l.id}>
              <div className="rc-line">
                <span>
                  {l.qty} × {l.name}
                  {l.variant ? ` ${l.variant}` : ''}
                </span>
                <span>{clp(lineTotal(l))}</span>
              </div>
            </li>
          ))}
        </ul>
        <footer>
          <div className="rc-line">
            <span>Consumo</span>
            <span>{clp(accountTotal(account))}</span>
          </div>
          {account.tip > 0 && (
            <div className="rc-line">
              <span>Propina</span>
              <span>{clp(account.tip)}</span>
            </div>
          )}
          <div className="rc-line rc-total">
            <span>Total · {account.paymentMethod}</span>
            <span>{clp(accountDue(account))}</span>
          </div>
        </footer>
      </article>
      <div className="actions">
        {canPrint ? (
          <button className="btn-secondary wide" onClick={() => printHtml(accountHtml(account, state.settings))}>
            Imprimir de nuevo
          </button>
        ) : null}
        <button className="btn-primary wide" onClick={onDone}>
          Volver a mesas
        </button>
      </div>
    </div>
  );
}
