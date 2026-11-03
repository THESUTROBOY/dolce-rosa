import { useState } from 'react';
import { useAppState, useSession, useStore } from './state';
import { Cash } from './ui/Cash';
import { Login } from './ui/Login';
import { Menu } from './ui/Menu';
import { Orders } from './ui/Orders';
import { Reports } from './ui/Reports';
import { Sell } from './ui/Sell';
import { Settings } from './ui/Settings';

type View = 'vender' | 'pedidos' | 'caja' | 'reportes' | 'carta' | 'ajustes';

export default function App() {
  const { user, setUser } = useSession();
  const state = useAppState();
  const store = useStore();
  const [view, setView] = useState<View>('vender');
  const [openId, setOpenId] = useState<string | null>(null);
  const [sellKey, setSellKey] = useState(0);

  if (!user) return <Login />;

  const isAdmin = user.role === 'admin';
  const shiftOpen = state.shifts.some((s) => !s.closedAt);
  const openCount = state.orders.filter((o) => o.status === 'abierto').length;

  const tabs: { v: View; label: string; admin?: boolean }[] = [
    { v: 'vender', label: 'Vender' },
    { v: 'pedidos', label: `Pedidos${openCount ? ` (${openCount})` : ''}` },
    { v: 'caja', label: 'Caja' },
    { v: 'reportes', label: 'Reportes', admin: true },
    { v: 'carta', label: 'Carta' },
    { v: 'ajustes', label: 'Ajustes', admin: true },
  ];

  const openOrder = (id: string) => {
    setOpenId(id);
    setSellKey((k) => k + 1);
    setView('vender');
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            ❀
          </span>
          <span>{state.settings.businessName}</span>
        </div>
        <nav className="tabs">
          {tabs
            .filter((t) => !t.admin || isAdmin)
            .map((t) => (
              <button key={t.v} className={view === t.v ? 'on' : ''} onClick={() => setView(t.v)} aria-current={view === t.v ? 'page' : undefined}>
                {t.label}
              </button>
            ))}
        </nav>
        <div className="who">
          <span className={`dot ${shiftOpen ? 'ok' : 'off'}`} title={shiftOpen ? 'Caja abierta' : 'Caja cerrada'} />
          <span className="who-name">{user.name}</span>
          <button className="ghost small" onClick={() => setUser(null)}>
            Salir
          </button>
        </div>
      </header>
      {!shiftOpen && view === 'vender' && (
        <div className="banner">
          La caja está cerrada: puedes tomar pedidos, pero para cobrar{' '}
          <button className="link" onClick={() => setView('caja')}>
            abre la caja
          </button>
          .
        </div>
      )}
      <main className="main">
        {view === 'vender' && (
          <Sell
            key={sellKey}
            orderId={openId}
            onDone={() => {
              setOpenId(null);
              try {
                localStorage.removeItem('dolce-rosa:draft');
              } catch {
                /* nada */
              }
            }}
          />
        )}
        {view === 'pedidos' && (
          <Orders
            onOpen={openOrder}
            onNewTable={(tableId) => {
              const o = { ...store.newOrder(user.id, 'mesa', tableId) };
              try {
                localStorage.setItem('dolce-rosa:draft', JSON.stringify(o));
              } catch {
                /* nada */
              }
              setOpenId(null);
              setSellKey((k) => k + 1);
              setView('vender');
            }}
          />
        )}
        {view === 'caja' && <Cash />}
        {view === 'reportes' && isAdmin && <Reports />}
        {view === 'carta' && <Menu />}
        {view === 'ajustes' && isAdmin && <Settings />}
      </main>
    </div>
  );
}
