import { useState } from 'react';
import { clp } from '../domain/calc';
import { uid } from '../domain/store';
import type { Category, Option, Product } from '../domain/types';
import { useAction, useAppState, useSession, useStore } from '../state';
import { Modal, MoneyInput } from './common';

export function Menu() {
  const store = useStore();
  const state = useAppState();
  const { user, toast } = useSession();
  const run = useAction();
  const isAdmin = user!.role === 'admin';
  const [editing, setEditing] = useState<Product | null>(null);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const cats = [...state.categories].sort((a, b) => a.sort - b.sort);
  const names = Object.fromEntries(state.users.map((u) => [u.id, u.name]));

  const newProduct = (categoryId: string): Product => ({
    id: uid('prod'),
    categoryId,
    name: '',
    price: 0,
    variants: [],
    extras: [],
    soldOut: false,
    archived: false,
  });

  return (
    <div className="page">
      <div className="page-head">
        <h1>Carta</h1>
        {isAdmin && (
          <div className="btn-row">
            <button onClick={() => setEditingCat({ id: uid('cat'), name: '', sort: cats.length })}>+ Categoría</button>
            <button className="primary" onClick={() => setEditing(newProduct(cats[0]?.id ?? ''))} disabled={!cats.length}>
              + Producto
            </button>
          </div>
        )}
        <label className="check">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Ver archivados
        </label>
      </div>
      {!isAdmin && <p className="muted">Puedes marcar productos como agotados. Para cambiar precios pide a un administrador.</p>}

      {cats.map((c) => {
        const prods = state.products.filter((p) => p.categoryId === c.id && (showArchived || !p.archived));
        return (
          <div className="card" key={c.id}>
            <div className="card-head">
              <h2>{c.name}</h2>
              {isAdmin && (
                <div className="btn-row">
                  <button className="ghost small" onClick={() => setEditingCat(c)}>
                    Renombrar
                  </button>
                  <button className="ghost small" onClick={() => run(() => store.deleteCategory(user!.id, c.id), 'Categoría eliminada')}>
                    Eliminar
                  </button>
                  <button className="ghost small" onClick={() => setEditing(newProduct(c.id))}>
                    + Producto
                  </button>
                </div>
              )}
            </div>
            <table className="tbl">
              <tbody>
                {prods.map((p) => (
                  <tr key={p.id} className={p.archived ? 'voided' : ''}>
                    <td>
                      <strong>{p.name}</strong>
                      {p.extras.length > 0 && <div className="muted small">Extras: {p.extras.map((e) => e.name).join(', ')}</div>}
                    </td>
                    <td className="num">{p.variants.length ? p.variants.map((v) => `${v.name} ${clp(v.price)}`).join(' · ') : clp(p.price)}</td>
                    <td>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={p.soldOut}
                          onChange={(e) => store.setSoldOut(user!.id, p.id, e.target.checked)}
                          disabled={p.archived}
                        />{' '}
                        Agotado
                      </label>
                    </td>
                    <td className="actions">
                      {isAdmin && (
                        <>
                          <button className="ghost small" onClick={() => setEditing(structuredClone(p))}>
                            Editar
                          </button>
                          {p.archived ? (
                            <button className="ghost small" onClick={() => run(() => store.saveProduct(user!.id, { ...p, archived: false }), 'Producto restaurado')}>
                              Restaurar
                            </button>
                          ) : (
                            <button
                              className="danger-ghost small"
                              onClick={() => {
                                const r = run(() => store.deleteProduct(user!.id, p.id));
                                if (r) toast(r === 'archivado' ? 'Tiene ventas: quedó archivado' : 'Producto eliminado');
                              }}
                            >
                              Quitar
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {prods.length === 0 && (
                  <tr>
                    <td className="muted">Sin productos.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        );
      })}

      {isAdmin && state.priceChanges.length > 0 && (
        <div className="card">
          <h2>Historial de precios</h2>
          <table className="tbl">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Producto</th>
                <th>Antes</th>
                <th>Después</th>
                <th>Por</th>
              </tr>
            </thead>
            <tbody>
              {[...state.priceChanges].reverse().slice(0, 50).map((c) => (
                <tr key={c.id}>
                  <td>{new Date(c.at).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td>{c.productName}</td>
                  <td>{c.before}</td>
                  <td>{c.after}</td>
                  <td>{names[c.by]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <ProductModal
          product={editing}
          categories={cats}
          onClose={() => setEditing(null)}
          onSave={(p) => {
            const ok = run(() => {
              store.saveProduct(user!.id, p);
              return true;
            }, 'Producto guardado');
            if (ok) setEditing(null);
          }}
        />
      )}
      {editingCat && (
        <CategoryModal
          cat={editingCat}
          onClose={() => setEditingCat(null)}
          onSave={(c) => {
            const ok = run(() => {
              store.saveCategory(user!.id, c);
              return true;
            }, 'Categoría guardada');
            if (ok) setEditingCat(null);
          }}
        />
      )}
    </div>
  );
}

function CategoryModal({ cat, onClose, onSave }: { cat: Category; onClose(): void; onSave(c: Category): void }) {
  const [name, setName] = useState(cat.name);
  return (
    <Modal
      title={cat.name ? 'Renombrar categoría' : 'Nueva categoría'}
      onClose={onClose}
      footer={
        <button className="primary" onClick={() => onSave({ ...cat, name: name.trim() })}>
          Guardar
        </button>
      }
    >
      <label className="field">
        <span>Nombre</span>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
    </Modal>
  );
}

function OptionList({ label, items, onChange, hint }: { label: string; items: Option[]; onChange(o: Option[]): void; hint: string }) {
  return (
    <fieldset className="opts">
      <legend>{label}</legend>
      <p className="muted small">{hint}</p>
      {items.map((o, i) => (
        <div className="form-row" key={i}>
          <input
            aria-label="Nombre"
            placeholder="Nombre"
            value={o.name}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
          />
          <MoneyInput value={o.price} onChange={(v) => onChange(items.map((x, j) => (j === i ? { ...x, price: v === '' ? 0 : v } : x)))} />
          <button className="ghost small" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Quitar">
            ✕
          </button>
        </div>
      ))}
      <button className="ghost small" onClick={() => onChange([...items, { name: '', price: 0 }])}>
        + Agregar
      </button>
    </fieldset>
  );
}

function ProductModal({
  product,
  categories,
  onClose,
  onSave,
}: {
  product: Product;
  categories: Category[];
  onClose(): void;
  onSave(p: Product): void;
}) {
  const [p, setP] = useState(product);
  return (
    <Modal
      title={product.name ? `Editar ${product.name}` : 'Nuevo producto'}
      onClose={onClose}
      wide
      footer={
        <button
          className="primary"
          onClick={() =>
            onSave({
              ...p,
              name: p.name.trim(),
              variants: p.variants.filter((v) => v.name.trim()),
              extras: p.extras.filter((v) => v.name.trim()),
              price: p.variants.filter((v) => v.name.trim()).length ? Math.min(...p.variants.filter((v) => v.name.trim()).map((v) => v.price)) : p.price,
            })
          }
        >
          Guardar
        </button>
      }
    >
      <div className="form-row">
        <label className="field grow">
          <span>Nombre</span>
          <input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
        </label>
        <label className="field">
          <span>Categoría</span>
          <select value={p.categoryId} onChange={(e) => setP({ ...p, categoryId: e.target.value })}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {p.variants.length === 0 && <MoneyInput label="Precio (IVA incluido)" value={p.price} onChange={(v) => setP({ ...p, price: v === '' ? 0 : v })} />}
      <OptionList
        label="Variantes (tamaños)"
        hint="Si agregas variantes, cada una tiene su precio final y reemplaza al precio base."
        items={p.variants}
        onChange={(variants) => setP({ ...p, variants })}
      />
      <OptionList label="Extras" hint="Se suman al precio. Ej: leche vegetal +$600." items={p.extras} onChange={(extras) => setP({ ...p, extras })} />
    </Modal>
  );
}
