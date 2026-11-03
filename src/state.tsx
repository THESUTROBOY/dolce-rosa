import { createContext, useCallback, useContext, useState, useSyncExternalStore, type ReactNode } from 'react';
import { DomainError, localPersistence, Store } from './domain/store';
import type { AppState, User } from './domain/types';

const store = new Store(localPersistence());
const StoreCtx = createContext(store);

interface Session {
  user: User | null;
  setUser(u: User | null): void;
  toast(msg: string, kind?: 'ok' | 'error'): void;
}
const SessionCtx = createContext<Session>(null!);

export function Providers({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem('dolce-rosa:user');
    } catch {
      return null;
    }
  });
  const [toasts, setToasts] = useState<{ id: number; msg: string; kind: 'ok' | 'error' }[]>([]);
  const state = useSyncExternalStore(store.subscribe, store.get);
  const user = state.users.find((u) => u.id === userId && u.active) ?? null;

  const setUser = useCallback((u: User | null) => {
    setUserId(u?.id ?? null);
    try {
      if (u) sessionStorage.setItem('dolce-rosa:user', u.id);
      else sessionStorage.removeItem('dolce-rosa:user');
    } catch {
      /* sin almacenamiento de sesión */
    }
  }, []);

  const toast = useCallback((msg: string, kind: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 4500 : 2500);
  }, []);

  return (
    <StoreCtx.Provider value={store}>
      <SessionCtx.Provider value={{ user, setUser, toast }}>
        {children}
        <div className="toasts" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast toast-${t.kind}`}>
              {t.msg}
            </div>
          ))}
        </div>
      </SessionCtx.Provider>
    </StoreCtx.Provider>
  );
}

export const useStore = () => useContext(StoreCtx);
export const useAppState = (): AppState => {
  const s = useStore();
  return useSyncExternalStore(s.subscribe, s.get);
};
export const useSession = () => useContext(SessionCtx);

/** Ejecuta una acción del dominio mostrando el error al usuario si falla. */
export function useAction() {
  const { toast } = useSession();
  return useCallback(
    <T,>(fn: () => T, okMsg?: string): T | undefined => {
      try {
        const r = fn();
        if (okMsg) toast(okMsg);
        return r;
      } catch (e) {
        toast(e instanceof DomainError ? e.message : 'Ocurrió un error inesperado', 'error');
        if (!(e instanceof DomainError)) console.error(e);
        return undefined;
      }
    },
    [toast],
  );
}
