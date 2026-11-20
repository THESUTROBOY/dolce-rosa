import { migrate, type Persistence } from './domain/store';
import type { AppState } from './domain/types';

/**
 * Guarda los datos en IndexedDB (sin el límite de ~5 MB de localStorage).
 * Lee una sola vez al abrir la app; después escribe con un pequeño retardo.
 * Avisa a otras pestañas del mismo equipo con BroadcastChannel.
 */
const DB = 'dolce-rosa';
const STORE = 'estado';

function openDb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export async function idbPersistence(key: string, legacyKey?: string): Promise<Persistence> {
  let db: IDBDatabase | null = null;
  let initial: AppState | null = null;
  try {
    db = await openDb();
    const raw = await new Promise<unknown>((res, rej) => {
      const q = db!.transaction(STORE).objectStore(STORE).get(key);
      q.onsuccess = () => res(q.result);
      q.onerror = () => rej(q.error);
    });
    initial = raw ? migrate(raw) : null;
  } catch {
    db = null;
  }
  // Datos guardados por versiones anteriores en localStorage.
  if (!initial && legacyKey) {
    try {
      const raw = localStorage.getItem(legacyKey);
      initial = raw ? migrate(JSON.parse(raw)) : null;
    } catch {
      /* sin datos anteriores */
    }
  }
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(`${key}-cambios`) : null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: AppState | null = null;
  const flush = () => {
    timer = null;
    const s = pending;
    pending = null;
    if (!s) return;
    if (db) {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(s, key);
      tx.oncomplete = () => channel?.postMessage('cambio');
    } else {
      try {
        localStorage.setItem(legacyKey ?? key, JSON.stringify(s));
      } catch {
        /* sin almacenamiento: sigue en memoria */
      }
    }
  };
  addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
  return {
    load: () => initial,
    save(state) {
      pending = state;
      if (!timer) timer = setTimeout(flush, 250);
    },
    watch(fn) {
      channel?.addEventListener('message', async () => {
        if (!db) return;
        const raw = await new Promise<unknown>((res) => {
          const q = db!.transaction(STORE).objectStore(STORE).get(key);
          q.onsuccess = () => res(q.result);
          q.onerror = () => res(null);
        });
        const s = raw ? migrate(raw) : null;
        if (s) fn(s);
      });
    },
  };
}
