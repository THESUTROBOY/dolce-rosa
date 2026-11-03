import { useEffect, useMemo, useState } from 'react';
import { clp, discountAmount, saleTotal, subtotal } from '../domain/calc';
import { uid } from '../domain/store';
import type { Discount, Order, OrderItem, Product } from '../domain/types';
import { kitchenHtml, preBillHtml, printHtml } from '../print';
import { useAction, useAppState, useSession, useStore } from '../state';
import { Modal, MoneyInput } from './common';
import { PaymentModal } from './Payment';

const DRAFT_KEY = 'dolce-rosa:draft';

function loadDraft(): Order | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Order) : null;
  } catch {
    return null;
  }
}

export function Sell({ orderId, onDone }: { orderId: string | null; onDone(): void }) {
  const store = useStore();
  const state = useAppState();
  const { user, toast } = useSession();
  const run = useAction();
  const me = user!;

  const [order, setOrder] = useState<Order>(() => {
    const fromList = orderId && state.orders.find((o) => o.id === orderId && o.status === 'abierto');
    if (fromList) return structuredClone(fromList);
    const draft = loadDraft();
    if (draft && (!draft.number || state.orders.some((o) => o.id === draft.id && o.status === 'abierto'))) return draft;
    return store.newOrder(me.id, 'llevar');
  });

  // Si llega otro pedido desde la lista, cárgalo.
  useEffect(() => {
    if (!orderId) return;
    const o = store.get().orders.find((x) => x.id === orderId && x.status === 'abierto');
    if (o) setOrder(structuredClone(o));
  }, [orderId, store]);

  // Guarda el borrador para no perderlo si se cierra la página.
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(order));
    } catch {
      /* almacenamiento no disponible */
    }
  }, [order]);

  const [cat, setCat] = useState(state.categories[0]?.id ?? '');
  const [query, setQuery] = useState('');
  const [picking, setPicking] = useState<Product | null>(null);
  const [noteFor, setNoteFor] = useState<OrderItem | null>(null);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [paying, setPaying] = useState<Order | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [mobileTab, setMobileTab] = useState<'carta' | 'pedido'>('carta');

  const saved = state.orders.find((o) => o.id === order.id);
  const products = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.products
      .filter((p) => !p.archived)
      .filter((p) => (q ? p.name.toLowerCase().includes(q) : p.categoryId === cat));
  }, [state.products, cat, query]);

  const reset = () => {
    setOrder(store.newOrder(me.id, 'llevar'));
    onDone();
  };

  const addItem = (p: Product, variant?: string, extras: string[] = []) => {
    const base = variant ? p.variants.find((v) => v.name === variant)!.price : p.price;
    const extraPrice = extras.reduce((s, e) => s + (p.extras.find((x) => x.name === e)?.price ?? 0), 0);
    const unitPrice = base + extraPrice;
    setOrder((o) => {
      const same = o.items.find(
        (i) =>
          i.productId === p.id &&
          i.variant === variant &&
          i.extras.join('|') === extras.join('|') &&
          !i.note &&
          i.unitPrice === unitPrice,
      );
      if (same) return { ...o, items: o.items.map((i) => (i === same ? { ...i, qty: i.qty + 1 } : i)) };
      return {
        ...o,
        items: [...o.items, { id: uid('it'), productId: p.id, name: p.name, variant, extras, unitPrice, qty: 1, note: '', sentQty: 0 }],
      };
    });
  };

  const onProduct = (p: Product) => {
    if (p.soldOut) return toast(`${p.name} está agotado`, 'error');
    if (p.variants.length || p.extras.length) setPicking(p);
    else addItem(p);
  };

  const changeQty = (it: OrderItem, d: number) =>
    setOrder((o) => ({
      ...o,
      items: o.items.flatMap((i) => (i.id !== it.id ? [i] : i.qty + d <= 0 ? [] : [{ ...i, qty: i.qty + d }])),
    }));

  const persist = (): Order | undefined => {
    if (order.items.length === 0) {
      toast('Agrega al menos un producto', 'error');
      return;
    }
    const s = run(() => store.saveOrder(me.id, order));
    if (s) setOrder(structuredClone(s));
    return s;
  };

  const sendKitchen = () => {
    const s = persist();
    if (!s) return;
    const pending = s.items.some((i) => i.qty > i.sentQty);
    if (!pending) return toast('No hay productos nuevos para la comanda');
    printHtml(kitchenHtml(store.get(), s, true));
    store.markSent(s.id);
    setOrder(structuredClone(store.get().orders.find((o) => o.id === s.id)!));
    toast(`Comanda #${s.number} enviada`);
  };

  const unsent = order.items.some((i) => i.qty > i.sentQty);
  const total = saleTotal(order);

  return (
    <div className={`sell sell-show-${mobileTab}`}>
      <section className="catalog" aria-label="Carta">
        <div className="catalog-top">
          <input
            type="search"
            placeholder="Buscar producto…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar producto"
          />
        </div>
        {!query && (
          <div className="chips" role="tablist">
            {[...state.categories]
              .sort((a, b) => a.sort - b.sort)
              .map((c) => (
                <button
                  key={c.id}
                  role="tab"
                  aria-selected={c.id === cat}
                  className={`chip ${c.id === cat ? 'on' : ''}`}
                  onClick={() => setCat(c.id)}
                >
                  {c.name}
                </button>
              ))}
          </div>
        )}
        <div className="grid">
          {products.map((p) => (
            <button key={p.id} className={`tile ${p.soldOut ? 'soldout' : ''}`} onClick={() => onProduct(p)}>
              <span className="tile-name">{p.name}</span>
              <span className="tile-price">
                {p.soldOut ? 'Agotado' : p.variants.length ? `desde ${clp(Math.min(...p.variants.map((v) => v.price)))}` : clp(p.price)}
              </span>
            </button>
          ))}
          {products.length === 0 && <p className="empty">No hay productos aquí.</p>}
        </div>
      </section>

      <section className="ticket" aria-label="Pedido">
        <div className="ticket-head">
          <div className="seg" role="radiogroup" aria-label="Tipo de pedido">
            {(['llevar', 'mesa'] as const).map((t) => (
              <button
                key={t}
                role="radio"
                aria-checked={order.type === t}
                className={order.type === t ? 'on' : ''}
                onClick={() => setOrder((o) => ({ ...o, type: t, tableId: t === 'mesa' ? o.tableId : undefined }))}
              >
                {t === 'llevar' ? 'Para llevar' : 'Mesa'}
              </button>
            ))}
          </div>
          {order.type === 'mesa' ? (
            <select
              value={order.tableId ?? ''}
              onChange={(e) => setOrder((o) => ({ ...o, tableId: e.target.value || undefined }))}
              aria-label="Mesa"
            >
              <option value="">Elegir mesa…</option>
              {state.tables.map((t) => {
                const busy = state.orders.find((o) => o.status === 'abierto' && o.tableId === t.id && o.id !== order.id);
                return (
                  <option key={t.id} value={t.id} disabled={!!busy}>
                    {t.name}
                    {busy ? ` (ocupada #${busy.number})` : ''}
                  </option>
                );
              })}
            </select>
          ) : (
            <input
              placeholder="Nombre del cliente"
              value={order.customerName}
              onChange={(e) => setOrder((o) => ({ ...o, customerName: e.target.value }))}
              aria-label="Nombre del cliente"
            />
          )}
        </div>
        <div className="ticket-title">
          <strong>{saved ? `Pedido #${saved.number}` : 'Pedido nuevo'}</strong>
          {saved && unsent && <span className="badge warn">Cambios sin comanda</span>}
          <button className="ghost small" onClick={reset}>
            + Nuevo
          </button>
        </div>

        <ul className="lines">
          {order.items.map((i) => (
            <li key={i.id} className="line">
              <div className="line-main">
                <div>
                  <div className="line-name">
                    {i.name}
                    {i.variant && <span className="muted"> · {i.variant}</span>}
                  </div>
                  {i.extras.length > 0 && <div className="line-sub">+ {i.extras.join(', ')}</div>}
                  {i.note && <div className="line-sub note">“{i.note}”</div>}
                </div>
                <div className="line-price">{clp(i.unitPrice * i.qty)}</div>
              </div>
              <div className="line-actions">
                <div className="qty">
                  <button onClick={() => changeQty(i, -1)} aria-label="Quitar uno">
                    −
                  </button>
                  <span>{i.qty}</span>
                  <button onClick={() => changeQty(i, 1)} aria-label="Agregar uno">
                    +
                  </button>
                </div>
                <button className="ghost small" onClick={() => setNoteFor(i)}>
                  {i.note ? 'Editar nota' : 'Nota'}
                </button>
                {i.sentQty > 0 && <span className="muted small">en comanda: {Math.min(i.sentQty, i.qty)}</span>}
              </div>
            </li>
          ))}
          {order.items.length === 0 && <li className="empty">Toca un producto para agregarlo.</li>}
        </ul>

        <div className="totals">
          <div className="row">
            <span>Subtotal</span>
            <span>{clp(subtotal(order))}</span>
          </div>
          <div className="row">
            <button className="link" onClick={() => setDiscountOpen(true)}>
              {order.discount ? `Descuento ${order.discount.kind === 'porcentaje' ? order.discount.value + '%' : ''}` : 'Agregar descuento'}
            </button>
            <span>{discountAmount(order) ? `−${clp(discountAmount(order))}` : ''}</span>
          </div>
          <div className="row total">
            <span>Total</span>
            <span>{clp(total)}</span>
          </div>
        </div>

        <div className="ticket-actions">
          <button onClick={() => persist() && toast('Pedido guardado')}>Guardar</button>
          <button onClick={sendKitchen} disabled={!unsent}>
            Comanda
          </button>
          <button
            onClick={() => {
              const s = persist();
              if (s) printHtml(preBillHtml(store.get(), s));
            }}
            disabled={order.items.length === 0}
          >
            Precuenta
          </button>
          {saved && (
            <button className="danger-ghost" onClick={() => setVoiding(true)}>
              Anular
            </button>
          )}
          <button
            className="primary wide"
            disabled={order.items.length === 0}
            onClick={() => {
              const s = persist();
              if (s) setPaying(s);
            }}
          >
            Cobrar {clp(total)}
          </button>
        </div>
      </section>

      <nav className="mobile-switch">
        <button className={mobileTab === 'carta' ? 'on' : ''} onClick={() => setMobileTab('carta')}>
          Carta
        </button>
        <button className={mobileTab === 'pedido' ? 'on' : ''} onClick={() => setMobileTab('pedido')}>
          Pedido · {order.items.reduce((s, i) => s + i.qty, 0)} · {clp(total)}
        </button>
      </nav>

      {picking && (
        <OptionsModal
          product={picking}
          onClose={() => setPicking(null)}
          onAdd={(v, ex) => {
            addItem(picking, v, ex);
            setPicking(null);
          }}
        />
      )}
      {noteFor && (
        <NoteModal
          item={noteFor}
          onClose={() => setNoteFor(null)}
          onSave={(note) => {
            setOrder((o) => ({ ...o, items: o.items.map((i) => (i.id === noteFor.id ? { ...i, note } : i)) }));
            setNoteFor(null);
          }}
        />
      )}
      {discountOpen && (
        <DiscountModal
          value={order.discount}
          onClose={() => setDiscountOpen(false)}
          onSave={(d) => {
            setOrder((o) => ({ ...o, discount: d }));
            setDiscountOpen(false);
          }}
        />
      )}
      {paying && (
        <PaymentModal
          order={paying}
          onClose={() => setPaying(null)}
          onPaid={() => {
            setPaying(null);
            reset();
          }}
        />
      )}
      {voiding && saved && (
        <VoidModal
          title={`Anular pedido #${saved.number}`}
          onClose={() => setVoiding(false)}
          onConfirm={(reason) => {
            run(() => store.voidOrder(me.id, saved.id, reason), 'Pedido anulado');
            if (store.get().orders.find((o) => o.id === saved.id)?.status === 'anulado') {
              setVoiding(false);
              reset();
            }
          }}
        />
      )}
    </div>
  );
}

function OptionsModal({ product, onClose, onAdd }: { product: Product; onClose(): void; onAdd(v: string | undefined, extras: string[]): void }) {
  const [variant, setVariant] = useState(product.variants[0]?.name);
  const [extras, setExtras] = useState<string[]>([]);
  const base = variant ? product.variants.find((v) => v.name === variant)!.price : product.price;
  const price = base + extras.reduce((s, e) => s + (product.extras.find((x) => x.name === e)?.price ?? 0), 0);
  return (
    <Modal
      title={product.name}
      onClose={onClose}
      footer={
        <button className="primary wide" onClick={() => onAdd(variant, extras)}>
          Agregar {clp(price)}
        </button>
      }
    >
      {product.variants.length > 0 && (
        <fieldset className="opts">
          <legend>Tamaño / variante</legend>
          {product.variants.map((v) => (
            <label key={v.name} className={`opt ${variant === v.name ? 'on' : ''}`}>
              <input type="radio" name="variant" checked={variant === v.name} onChange={() => setVariant(v.name)} />
              <span>{v.name}</span>
              <span>{clp(v.price)}</span>
            </label>
          ))}
        </fieldset>
      )}
      {product.extras.length > 0 && (
        <fieldset className="opts">
          <legend>Extras</legend>
          {product.extras.map((x) => (
            <label key={x.name} className={`opt ${extras.includes(x.name) ? 'on' : ''}`}>
              <input
                type="checkbox"
                checked={extras.includes(x.name)}
                onChange={(e) =>
                  setExtras((s) =>
                    e.target.checked
                      ? product.extras.map((y) => y.name).filter((n) => s.includes(n) || n === x.name)
                      : s.filter((n) => n !== x.name),
                  )
                }
              />
              <span>{x.name}</span>
              <span>+{clp(x.price)}</span>
            </label>
          ))}
        </fieldset>
      )}
    </Modal>
  );
}

const QUICK_NOTES = ['Sin azúcar', 'Leche sin lactosa', 'Leche vegetal', 'Separar salsa', 'Bien caliente', 'Con hielo'];

function NoteModal({ item, onClose, onSave }: { item: OrderItem; onClose(): void; onSave(n: string): void }) {
  const [note, setNote] = useState(item.note);
  return (
    <Modal
      title={`Nota para ${item.name}`}
      onClose={onClose}
      footer={
        <button className="primary wide" onClick={() => onSave(note.trim())}>
          Guardar nota
        </button>
      }
    >
      <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej: sin azúcar" />
      <div className="chips">
        {QUICK_NOTES.map((n) => (
          <button key={n} className="chip" onClick={() => setNote((s) => (s ? `${s}, ${n.toLowerCase()}` : n))}>
            {n}
          </button>
        ))}
      </div>
    </Modal>
  );
}

function DiscountModal({ value, onClose, onSave }: { value?: Discount; onClose(): void; onSave(d?: Discount): void }) {
  const [kind, setKind] = useState<Discount['kind']>(value?.kind ?? 'porcentaje');
  const [v, setV] = useState<number | ''>(value?.value ?? '');
  return (
    <Modal
      title="Descuento"
      onClose={onClose}
      footer={
        <>
          {value && (
            <button className="ghost" onClick={() => onSave(undefined)}>
              Quitar descuento
            </button>
          )}
          <button className="primary" onClick={() => onSave(v ? { kind, value: v } : undefined)}>
            Aplicar
          </button>
        </>
      }
    >
      <div className="seg">
        <button className={kind === 'porcentaje' ? 'on' : ''} onClick={() => setKind('porcentaje')}>
          Porcentaje
        </button>
        <button className={kind === 'monto' ? 'on' : ''} onClick={() => setKind('monto')}>
          Monto
        </button>
      </div>
      {kind === 'porcentaje' ? (
        <label className="field">
          <span>Porcentaje</span>
          <input inputMode="numeric" value={v} onChange={(e) => setV(e.target.value ? Math.min(100, Number(e.target.value.replace(/\D/g, ''))) : '')} />
        </label>
      ) : (
        <MoneyInput label="Monto" value={v} onChange={setV} />
      )}
      <div className="chips">
        {[5, 10, 15, 20].map((p) => (
          <button
            key={p}
            className="chip"
            onClick={() => {
              setKind('porcentaje');
              setV(p);
            }}
          >
            {p}%
          </button>
        ))}
      </div>
    </Modal>
  );
}

export function VoidModal({ title, onClose, onConfirm }: { title: string; onClose(): void; onConfirm(reason: string): void }) {
  const [reason, setReason] = useState('');
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <button className="danger" disabled={!reason.trim()} onClick={() => onConfirm(reason.trim())}>
          Anular
        </button>
      }
    >
      <label className="field">
        <span>Motivo (obligatorio)</span>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej: cliente se fue, error de digitación" />
      </label>
      <p className="muted small">Queda registrado quién anuló y por qué.</p>
    </Modal>
  );
}
