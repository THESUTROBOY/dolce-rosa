import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Hoja que sube desde abajo (estilo iOS). En pantallas anchas se centra. */
export function Sheet({
  title,
  onClose,
  children,
  footer,
  size = 'auto',
}: {
  title: ReactNode;
  onClose(): void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'auto' | 'tall';
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`sheet sheet-${size}`} role="dialog" aria-modal="true" ref={ref}>
        <div className="grabber" aria-hidden />
        <header className="sheet-head">
          <h2>{title}</h2>
          <button className="btn-plain" onClick={onClose}>
            Cerrar
          </button>
        </header>
        <div className="sheet-body">{children}</div>
        {footer && <footer className="sheet-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange(v: T): void;
  options: { value: T; label: ReactNode }[];
  label: string;
}) {
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stepper({ value, onChange, min = 0, label }: { value: number; onChange(v: number): void; min?: number; label: string }) {
  return (
    <div className="stepper" aria-label={label}>
      <button onClick={() => onChange(Math.max(min, value - 1))} aria-label="Uno menos" disabled={value <= min}>
        −
      </button>
      <output aria-live="polite">{value}</output>
      <button onClick={() => onChange(value + 1)} aria-label="Uno más">
        +
      </button>
    </div>
  );
}

/** Campo en pesos enteros, con teclado numérico en el celular. */
export function MoneyField({ value, onChange, id, label }: { value: number; onChange(v: number): void; id: string; label: string }) {
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        inputMode="numeric"
        value={value ? '$' + value.toLocaleString('es-CL') : ''}
        placeholder="$0"
        onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, '') || 0))}
      />
    </label>
  );
}

export function PinPad({ onSubmit, error }: { onSubmit(pin: string): void; error?: string }) {
  const [pin, setPin] = useState('');
  const press = (d: string) => {
    const next = (pin + d).slice(0, 6);
    setPin(next);
  };
  return (
    <form
      className="pinpad"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(pin);
        setPin('');
      }}
    >
      <div className={`pin-dots ${error ? 'shake' : ''}`} aria-label={`${pin.length} números ingresados`}>
        {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
          <span key={i} className={i < pin.length ? 'on' : ''} />
        ))}
      </div>
      <input
        className="sr-only"
        id="pin-input"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
        aria-label="PIN de administración"
        autoFocus
      />
      {error && <p className="pin-error">{error}</p>}
      <div className="keys">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button type="button" key={d} onClick={() => press(d)}>
            {d}
          </button>
        ))}
        <button type="button" className="key-soft" onClick={() => setPin(pin.slice(0, -1))} aria-label="Borrar">
          ⌫
        </button>
        <button type="button" onClick={() => press('0')}>
          0
        </button>
        <button type="submit" className="key-go" disabled={pin.length < 4}>
          Entrar
        </button>
      </div>
    </form>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}

export function downloadFile(name: string, content: string, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([type.startsWith('text/csv') ? '﻿' + content : content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function toCsv(rows: (string | number)[][]) {
  return rows.map((r) => r.map((c) => (/[;"\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c))).join(';')).join('\n');
}
