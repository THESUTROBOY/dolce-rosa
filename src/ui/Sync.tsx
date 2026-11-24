import { useEffect, useState, useSyncExternalStore } from 'react';
import { saveSyncConfig, sync, syncConfig, type SyncStatus } from '../sync';
import { useAction, useStore, useUi } from '../state';

const LABEL: Record<SyncStatus, string> = {
  apagada: 'Sin sincronizar: los datos viven solo en este equipo',
  'sin-sesion': 'Falta iniciar sesión con la cuenta del local',
  conectando: 'Conectando…',
  'al-dia': 'Sincronizado',
  subiendo: 'Subiendo cambios…',
  'sin-conexion': 'Sin internet: los cambios se guardan y se suben al volver',
  error: 'Error al sincronizar',
};
const TONE: Record<SyncStatus, string> = { apagada: 'warn', 'sin-sesion': 'warn', conectando: '', 'al-dia': 'ok', subiendo: '', 'sin-conexion': 'warn', error: 'danger' };

export function useSync() {
  return useSyncExternalStore(sync.subscribe, sync.get);
}

/** Puntito de estado para la barra de pestañas. */
export function SyncDot() {
  const info = useSync();
  if (info.status === 'apagada') return null;
  return <span className={`sync-dot tone-${TONE[info.status] || 'muted'}`} title={LABEL[info.status]} aria-label={LABEL[info.status]} />;
}

export function SyncAdmin() {
  const info = useSync();
  const store = useStore();
  const run = useAction();
  const { isAdmin, toast } = useUi();
  const cfg = syncConfig();
  const [url, setUrl] = useState(cfg?.url ?? '');
  const [key, setKey] = useState(cfg?.key ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [backups, setBackups] = useState<{ id: number; created_at: string }[]>([]);
  useEffect(() => {
    if (info.status === 'al-dia') sync.listBackups().then(setBackups);
  }, [info.status]);
  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) toast(ok);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo', 'error');
    }
    setBusy(false);
  };

  return (
    <section className="group">
      <h2 className="group-title">Sincronización entre equipos</h2>
      <p className={`sync-status tone-${TONE[info.status]}`}>
        <span className={`sync-dot tone-${TONE[info.status] || 'muted'}`} aria-hidden /> {LABEL[info.status]}
        {info.pending > 0 && ` · ${info.pending} cambios por subir`}
      </p>
      {info.error && <p className="hint warn-text">{info.error}</p>}
      {info.lastSync && <p className="hint">Último cambio sincronizado: {new Date(info.lastSync).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'medium' })}</p>}

      {!cfg && (
        <>
          <p className="hint">Con la base de datos en la nube, celulares, tablets y computadores ven lo mismo al instante. Pega la dirección y la clave pública del proyecto.</p>
          <label className="field" htmlFor="sb-url">
            <span>Dirección del proyecto</span>
            <input id="sb-url" value={url} onChange={(e) => setUrl(e.target.value.trim())} placeholder="https://xxxx.supabase.co" />
          </label>
          <label className="field" htmlFor="sb-key">
            <span>Clave pública (publishable)</span>
            <input id="sb-key" value={key} onChange={(e) => setKey(e.target.value.trim())} placeholder="sb_publishable_…" />
          </label>
          <button
            className="btn-primary wide"
            disabled={!/^https:\/\/.+/.test(url) || key.length < 20}
            onClick={() => {
              saveSyncConfig({ url, key });
              location.reload();
            }}
          >
            Guardar y conectar
          </button>
        </>
      )}

      {cfg && !info.email && info.status !== 'apagada' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            act(() => sync.signIn(email, password), 'Equipo conectado');
          }}
        >
          <p className="hint">Inicia sesión una vez en cada equipo con la cuenta del local.</p>
          <label className="field" htmlFor="sb-mail">
            <span>Correo de la cuenta del local</span>
            <input id="sb-mail" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field" htmlFor="sb-pass">
            <span>Contraseña</span>
            <input id="sb-pass" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <button className="btn-primary wide" disabled={busy || !email || !password}>
            {busy ? 'Conectando…' : 'Iniciar sesión'}
          </button>
          <p className="hint">¿Primera vez? Crea la cuenta del local con un correo y una contraseña (mínimo 6 caracteres) y úsala después en todos los equipos.</p>
          <button
            type="button"
            className="btn-secondary wide"
            disabled={busy || !email || password.length < 6}
            onClick={() =>
              act(async () => {
                const ok = await sync.signUp(email, password);
                toast(ok ? 'Cuenta creada y equipo conectado' : 'Cuenta creada: confirma el correo y luego inicia sesión');
              })
            }
          >
            Crear la cuenta del local
          </button>
        </form>
      )}

      {cfg && info.email && (
        <>
          <p className="hint">Conectado como {info.email}.</p>
          <div className="btn-pair">
            <button className="btn-secondary" disabled={busy} onClick={() => act(() => sync.pushAll(), 'Datos subidos')}>
              Subir todo de nuevo
            </button>
            <button className="btn-secondary" disabled={busy} onClick={() => act(() => sync.pullReplace(), 'Datos descargados de la nube')}>
              Bajar desde la nube
            </button>
          </div>
          {backups.length > 0 && (
            <details className="flavors-admin">
              <summary>Respaldos diarios en la nube ({backups.length})</summary>
              <ul className="list">
                {backups.map((b) => (
                  <li key={b.id} className="kv">
                    <span>{new Date(b.created_at).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                    <span />
                    <button
                      className="btn-plain small"
                      onClick={() =>
                        act(async () => {
                          const s = await sync.getBackup(b.id);
                          if (s) run(() => store.replaceAll(isAdmin, s), 'Respaldo restaurado');
                        })
                      }
                    >
                      Restaurar
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      {cfg && !(import.meta.env as Record<string, string | undefined>).VITE_SUPABASE_URL && (
        <button
          className="btn-plain danger"
          onClick={async () => {
            await sync.signOut();
            saveSyncConfig(null);
            location.reload();
          }}
        >
          Desconectar este equipo
        </button>
      )}
    </section>
  );
}
