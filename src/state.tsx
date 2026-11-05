import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { demoState } from './domain/demo';
import { DomainError, localPersistence, Store } from './domain/store';
import { dayKey, turnoOf } from './domain/calc';
import type { AppState } from './domain/types';

const store = new Store(localPersistence('dolce-rosa:v4'), () => demoState());
const StoreCtx = createContext(store);

interface Ui {
  isAdmin: boolean;
  setAdmin(v: boolean): void;
  toast(msg: string, kind?: 'ok' | 'error'): void;
  /** Tema visible: Día (mañana) o Tarde. Sigue al turno salvo que alguien lo cambie a mano. */
  theme: Theme;
  themeIsAuto: boolean;
  toggleTheme(): void;
}
export type Theme = 'dia' | 'tarde';
const UiCtx = createContext<Ui>(null!);

const ADMIN_KEY = 'dolce-rosa:admin';
const THEME_KEY = 'dolce-rosa:tema';

/** Elección manual del tema, válida solo durante el turno en que se hizo. */
function readThemeChoice(): { theme: Theme; shift: string } | null {
  try {
    const v = JSON.parse(localStorage.getItem(THEME_KEY) ?? 'null');
    return v && (v.theme === 'dia' || v.theme === 'tarde') ? v : null;
  } catch {
    return null;
  }
}

function useThemeState(afternoonStartsAt: number) {
  const now = useNow(60000);
  const turno = turnoOf(new Date(now), afternoonStartsAt);
  const shift = `${dayKey(new Date(now))}-${turno}`;
  const autoTheme: Theme = turno === 'tarde' ? 'tarde' : 'dia';
  const [choice, setChoice] = useState(readThemeChoice);
  const manual = choice && choice.shift === shift ? choice.theme : null;
  const theme = manual ?? autoTheme;

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme === 'tarde' ? 'dark' : 'light';
    root.style.colorScheme = theme === 'tarde' ? 'dark' : 'light';
    const color = getComputedStyle(root).getPropertyValue('--bg').trim();
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', color));
  }, [theme]);

  const toggleTheme = useCallback(() => {
    const next: Theme = theme === 'dia' ? 'tarde' : 'dia';
    const c = next === autoTheme ? null : { theme: next, shift };
    setChoice(c);
    try {
      if (c) localStorage.setItem(THEME_KEY, JSON.stringify(c));
      else localStorage.removeItem(THEME_KEY);
    } catch {
      /* sin almacenamiento: el cambio dura hasta recargar */
    }
  }, [theme, autoTheme, shift]);

  return { theme, themeIsAuto: !manual, toggleTheme };
}

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

  const afternoon = useSyncExternalStore(store.subscribe, () => store.get().settings.afternoonStartsAt);
  const themeState = useThemeState(afternoon);

  return (
    <StoreCtx.Provider value={store}>
      <UiCtx.Provider value={{ isAdmin, setAdmin, toast, ...themeState }}>
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
