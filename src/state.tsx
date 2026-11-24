import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { demoState } from './domain/demo';
import { DomainError, Store } from './domain/store';
import { idbPersistence } from './persist';
import { seedState } from './domain/seed';
import { startSync } from './sync';
import { dayKey, turnoOf } from './domain/calc';
import type { AppState } from './domain/types';

let store: Store;
const StoreCtx = createContext<Store>(null!);

/** Abre los datos guardados en este equipo y, si está configurada, la sincronización. */
export async function boot() {
  // En el local (VITE_START_EMPTY=1) un equipo nuevo parte con la carta y las mesas, sin movimientos.
  // En la versión de prueba parte con datos de ejemplo.
  const startEmpty = (import.meta.env as Record<string, string | undefined>).VITE_START_EMPTY === '1';
  store = new Store(await idbPersistence('dolce-rosa:v8', 'dolce-rosa:v7'), () => (startEmpty ? seedState() : demoState()));
  startSync(store);
}

interface Ui {
  isAdmin: boolean;
  /** Nombre de quien entró como administración. */
  adminName: string;
  /** Entra con el nombre de la persona de administración, o sale con false. */
  setAdmin(v: string | false): void;
  /** Quién atiende en este equipo (trabajadora). */
  who: string;
  setWho(name: string): void;
  toast(msg: string, kind?: 'ok' | 'error'): void;
  /** Tema visible: Día (mañana) o Tarde. Sigue al turno salvo que alguien lo cambie a mano. */
  theme: Theme;
  themeIsAuto: boolean;
  toggleTheme(): void;
}
export type Theme = 'dia' | 'tarde';
const UiCtx = createContext<Ui>(null!);

const ADMIN_KEY = 'dolce-rosa:admin';
const WHO_KEY = 'dolce-rosa:quien';
const read = (st: Storage | undefined, k: string) => {
  try {
    return st?.getItem(k) ?? '';
  } catch {
    return '';
  }
};
const write = (st: Storage | undefined, k: string, v: string) => {
  try {
    if (v) st?.setItem(k, v);
    else st?.removeItem(k);
  } catch {
    /* sin almacenamiento */
  }
};
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
  // Antes se guardaba '1'; ahora el nombre de quien entró.
  const [adminName, setAdminName] = useState(() => {
    const v = read(globalThis.sessionStorage, ADMIN_KEY);
    return v === '1' ? 'Administración' : v;
  });
  const isAdmin = !!adminName;
  const [who, setWhoState] = useState(() => read(globalThis.localStorage, WHO_KEY));
  const setWho = useCallback((name: string) => {
    setWhoState(name);
    write(globalThis.localStorage, WHO_KEY, name);
  }, []);
  store.actor = adminName || who || 'Sin nombre';
  const [toasts, setToasts] = useState<{ id: number; msg: string; kind: 'ok' | 'error' }[]>([]);

  const setAdmin = useCallback((v: string | false) => {
    setAdminName(v || '');
    write(globalThis.sessionStorage, ADMIN_KEY, v || '');
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
      <UiCtx.Provider value={{ isAdmin, adminName, setAdmin, who, setWho, toast, ...themeState }}>
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
/** Pantalla de computador o tablet grande: navegación lateral y paneles lado a lado. */
const WIDE = '(min-width: 1024px)';
export function useWide() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(WIDE);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => window.matchMedia(WIDE).matches,
  );
}

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
