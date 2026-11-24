/**
 * Sincronización entre celulares, tablets y computadores con Supabase.
 *
 * Cada elemento (cuenta, comanda, gasto, producto…) es una fila en la tabla `records`.
 * Los cambios de este equipo se suben agrupados cada medio segundo; los de otros equipos
 * llegan al instante por Realtime. Sin internet, los cambios quedan pendientes y se suben al volver.
 */
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { migrate, type Store } from './domain/store';
import type { AppState } from './domain/types';
import { setRemotePhotos } from './photos';

const ARRAYS = ['categories', 'products', 'promotions', 'tables', 'accounts', 'comandas', 'staff', 'expenses', 'movements', 'tipPayouts', 'reserves', 'counts', 'closes', 'ledgerHistory', 'audit'] as const;
type ArrayKey = (typeof ARRAYS)[number];
/** Colecciones donde importa el orden que eligió administración. */
const ORDERED = new Set<ArrayKey>(['categories', 'tables', 'staff', 'reserves', 'promotions']);
const TIME_FIELDS = ['openedAt', 'createdAt', 'at', 'closedAt', 'date'];

interface Row {
  collection: string;
  id: string;
  data: unknown;
  deleted?: boolean;
}

export type SyncStatus = 'apagada' | 'sin-sesion' | 'conectando' | 'al-dia' | 'subiendo' | 'sin-conexion' | 'error';
export interface SyncInfo {
  status: SyncStatus;
  pending: number;
  lastSync?: string;
  error?: string;
  email?: string;
  url?: string;
}

const CONFIG_KEY = 'dolce-rosa:sync-config';
const PENDING_KEY = 'dolce-rosa:sync-pendiente';
const DEVICE_KEY = 'dolce-rosa:equipo';

function authMessage(m: string) {
  if (m === 'Invalid login credentials') return 'Correo o contraseña incorrectos (o la cuenta aún no existe: créala abajo)';
  if (/not confirmed/i.test(m)) return 'Falta confirmar el correo: abre el enlace que llegó al correo de la cuenta del local';
  if (/already registered/i.test(m)) return 'Esa cuenta ya existe: usa Iniciar sesión';
  if (/at least 6/i.test(m)) return 'La contraseña debe tener al menos 6 caracteres';
  return m;
}

export function syncConfig(): { url: string; key: string } | null {
  const env = import.meta.env as Record<string, string | undefined>;
  if (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_KEY) return { url: env.VITE_SUPABASE_URL, key: env.VITE_SUPABASE_KEY };
  try {
    const c = JSON.parse(localStorage.getItem(CONFIG_KEY) ?? 'null');
    return c?.url && c?.key ? c : null;
  } catch {
    return null;
  }
}
export function saveSyncConfig(c: { url: string; key: string } | null) {
  if (c) localStorage.setItem(CONFIG_KEY, JSON.stringify(c));
  else localStorage.removeItem(CONFIG_KEY);
}

const device = (() => {
  try {
    let d = localStorage.getItem(DEVICE_KEY);
    if (!d) localStorage.setItem(DEVICE_KEY, (d = `eq_${Math.random().toString(36).slice(2, 10)}`));
    return d;
  } catch {
    return 'eq_sin_nombre';
  }
})();

/** Filas que representan el estado completo. */
export function toRows(s: AppState): Row[] {
  const rows: Row[] = [];
  for (const k of ARRAYS)
    (s[k] as { id: string }[]).forEach((item, i) => rows.push({ collection: k, id: item.id, data: ORDERED.has(k) ? { ...item, _ord: i } : item }));
  rows.push({ collection: 'settings', id: 'main', data: s.settings });
  rows.push({ collection: 'meta', id: 'counters', data: { nextAccount: s.nextAccount, nextComanda: s.nextComanda, nextFolio: s.nextFolio } });
  return rows;
}

const timeOf = (x: Record<string, unknown>) => String(TIME_FIELDS.map((f) => x[f]).find(Boolean) ?? '');

/** Arma el estado a partir de las filas, partiendo de `base` para lo que no venga. */
export function fromRows(rows: Row[], base: AppState): AppState {
  const s = structuredClone(base);
  const by = new Map<string, Record<string, unknown>[]>();
  for (const r of rows) {
    if (r.deleted) continue;
    if (r.collection === 'settings') s.settings = { ...s.settings, ...(r.data as AppState['settings']) };
    else if (r.collection === 'meta') {
      const c = r.data as Pick<AppState, 'nextAccount' | 'nextComanda' | 'nextFolio'>;
      s.nextAccount = Math.max(1, c.nextAccount);
      s.nextComanda = Math.max(1, c.nextComanda);
      s.nextFolio = Math.max(1, c.nextFolio);
    } else if ((ARRAYS as readonly string[]).includes(r.collection)) {
      const list = by.get(r.collection) ?? [];
      list.push(r.data as Record<string, unknown>);
      by.set(r.collection, list);
    }
  }
  for (const k of ARRAYS) {
    const list = by.get(k);
    if (!list) {
      (s as unknown as Record<string, unknown[]>)[k] = [];
      continue;
    }
    if (ORDERED.has(k)) list.sort((a, b) => Number(a._ord ?? 0) - Number(b._ord ?? 0));
    else list.sort((a, b) => timeOf(a).localeCompare(timeOf(b)));
    (s as unknown as Record<string, unknown[]>)[k] = list.map(({ _ord, ...x }) => (void _ord, x));
  }
  return migrate(s)!;
}

const rowKey = (r: Pick<Row, 'collection' | 'id'>) => `${r.collection}/${r.id}`;

class Sync {
  info: SyncInfo = { status: 'apagada', pending: 0 };
  private listeners = new Set<() => void>();
  private client: SupabaseClient | null = null;
  private channel: RealtimeChannel | null = null;
  /** Cómo estaba cada fila la última vez que se comparó (para saber qué cambió aquí). */
  private cache = new Map<string, string>();
  private tracking = false;
  private pending = new Map<string, Row>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private store!: Store;
  private ready = false;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  get = () => this.info;
  private set(patch: Partial<SyncInfo>) {
    this.info = { ...this.info, ...patch, pending: this.pending.size };
    this.listeners.forEach((l) => l());
  }

  async start(store: Store) {
    this.store = store;
    try {
      for (const r of JSON.parse(localStorage.getItem(PENDING_KEY) ?? '[]') as Row[]) this.pending.set(rowKey(r), r);
    } catch {
      /* nada pendiente */
    }
    store.onLocalChange(() => this.tracking && this.schedule());
    const cfg = syncConfig();
    if (!cfg) return this.set({ status: 'apagada' });
    // Desde que hay conexión configurada, se anota todo cambio hecho aquí (aunque no haya internet).
    this.snapshot();
    this.tracking = true;
    const { createClient } = await import('@supabase/supabase-js');
    this.client = createClient(cfg.url, cfg.key, { auth: { persistSession: true, autoRefreshToken: true } });
    this.set({ url: cfg.url });
    setRemotePhotos({
      upload: async (key, blob) => {
        const { error } = await this.client!.storage.from('boletas').upload(key, blob, { contentType: 'image/jpeg', upsert: true });
        if (error) throw error;
      },
      download: async (key) => {
        const { data } = await this.client!.storage.from('boletas').download(key);
        return data ?? null;
      },
    });
    const { data } = await this.client.auth.getSession();
    if (!data.session) return this.set({ status: 'sin-sesion' });
    await this.connect(data.session.user.email ?? '');
  }

  async signIn(email: string, password: string) {
    if (!this.client) throw new Error('Primero configura la conexión');
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(authMessage(error.message));
    await this.connect(data.user.email ?? email);
  }

  /** Crea la cuenta del local desde la app (una sola vez). Devuelve true si quedó conectada. */
  async signUp(email: string, password: string): Promise<boolean> {
    if (!this.client) throw new Error('Primero configura la conexión');
    const { data, error } = await this.client.auth.signUp({ email, password });
    if (error) throw new Error(authMessage(error.message));
    if (!data.session) return false; // Supabase pide confirmar el correo primero.
    await this.connect(data.user?.email ?? email);
    return true;
  }

  async signOut() {
    await this.channel?.unsubscribe();
    await this.client?.auth.signOut();
    this.ready = false;
    this.set({ status: 'sin-sesion', email: undefined });
  }

  private async connect(email: string) {
    this.set({ status: 'conectando', email, error: undefined });
    try {
      const remote = await this.pullAll();
      const local = this.store.get();
      this.diff();
      if (remote.length === 0) {
        // Primer equipo: sube todo lo que tiene.
        for (const r of toRows(local)) this.pending.set(rowKey(r), r);
      } else {
        // Lo que este equipo cambió sin conexión se aplica encima de la nube.
        const merged = fromRows([...remote.filter((r) => !this.pending.has(rowKey(r))), ...this.pending.values()], local);
        this.store.applyRemote(merged);
        this.snapshot();
      }
      this.ready = true;
      this.listen();
      await this.flush();
      this.backupIfDue();
    } catch (e) {
      this.set({ status: navigator.onLine ? 'error' : 'sin-conexion', error: e instanceof Error ? e.message : String(e) });
      setTimeout(() => this.info.status !== 'al-dia' && this.connect(email), 15000);
    }
  }

  private async pullAll(): Promise<Row[]> {
    const out: Row[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await this.client!.from('records').select('collection,id,data,deleted').range(from, from + 999);
      if (error) throw error;
      out.push(...(data as Row[]));
      if (!data || data.length < 1000) return out;
    }
  }

  private listen() {
    this.channel?.unsubscribe();
    this.channel = this.client!.channel('records')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'records' }, (p) => {
        const r = p.new as Row & { device?: string };
        if (!r?.collection || r.device === device) return;
        const k = rowKey(r);
        const json = r.deleted ? '' : JSON.stringify(r.data);
        if (this.cache.get(k) === json) return;
        this.diff(); // primero anota lo que haya cambiado aquí
        if (this.pending.has(k)) return; // nuestro cambio sin subir gana; se sube enseguida
        if (r.deleted) this.cache.delete(k);
        else this.cache.set(k, json);
        this.applyOne(r);
      })
      .subscribe((st) => {
        if (st === 'SUBSCRIBED') this.set({ status: this.pending.size ? 'subiendo' : 'al-dia', lastSync: new Date().toISOString() });
        if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') this.set({ status: 'sin-conexion' });
      });
  }

  /** Toma nota de cómo está todo ahora, sin marcar nada como cambiado. */
  private snapshot() {
    this.cache.clear();
    for (const r of toRows(this.store.get())) this.cache.set(rowKey(r), JSON.stringify(r.data));
  }

  private applyOne(r: Row) {
    const s = structuredClone(this.store.get());
    if (r.collection === 'settings') s.settings = { ...s.settings, ...(r.data as AppState['settings']) };
    else if (r.collection === 'meta') {
      const c = r.data as Pick<AppState, 'nextAccount' | 'nextComanda' | 'nextFolio'>;
      // Los contadores nunca retroceden.
      s.nextAccount = Math.max(s.nextAccount, c.nextAccount);
      s.nextComanda = Math.max(s.nextComanda, c.nextComanda);
      s.nextFolio = Math.max(s.nextFolio, c.nextFolio);
    } else if ((ARRAYS as readonly string[]).includes(r.collection)) {
      const k = r.collection as ArrayKey;
      const list = s[k] as unknown as Record<string, unknown>[];
      const i = list.findIndex((x) => x.id === r.id);
      if (r.deleted) {
        if (i >= 0) list.splice(i, 1);
      } else {
        const { _ord, ...item } = r.data as Record<string, unknown>;
        if (i >= 0) list[i] = item;
        else list.push(item);
        if (ORDERED.has(k) && _ord !== undefined) {
          const j = list.indexOf(item);
          list.splice(j, 1);
          list.splice(Math.min(Number(_ord), list.length), 0, item);
        }
      }
    }
    this.store.applyRemote(s);
    this.set({ lastSync: new Date().toISOString() });
  }

  private schedule() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.diff();
      if (this.ready) this.flush();
    }, 500);
  }

  /** Compara con lo último conocido de la nube y deja pendiente lo que cambió. */
  private diff() {
    const rows = toRows(this.store.get());
    const seen = new Set<string>();
    let changed = false;
    for (const r of rows) {
      const k = rowKey(r);
      seen.add(k);
      const json = JSON.stringify(r.data);
      if (this.cache.get(k) !== json) {
        this.pending.set(k, r);
        this.cache.set(k, json);
        changed = true;
      }
    }
    for (const k of [...this.cache.keys()])
      if (!seen.has(k)) {
        const [collection, id] = [k.slice(0, k.indexOf('/')), k.slice(k.indexOf('/') + 1)];
        this.pending.set(k, { collection, id, data: {}, deleted: true });
        this.cache.delete(k);
        changed = true;
      }
    if (changed) this.savePending();
  }

  private savePending() {
    try {
      localStorage.setItem(PENDING_KEY, JSON.stringify([...this.pending.values()]));
    } catch {
      /* muy grande para guardar: queda en memoria */
    }
    this.set({});
  }

  private flushing = false;
  async flush() {
    if (!this.client || !this.ready || this.flushing || !this.pending.size) return;
    this.flushing = true;
    this.set({ status: 'subiendo' });
    try {
      const batch = [...this.pending.values()];
      for (let i = 0; i < batch.length; i += 500) {
        const part = batch.slice(i, i + 500);
        const { error } = await this.client.from('records').upsert(
          part.map((r) => ({ collection: r.collection, id: r.id, data: r.data, deleted: !!r.deleted, device, updated_at: new Date().toISOString() })),
          { onConflict: 'collection,id' },
        );
        if (error) throw error;
        for (const r of part) {
          const k = rowKey(r);
          if (this.pending.get(k) === r) this.pending.delete(k);
        }
      }
      this.savePending();
      this.set({ status: 'al-dia', lastSync: new Date().toISOString(), error: undefined });
    } catch (e) {
      this.set({ status: navigator.onLine ? 'error' : 'sin-conexion', error: e instanceof Error ? e.message : String(e) });
      setTimeout(() => this.flush(), 10000);
    } finally {
      this.flushing = false;
      if (this.pending.size && this.info.status === 'al-dia') this.flush();
    }
  }

  /** Vuelve a subir todo lo de este equipo (por si la nube quedó incompleta). */
  async pushAll() {
    for (const r of toRows(this.store.get())) this.pending.set(rowKey(r), r);
    this.savePending();
    await this.flush();
  }

  /** Reemplaza los datos de este equipo por los de la nube. */
  async pullReplace() {
    const remote = await this.pullAll();
    this.pending.clear();
    this.store.applyRemote(fromRows(remote, this.store.get()));
    this.snapshot();
    this.savePending();
  }

  /** Un respaldo completo al día en la nube (se guardan 30 días). */
  private async backupIfDue() {
    try {
      const { data } = await this.client!.from('backups').select('created_at').order('created_at', { ascending: false }).limit(1);
      const last = data?.[0]?.created_at as string | undefined;
      if (last && Date.now() - new Date(last).getTime() < 20 * 3600 * 1000) return;
      await this.client!.from('backups').insert({ device, data: this.store.get() });
    } catch {
      /* se intenta de nuevo la próxima vez */
    }
  }

  async listBackups(): Promise<{ id: number; created_at: string }[]> {
    if (!this.client) return [];
    const { data } = await this.client.from('backups').select('id,created_at').order('created_at', { ascending: false }).limit(30);
    return data ?? [];
  }

  async getBackup(id: number): Promise<AppState | null> {
    const { data } = await this.client!.from('backups').select('data').eq('id', id).single();
    return data ? migrate(data.data) : null;
  }
}

export const sync = new Sync();
export function startSync(store: Store) {
  sync.start(store).catch((e) => console.warn('Sincronización', e));
  addEventListener('online', () => sync.flush());
}
