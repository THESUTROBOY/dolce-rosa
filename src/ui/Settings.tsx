import { useState } from 'react';
import { demoState } from '../domain/demo';
import { seedState } from '../domain/seed';
import { uid } from '../domain/store';
import type { Role, Settings as S, TableDef, User } from '../domain/types';
import { CASH } from '../domain/types';
import { useAction, useAppState, useSession, useStore } from '../state';
import { downloadFile, Modal } from './common';

export function Settings() {
  const store = useStore();
  const state = useAppState();
  const { user } = useSession();
  const run = useAction();
  const [s, setS] = useState<S>(state.settings);
  const [methods, setMethods] = useState(state.settings.paymentMethods.join(', '));
  const [tables, setTables] = useState<TableDef[]>(state.tables);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [confirming, setConfirming] = useState<'demo' | 'vacio' | null>(null);

  const saveSettings = () => {
    const list = methods
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);
    if (!list.includes(CASH)) list.unshift(CASH);
    run(() => store.saveSettings(user!.id, { ...s, paymentMethods: list }), 'Configuración guardada');
    setMethods(list.join(', '));
  };

  return (
    <div className="page">
      <h1>Ajustes</h1>
      <div className="two-col">
        <div className="card">
          <h2>Negocio y comprobante</h2>
          {(
            [
              ['businessName', 'Nombre'],
              ['address', 'Dirección'],
              ['phone', 'Teléfono / Instagram'],
              ['receiptFooter', 'Pie del comprobante'],
            ] as const
          ).map(([k, label]) => (
            <label className="field" key={k}>
              <span>{label}</span>
              <input value={s[k]} onChange={(e) => setS({ ...s, [k]: e.target.value })} />
            </label>
          ))}
          <label className="field">
            <span>Propina sugerida (%)</span>
            <input
              inputMode="numeric"
              value={s.tipPercent}
              onChange={(e) => setS({ ...s, tipPercent: Math.min(100, Number(e.target.value.replace(/\D/g, '') || 0)) })}
            />
          </label>
          <label className="field">
            <span>Medios de pago (separados por coma; Efectivo siempre existe)</span>
            <input value={methods} onChange={(e) => setMethods(e.target.value)} />
          </label>
          <button className="primary" onClick={saveSettings}>
            Guardar
          </button>
        </div>

        <div className="card">
          <h2>Mesas</h2>
          <ul className="simple-list">
            {tables.map((t, i) => (
              <li key={t.id}>
                <input
                  aria-label="Nombre de la mesa"
                  value={t.name}
                  onChange={(e) => setTables(tables.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                />
                <button className="ghost small" onClick={() => setTables(tables.filter((_, j) => j !== i))} aria-label="Quitar mesa">
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <div className="btn-row">
            <button className="ghost" onClick={() => setTables([...tables, { id: uid('mesa'), name: `Mesa ${tables.length + 1}` }])}>
              + Mesa
            </button>
            <button className="primary" onClick={() => run(() => store.saveTables(user!.id, tables.filter((t) => t.name.trim())), 'Mesas guardadas')}>
              Guardar mesas
            </button>
          </div>
        </div>

        <div className="card">
          <h2>Usuarios</h2>
          <table className="tbl">
            <tbody>
              {state.users.map((u) => (
                <tr key={u.id} className={u.active ? '' : 'voided'}>
                  <td>{u.name}</td>
                  <td>{u.role === 'admin' ? 'Administrador' : 'Cajero'}</td>
                  <td>{u.active ? 'Activo' : 'Desactivado'}</td>
                  <td className="actions">
                    <button className="ghost small" onClick={() => setEditingUser(structuredClone(u))}>
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={() => setEditingUser({ id: uid('user'), name: '', role: 'cajero', pin: '', active: true })}>+ Usuario</button>
          <p className="muted small">Cajero: vende, cobra, maneja la caja y marca agotados. Administrador: además edita carta y precios, anula ventas cobradas y ve ajustes.</p>
        </div>

        <div className="card">
          <h2>Respaldo</h2>
          <p className="muted small">
            En esta versión de prueba los datos se guardan en este navegador. Descarga un respaldo al final de cada día; con la base de datos en la nube esto
            será automático.
          </p>
          <div className="btn-row">
            <button onClick={() => downloadFile(`dolce-rosa-respaldo-${new Date().toISOString().slice(0, 10)}.json`, store.exportBackup(), 'application/json')}>
              Descargar respaldo
            </button>
            <label className="button">
              Restaurar respaldo
              <input
                type="file"
                accept="application/json"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const text = await f.text();
                  run(() => store.importBackup(user!.id, text), 'Respaldo restaurado');
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        </div>
        <div className="card">
          <h2>Datos de prueba</h2>
          <p className="muted small">
            Vuelve a cargar el mes de ventas de ejemplo, o deja la app vacía (solo carta y usuarios) para partir de verdad. Esto reemplaza todo lo
            que hay en este equipo.
          </p>
          {confirming ? (
            <div className="btn-row">
              <span>¿Seguro? Se pierden los datos actuales.</span>
              <button
                className="danger"
                onClick={() => {
                  run(() => store.replaceAll(user!.id, confirming === 'demo' ? demoState() : seedState()), confirming === 'demo' ? 'Datos de prueba cargados' : 'App vacía');
                  setConfirming(null);
                }}
              >
                Sí, reemplazar
              </button>
              <button className="ghost" onClick={() => setConfirming(null)}>
                Cancelar
              </button>
            </div>
          ) : (
            <div className="btn-row">
              <button onClick={() => setConfirming('demo')}>Cargar datos de prueba</button>
              <button className="danger-ghost" onClick={() => setConfirming('vacio')}>
                Empezar desde cero
              </button>
            </div>
          )}
        </div>
      </div>

      {editingUser && (
        <UserModal
          u={editingUser}
          onClose={() => setEditingUser(null)}
          onSave={(u) => {
            const ok = run(() => {
              store.saveUser(user!.id, u);
              return true;
            }, 'Usuario guardado');
            if (ok) setEditingUser(null);
          }}
        />
      )}
    </div>
  );
}

function UserModal({ u, onClose, onSave }: { u: User; onClose(): void; onSave(u: User): void }) {
  const [x, setX] = useState(u);
  return (
    <Modal
      title={u.name ? `Editar ${u.name}` : 'Nuevo usuario'}
      onClose={onClose}
      footer={
        <button className="primary" onClick={() => onSave({ ...x, name: x.name.trim() })}>
          Guardar
        </button>
      }
    >
      <label className="field">
        <span>Nombre</span>
        <input value={x.name} onChange={(e) => setX({ ...x, name: e.target.value })} />
      </label>
      <label className="field">
        <span>Rol</span>
        <select value={x.role} onChange={(e) => setX({ ...x, role: e.target.value as Role })}>
          <option value="cajero">Cajero</option>
          <option value="admin">Administrador</option>
        </select>
      </label>
      <label className="field">
        <span>PIN (4 a 6 dígitos)</span>
        <input inputMode="numeric" value={x.pin} onChange={(e) => setX({ ...x, pin: e.target.value.replace(/\D/g, '').slice(0, 6) })} />
      </label>
      <label className="check">
        <input type="checkbox" checked={x.active} onChange={(e) => setX({ ...x, active: e.target.checked })} /> Activo
      </label>
    </Modal>
  );
}
