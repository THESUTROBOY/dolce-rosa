import { useState } from 'react';
import { useAction, useAppState, useSession, useStore } from '../state';

export function Login() {
  const store = useStore();
  const state = useAppState();
  const { setUser } = useSession();
  const run = useAction();
  const [pin, setPin] = useState('');

  const submit = (p = pin) => {
    const u = run(() => store.login(p));
    if (u) setUser(u);
    setPin('');
  };
  const press = (d: string) => {
    const next = (pin + d).slice(0, 6);
    setPin(next);
  };

  return (
    <div className="login">
      <div className="login-card">
        <div className="brand-mark" aria-hidden>
          ❀
        </div>
        <h1>{state.settings.businessName}</h1>
        <p className="muted">Ingresa tu PIN</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            className="pin-input"
            type="password"
            inputMode="numeric"
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            aria-label="PIN"
          />
          <div className="pinpad">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
              <button type="button" key={d} onClick={() => press(d)}>
                {d}
              </button>
            ))}
            <button type="button" className="ghost" onClick={() => setPin('')}>
              Borrar
            </button>
            <button type="button" onClick={() => press('0')}>
              0
            </button>
            <button type="submit" className="primary">
              Entrar
            </button>
          </div>
        </form>
        <p className="muted small">Demo: administración 1234 · caja 0000</p>
      </div>
    </div>
  );
}
