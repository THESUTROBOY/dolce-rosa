import { accountTotal, clp } from '../domain/calc';
import type { TableDef } from '../domain/types';
import { ago, useAppState, useNow, useUi } from '../state';

type Shape = 'cuadrada' | 'redonda' | 'barra';

/** Forma de la mesa vista desde arriba, según su nombre. */
function shapeOf(t: TableDef): Shape {
  if (/terraza/i.test(t.name)) return 'redonda';
  if (/barra/i.test(t.name)) return 'barra';
  return 'cuadrada';
}

const Sun = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
  </svg>
);
const Dusk = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
    <path d="M6.5 16a5.5 5.5 0 0 1 11 0" />
    <path d="M3 16h18M6 19.5h12M12 5v2.5M5.2 9.2l1.6 1.2M18.8 9.2l-1.6 1.2" />
  </svg>
);

export function Tables({ onOpen }: { onOpen(tableId: string): void }) {
  const state = useAppState();
  const now = useNow();
  const { theme, themeIsAuto, toggleTheme } = useUi();
  const open = state.accounts.filter((a) => a.status === 'abierta');
  const busy = open.length;

  return (
    <div className="screen">
      <header className="large-title with-action">
        <div>
          <h1>Mesas</h1>
          <p className="subtitle">
            {busy === 0 ? 'Todas libres' : `${busy} ${busy === 1 ? 'ocupada' : 'ocupadas'} · ${state.tables.length - busy} libres`}
          </p>
        </div>
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          aria-label={`Modo ${theme === 'dia' ? 'día' : 'tarde'}${themeIsAuto ? ', según el turno' : ''}. Tocar para cambiar`}
        >
          {theme === 'dia' ? <Sun /> : <Dusk />}
          <span>{theme === 'dia' ? 'Día' : 'Tarde'}</span>
        </button>
      </header>
      <div className="floor">
        {state.tables.map((t) => {
          const a = open.find((x) => x.tableId === t.id);
          const coms = a ? state.comandas.filter((c) => c.accountId === a.id) : [];
          const ready = coms.filter((c) => c.status === 'listo').length;
          const cooking = coms.filter((c) => c.status === 'pendiente' || c.status === 'preparando').length;
          const unsent = a ? a.lines.filter((l) => !l.sentAt).length : 0;
          const shape = shapeOf(t);
          const items = a ? a.lines.reduce((s, l) => s + l.qty, 0) : 0;
          return (
            <button
              key={t.id}
              className={`table table-${shape} ${a ? 'busy' : ''} ${ready ? 'ready' : ''}`}
              onClick={() => onOpen(t.id)}
              aria-label={`${t.name}, ${a ? `ocupada, ${clp(accountTotal(a))}` : 'libre'}`}
            >
              <span className="table-top">
                <span className="tt-name">{t.name}</span>
                {a ? (
                  <>
                    <span className="tt-total">{clp(accountTotal(a))}</span>
                    <span className="tt-meta">
                      {items} {items === 1 ? 'producto' : 'productos'} · {ago(a.openedAt, now)}
                    </span>
                  </>
                ) : (
                  <span className="tt-free">Libre</span>
                )}
              </span>
              <span className="tt-badges">
                {ready > 0 && <span className="pill pill-ok">Listo para servir</span>}
                {cooking > 0 && <span className="pill pill-warn">En preparación</span>}
                {unsent > 0 && <span className="pill pill-brand">Sin enviar</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
