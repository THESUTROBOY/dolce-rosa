import { accountTotal, clp } from '../domain/calc';
import { ago, useAppState, useNow } from '../state';

export function Tables({ onOpen }: { onOpen(tableId: string): void }) {
  const state = useAppState();
  const now = useNow();
  const open = state.accounts.filter((a) => a.status === 'abierta');
  const busy = open.length;

  return (
    <div className="screen">
      <header className="large-title">
        <h1>Mesas</h1>
        <p className="subtitle">
          {busy === 0 ? 'Todas libres' : `${busy} ${busy === 1 ? 'ocupada' : 'ocupadas'} · ${state.tables.length - busy} libres`}
        </p>
      </header>
      <div className="tables-grid">
        {state.tables.map((t) => {
          const a = open.find((x) => x.tableId === t.id);
          const coms = a ? state.comandas.filter((c) => c.accountId === a.id) : [];
          const ready = coms.filter((c) => c.status === 'listo').length;
          const cooking = coms.filter((c) => c.status === 'pendiente' || c.status === 'preparando').length;
          const unsent = a ? a.lines.filter((l) => !l.sentAt).length : 0;
          return (
            <button key={t.id} className={`table-tile ${a ? 'busy' : ''} ${ready ? 'ready' : ''}`} onClick={() => onOpen(t.id)}>
              <span className="tt-name">{t.name}</span>
              {a ? (
                <>
                  <span className="tt-total">{clp(accountTotal(a))}</span>
                  <span className="tt-meta">
                    {a.lines.reduce((s, l) => s + l.qty, 0)} productos · {ago(a.openedAt, now)}
                  </span>
                  <span className="tt-badges">
                    {ready > 0 && <span className="pill pill-ok">Listo para servir</span>}
                    {cooking > 0 && <span className="pill pill-warn">En preparación</span>}
                    {unsent > 0 && <span className="pill pill-brand">Sin enviar</span>}
                  </span>
                </>
              ) : (
                <span className="tt-free">Libre</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
