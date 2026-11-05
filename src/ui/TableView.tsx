import { useMemo, useState } from 'react';
import { accountDue, accountTotal, clp, lineTotal, netAndTax, suggestedTip } from '../domain/calc';
import type { Account, Comanda, Line, Product, Station } from '../domain/types';
import { STATION_LABEL } from '../domain/types';
import { accountHtml, printHtml } from '../print';
import { canPrint, useAction, useAppState, useStore, useUi } from '../state';
import { MoneyField, Segmented, Sheet, Stepper } from './kit';

type Pane = 'menu' | 'cuenta';

export function TableView({ tableId, onBack }: { tableId: string; onBack(): void }) {
  const state = useAppState();
  const table = state.tables.find((t) => t.id === tableId);
  const account = state.accounts.find((a) => a.tableId === tableId && a.status === 'abierta');
  const [pane, setPane] = useState<Pane>(account ? 'cuenta' : 'menu');
  const [adding, setAdding] = useState<Product | null>(null);
  const [sending, setSending] = useState(false);
  const [emitted, setEmitted] = useState<Account | null>(null);

  if (emitted) return <EmittedView account={emitted} onDone={onBack} />;
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
                        {p.soldOut ? 'Agotado' : [p.description, p.extras.length ? `${p.extras.length} ${p.extras.length === 1 ? 'extra' : 'extras'}` : ''].filter(Boolean).join(' · ')}
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

const QUICK_NOTES = ['Sin azúcar', 'Con endulzante', 'Bien caliente', 'Tibio', 'Con hielo aparte', 'Sin crema', 'Para llevar', 'Separar salsa'];

function AddSheet({ tableId, product, onClose }: { tableId: string; product: Product; onClose(): void }) {
  const run = useAction();
  const store = useStore();
  const [variant, setVariant] = useState(product.variants[0]?.name);
  const [extras, setExtras] = useState<string[]>([]);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const unit = (variant ? product.variants.find((v) => v.name === variant)!.price : product.price) + extras.reduce((s, e) => s + (product.extras.find((x) => x.name === e)?.price ?? 0), 0);
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
              const ok = run(() => (store.addLine(tableId, { productId: product.id, variant, extras, qty, note }), true));
              if (ok) onClose();
            }}
          >
            Agregar {clp(unit * qty)}
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
      {product.extras.length > 0 && (
        <fieldset className="choice">
          <legend>Extras</legend>
          {product.extras.map((x) => {
            const on = extras.includes(x.name);
            return (
              <label key={x.name} className={`choice-row ${on ? 'on' : ''}`}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => setExtras((s) => (on ? s.filter((n) => n !== x.name) : product.extras.map((y) => y.name).filter((n) => s.includes(n) || n === x.name)))}
                />
                <span>{x.name}</span>
                <span className="choice-price">+{clp(x.price)}</span>
              </label>
            );
          })}
        </fieldset>
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
  const [emitOpen, setEmitOpen] = useState(false);
  const [moving, setMoving] = useState(false);
  const [removing, setRemoving] = useState<Line | null>(null);
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

  return (
    <div className="account-pane">
      <article className="receipt" aria-label="Detalle de cuenta">
        <header>
          <strong>{state.settings.businessName}</strong>
          <span>
            {account.tableName} · Cuenta N° {account.number}
          </span>
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
                {l.note && <div className="rc-sub rc-note">“{l.note}”</div>}
                <div className="rc-meta">
                  <span className={`pill ${LINE_STATE[st].cls}`}>{LINE_STATE[st].label}</span>
                  {isAdmin && l.sentAt && (
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
          <div className="rc-line rc-total">
            <span>Total</span>
            <span>{clp(total)}</span>
          </div>
          <div className="rc-line rc-small">
            <span>Neto {clp(neto)}</span>
            <span>IVA {clp(iva)}</span>
          </div>
          {state.settings.tipPercent > 0 && (
            <div className="rc-line rc-small">
              <span>Propina sugerida {state.settings.tipPercent}%</span>
              <span>{clp(suggestedTip(total, state.settings.tipPercent))}</span>
            </div>
          )}
        </footer>
      </article>

      <div className="actions">
        {hasUnsent && <p className="hint">Hay productos sin enviar. Envíalos antes de emitir el detalle.</p>}
        <button className="btn-primary wide" disabled={hasUnsent} onClick={() => setEmitOpen(true)}>
          Emitir detalle de cuenta
        </button>
        <div className="btn-pair">
          <button className="btn-secondary" onClick={() => setMoving(true)}>
            Cambiar de mesa
          </button>
          {canPrint && (
            <button className="btn-secondary" onClick={() => printHtml(accountHtml(account, state.settings))}>
              Imprimir precuenta
            </button>
          )}
        </div>
        {isAdmin && (
          <button className="btn-plain danger" onClick={() => setRemoving({ id: '__all__' } as Line)}>
            Anular cuenta completa
          </button>
        )}
      </div>

      {emitOpen && (
        <EmitSheet
          account={account}
          onClose={() => setEmitOpen(false)}
          onDone={() => {
            setEmitOpen(false);
            onEmitted(store.get().accounts.find((a) => a.id === account.id)!);
          }}
        />
      )}
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

function EmitSheet({ account, onClose, onDone }: { account: Account; onClose(): void; onDone(): void }) {
  const state = useAppState();
  const store = useStore();
  const run = useAction();
  const total = accountTotal(account);
  const suggested = suggestedTip(total, state.settings.tipPercent);
  const [tipMode, setTipMode] = useState<'sugerida' | 'sin' | 'otra'>(account.tableName === 'Para llevar' ? 'sin' : 'sugerida');
  const [otherTip, setOtherTip] = useState(0);
  const [method, setMethod] = useState('');
  const [boleta, setBoleta] = useState('');
  const tip = tipMode === 'sugerida' ? suggested : tipMode === 'otra' ? otherTip : 0;

  return (
    <Sheet
      title="Emitir detalle de cuenta"
      onClose={onClose}
      size="tall"
      footer={
        <button
          className="btn-primary wide"
          disabled={!method}
          onClick={() => {
            const ok = run(() => (store.emit(account.id, { tip, paymentMethod: method, boleta }), true));
            if (ok) {
              navigator.vibrate?.([10, 40, 10]);
              onDone();
            }
          }}
        >
          {method ? `Emitir · ${clp(total + tip)}` : 'Elige el medio de pago'}
        </button>
      }
    >
      <div className="emit-total">
        <span>Consumo</span>
        <strong>{clp(total)}</strong>
      </div>
      <fieldset className="choice">
        <legend>Propina (voluntaria)</legend>
        <Segmented<'sugerida' | 'sin' | 'otra'>
          label="Propina"
          value={tipMode}
          onChange={setTipMode}
          options={[
            { value: 'sugerida', label: `${state.settings.tipPercent}% · ${clp(suggested)}` },
            { value: 'sin', label: 'Sin propina' },
            { value: 'otra', label: 'Otro monto' },
          ]}
        />
        {tipMode === 'otra' && <MoneyField id="tip-other" label="Monto de propina" value={otherTip} onChange={setOtherTip} />}
      </fieldset>
      <fieldset className="choice">
        <legend>Medio de pago</legend>
        <div className="method-grid">
          {state.settings.paymentMethods.map((m) => (
            <button key={m} className={`method ${method === m ? 'on' : ''}`} onClick={() => setMethod(m)} aria-pressed={method === m}>
              {m}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="field" htmlFor="boleta">
        <span>N° de boleta (opcional, para cuadrar)</span>
        <input id="boleta" inputMode="numeric" value={boleta} onChange={(e) => setBoleta(e.target.value.replace(/[^\d-]/g, ''))} placeholder="Se puede agregar después" />
      </label>
      <div className="emit-total big">
        <span>Total a pagar</span>
        <strong>{clp(total + tip)}</strong>
      </div>
    </Sheet>
  );
}

function EmittedView({ account, onDone }: { account: Account; onDone(): void }) {
  const state = useAppState();
  return (
    <div className="screen emitted">
      <div className="emitted-check" aria-hidden>
        ✓
      </div>
      <h1>Detalle emitido</h1>
      <p className="subtitle">
        {account.tableName} quedó libre. La cuenta N° {account.number} está en Cuentas del turno {account.turno}.
      </p>
      <article className="receipt">
        <header>
          <strong>{state.settings.businessName}</strong>
          <span>Detalle de cuenta N° {account.number}</span>
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
        {canPrint && (
          <button className="btn-secondary wide" onClick={() => printHtml(accountHtml(account, state.settings))}>
            Imprimir detalle
          </button>
        )}
        <button className="btn-primary wide" onClick={onDone}>
          Volver a mesas
        </button>
      </div>
    </div>
  );
}
