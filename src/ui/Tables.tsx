import { accountTotal, clp, occupiesTable } from '../domain/calc';
import type { TableDef } from '../domain/types';
import { useState } from 'react';
import { ago, useAction, useAppState, useNow, useStore, useUi } from '../state';
import { Sheet } from './kit';

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
  const { theme, themeIsAuto, toggleTheme, who, setWho, isAdmin, adminName } = useUi();
  const [picking, setPicking] = useState(false);
  const workers = state.staff.filter((p) => p.active);
  const store = useStore();
  const run = useAction();
  const open = state.accounts.filter(occupiesTable);
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
        <button className={`who-chip ${who || isAdmin ? '' : 'empty'}`} onClick={() => setPicking(true)} aria-label="Quién atiende en este equipo">
          {isAdmin ? adminName : who || 'Atiende…'}
        </button>
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          aria-label={`Modo ${theme === 'dia' ? 'día' : 'tarde'}${themeIsAuto ? ', según el turno' : ''}. Tocar para cambiar`}
        >
          {theme === 'dia' ? <Sun /> : <Dusk />}
          <span>{theme === 'dia' ? 'Día' : 'Tarde'}</span>
        </button>
      </header>
      {picking && (
        <Sheet title="¿Quién atiende en este equipo?" onClose={() => setPicking(false)}>
          <p className="hint">Queda registrado en los cobros, gastos y cierres que se hagan desde aquí.</p>
          <div className="move-grid">
            {workers.map((p) => (
              <button
                key={p.id}
                className={`btn-secondary ${who === p.name ? 'on' : ''}`}
                onClick={() => {
                  setWho(p.name);
                  setPicking(false);
                }}
              >
                {p.name}
              </button>
            ))}
          </div>
          <OtherName
            onSave={(n) => {
              setWho(n);
              setPicking(false);
            }}
          />
          {!workers.some((p) => p.role === 'trabajador') && <p className="hint">Administración puede dejar la lista de nombres en Admin → Personas.</p>}
        </Sheet>
      )}
      <div className="floor">
        {state.tables.map((t) => {
          const a = open.find((x) => x.tableId === t.id);
          const coms = a ? state.comandas.filter((c) => c.accountId === a.id) : [];
          const ready = coms.filter((c) => c.status === 'listo').length;
          const cooking = coms.filter((c) => c.status === 'pendiente' || c.status === 'preparando').length;
          const unsent = a ? a.lines.filter((l) => !l.sentAt).length : 0;
          const shape = shapeOf(t);
          const items = a ? a.lines.reduce((s, l) => s + l.qty, 0) : 0;
          const allServed = !!a && a.status === 'abierta' && unsent === 0 && coms.length > 0 && ready === 0 && cooking === 0;
          return (
            <div key={t.id} className="table-slot">
              <button
                className={`table table-${shape} ${a ? 'busy' : ''} ${ready ? 'ready' : ''} ${a?.status === 'emitida' ? 'pending' : ''}`}
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
                  {allServed && <span className="pill pill-done">✓ Todo entregado</span>}
                  {a?.status === 'emitida' && <span className="pill pill-warn">Por cobrar</span>}
                </span>
              </button>
              {a && (ready > 0 || cooking > 0) && (
                <button className="tt-deliver" onClick={() => run(() => store.markServed(a.id), `${t.name}: todo entregado`)}>
                  Marcar entregado
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OtherName({ onSave }: { onSave(n: string): void }) {
  const [n, setN] = useState('');
  return (
    <form
      className="field-row"
      onSubmit={(e) => {
        e.preventDefault();
        if (n.trim()) onSave(n.trim());
      }}
    >
      <label className="field grow" htmlFor="who-other">
        <span>Otra persona</span>
        <input id="who-other" value={n} onChange={(e) => setN(e.target.value)} placeholder="Nombre" />
      </label>
      <button className="btn-secondary" disabled={!n.trim()}>
        Listo
      </button>
    </form>
  );
}
