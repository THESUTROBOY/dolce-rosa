import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { demoState } from './domain/demo';
import { DomainError, localPersistence, Store } from './domain/store';
import type { AppState } from './domain/types';

const store = new Store(localPersistence('dolce-rosa:v3'), () => demoState());
const StoreCtx = createContext(store);

interface Ui {
  isAdmin: boolean;
  setAdmin(v: boolean): void;
  toast(msg: string, kind?: 'ok' | 'error'): void;
}
const UiCtx = createContext<Ui>(null!);

const ADMIN_KEY = 'dolce-rosa:admin';

export function Providers({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(() => {
    try {
      return sessionStorage.getItem(ADMIN_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [toasts, setToasts] = useState<{ id: number; msg: string; kind: 'ok' | 'error' }[]>([]);

  const setAdmin = useCallback((v: boolean) => {
    setIsAdmin(v);
    try {
      if (v) sessionStorage.setItem(ADMIN_KEY, '1');
      else sessionStorage.removeItem(ADMIN_KEY);
    } catch {
      /* sin almacenamiento de sesión */
    }
  }, []);

  const toast = useCallback((msg: string, kind: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 4200 : 2400);
    if (kind === 'error') navigator.vibrate?.(30);
  }, []);

  return (
    <StoreCtx.Provider value={store}>
      <UiCtx.Provider value={{ isAdmin, setAdmin, toast }}>
        {children}
        <div className="toasts" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast toast-${t.kind}`}>
              {t.msg}
            </div>
          ))}
        </div>
      </UiCtx.Provider>
    </StoreCtx.Provider>
  );
}

export const useStore = () => useContext(StoreCtx);
export const useAppState = (): AppState => {
  const s = useStore();
  return useSyncExternalStore(s.subscribe, s.get);
};
export const useUi = () => useContext(UiCtx);

/** Corre una acción del dominio y muestra el error en un aviso si falla. */
export function useAction() {
  const { toast } = useUi();
  return useCallback(
    <T,>(fn: () => T, okMsg?: string): T | undefined => {
      try {
        const r = fn();
        if (okMsg) toast(okMsg);
        return r;
      } catch (e) {
        toast(e instanceof DomainError ? e.message : 'Algo falló. Intenta de nuevo.', 'error');
        if (!(e instanceof DomainError)) console.error(e);
        return undefined;
      }
    },
    [toast],
  );
}

/** Reloj que se actualiza cada `ms` para mostrar tiempos transcurridos. */
export function useNow(ms = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function minutesSince(iso: string, now: number) {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
}

export function ago(iso: string, now: number) {
  const m = minutesSince(iso, now);
  if (m < 1) return 'recién';
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

/** La impresión y descargas no funcionan dentro de un visor embebido (la demo). */
export const canPrint = (() => {
  try {
    return window.self === window.top;
  } catch {
    return false;
  }
})();
