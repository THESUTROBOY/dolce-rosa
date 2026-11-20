import { useEffect, useState, type ReactNode } from 'react';
import { useAppState } from './state';
import { Accounts } from './ui/Accounts';
import { Admin } from './ui/Admin';
import { Expenses } from './ui/Expenses';
import { SyncDot } from './ui/Sync';
import { Kitchen } from './ui/Kitchen';
import { Tables } from './ui/Tables';
import { TableView } from './ui/TableView';

type Tab = 'mesas' | 'cocina' | 'cuentas' | 'gastos' | 'config';

const Icon = ({ d }: { d: ReactNode }) => (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d}
  </svg>
);
const ICONS: Record<Tab, ReactNode> = {
  mesas: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
    </>
  ),
  cocina: (
    <>
      <path d="M6 13.5a6 6 0 0 1 12 0" />
      <path d="M4 13.5h16v2a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z" />
      <path d="M12 5v2.5" />
    </>
  ),
  cuentas: (
    <>
      <path d="M6 3.5h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z" />
      <path d="M9 8.5h6M9 12h6M9 15.5h3" />
    </>
  ),
  gastos: (
    <>
      <rect x="3.5" y="6" width="17" height="12.5" rx="2.5" />
      <path d="M3.5 10h17M7 14.5h4" />
    </>
  ),
  config: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.2M12 18.8V21M4.2 7.5l1.9 1.1M17.9 15.4l1.9 1.1M4.2 16.5l1.9-1.1M17.9 8.6l1.9-1.1" />
    </>
  ),
};

function readHash(): { tab: Tab; table: string | null } {
  const h = location.hash.replace('#', '');
  if (h === 'cocina' || h === 'cuentas' || h === 'gastos' || h === 'config') return { tab: h, table: null };
  return { tab: 'mesas', table: null };
}

export default function App() {
  const state = useAppState();
  const [tab, setTab] = useState<Tab>(() => readHash().tab);
  const [table, setTable] = useState<string | null>(null);

  useEffect(() => {
    try {
      history.replaceState(null, '', tab === 'mesas' ? location.pathname : `#${tab}`);
    } catch {
      /* el visor puede no permitirlo */
    }
    window.scrollTo(0, 0);
  }, [tab, table]);

  const kitchenCount = state.comandas.filter((c) => c.status === 'pendiente' || c.status === 'preparando').length;
  const readyCount = state.comandas.filter((c) => c.status === 'listo').length;

  const tabs: { t: Tab; label: string; badge?: number }[] = [
    { t: 'mesas', label: 'Mesas', badge: readyCount },
    { t: 'cocina', label: 'Cocina', badge: kitchenCount },
    { t: 'cuentas', label: 'Cuentas' },
    { t: 'gastos', label: 'Gastos' },
    { t: 'config', label: 'Admin' },
  ];

  return (
    <div className="app">
      <main className="content">
        {tab === 'mesas' && (table ? <TableView key={table} tableId={table} onBack={() => setTable(null)} /> : <Tables onOpen={setTable} />)}
        {tab === 'cocina' && <Kitchen />}
        {tab === 'cuentas' && <Accounts />}
        {tab === 'gastos' && <Expenses />}
        {tab === 'config' && <Admin />}
      </main>
      <nav className="tabbar" aria-label="Secciones">
        {tabs.map(({ t, label, badge }) => (
          <button
            key={t}
            className={tab === t ? 'on' : ''}
            aria-current={tab === t ? 'page' : undefined}
            onClick={() => {
              if (t === tab && t === 'mesas') setTable(null);
              setTab(t);
            }}
          >
            <span className="tb-icon">
              <Icon d={ICONS[t]} />
              {!!badge && <span className={`tb-badge ${t === 'mesas' ? 'ok' : ''}`}>{badge}</span>}
              {t === 'config' && <SyncDot />}
            </span>
            <span className="tb-label">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
