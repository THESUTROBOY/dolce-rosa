/**
 * Fotos de boletas y facturas. Se guardan comprimidas en este equipo (IndexedDB)
 * y, si la sincronización está activa, también en la nube para verlas desde otros equipos.
 */
const DB = 'dolce-rosa-fotos';
const STORE = 'fotos';

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((res, rej) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

/** Achica la foto a 1280 px de lado mayor en JPEG: pesa ~150 KB. */
export async function compress(file: File, max = 1280, quality = 0.72): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo procesar la foto'))), 'image/jpeg', quality));
}

export interface RemotePhotos {
  upload(key: string, blob: Blob): Promise<void>;
  download(key: string): Promise<Blob | null>;
}
let remote: RemotePhotos | null = null;
export const setRemotePhotos = (r: RemotePhotos | null) => (remote = r);

export async function savePhoto(file: File): Promise<string> {
  const blob = await compress(file);
  const key = `boleta_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}.jpg`;
  await tx('readwrite', (s) => s.put(blob, key));
  remote?.upload(key, blob).catch((e) => console.warn('Foto sin subir', e));
  return key;
}

export async function photoUrl(key: string): Promise<string | null> {
  let blob = (await tx<Blob | undefined>('readonly', (s) => s.get(key)).catch(() => undefined)) ?? null;
  if (!blob && remote) {
    blob = await remote.download(key).catch(() => null);
    if (blob) await tx('readwrite', (s) => s.put(blob!, key)).catch(() => undefined);
  }
  return blob ? URL.createObjectURL(blob) : null;
}
