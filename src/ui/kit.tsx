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

export type PeriodKind = 'dia' | 'semana' | 'mes' | 'anio' | 'rango';
export interface Period {
  kind: PeriodKind;
  from: string;
  to: string;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const key = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** Rango de días del período que contiene a `ref`. */
export function periodOf(kind: Exclude<PeriodKind, 'rango'>, ref: string): Period {
  const d = new Date(ref + 'T12:00');
  if (kind === 'dia') return { kind, from: ref, to: ref };
  if (kind === 'semana') {
    const mon = new Date(d);
    mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    return { kind, from: key(mon), to: key(sun) };
  }
  if (kind === 'mes') return { kind, from: key(new Date(d.getFullYear(), d.getMonth(), 1)), to: key(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
  return { kind, from: `${d.getFullYear()}-01-01`, to: `${d.getFullYear()}-12-31` };
}

/** El período inmediatamente anterior, del mismo largo. */
export function previousPeriod(p: Period): Period {
  if (p.kind !== 'rango') {
    const d = new Date(p.from + 'T12:00');
    d.setDate(d.getDate() - 1);
    return periodOf(p.kind, key(d));
  }
  const len = Math.round((new Date(p.to + 'T12:00').getTime() - new Date(p.from + 'T12:00').getTime()) / 86400000) + 1;
  const to = new Date(p.from + 'T12:00');
  to.setDate(to.getDate() - 1);
  const from = new Date(to);
  from.setDate(to.getDate() - len + 1);
  return { kind: 'rango', from: key(from), to: key(to) };
}

export function periodLabel(p: Period): string {
  const f = (s: string, o: Intl.DateTimeFormatOptions) => new Date(s + 'T12:00').toLocaleDateString('es-CL', o);
  if (p.kind === 'dia') return f(p.from, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  if (p.kind === 'mes') return f(p.from, { month: 'long', year: 'numeric' });
  if (p.kind === 'anio') return p.from.slice(0, 4);
  return `${f(p.from, { day: 'numeric', month: 'short' })} al ${f(p.to, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

/** Selector de período: día, semana, mes, año o rango, con flechas para moverse. */
export function PeriodPicker({ value, onChange, today }: { value: Period; onChange(p: Period): void; today: string }) {
  const shift = (dir: -1 | 1) => {
    if (value.kind === 'rango') return;
    const d = new Date((dir < 0 ? value.from : value.to) + 'T12:00');
    d.setDate(d.getDate() + dir);
    onChange(periodOf(value.kind, key(d)));
  };
  return (
    <div className="period">
      <Segmented<PeriodKind>
        label="Período"
        value={value.kind}
        onChange={(k) => onChange(k === 'rango' ? { kind: 'rango', from: value.from, to: value.to } : periodOf(k, value.kind === 'rango' ? value.to : value.from <= today && today <= value.to ? today : value.from))}
        options={[
          { value: 'dia', label: 'Día' },
          { value: 'semana', label: 'Semana' },
          { value: 'mes', label: 'Mes' },
          { value: 'anio', label: 'Año' },
          { value: 'rango', label: 'Rango' },
        ]}
      />
      {value.kind === 'rango' ? (
        <div className="period-range">
          <input type="date" aria-label="Desde" value={value.from} max={value.to} onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })} />
          <span>al</span>
          <input type="date" aria-label="Hasta" value={value.to} min={value.from} onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })} />
        </div>
      ) : (
        <div className="period-nav">
          <button className="icon-btn" onClick={() => shift(-1)} aria-label="Período anterior">
            ‹
          </button>
          <strong className="first-up">{periodLabel(value)}</strong>
          <button className="icon-btn" onClick={() => shift(1)} aria-label="Período siguiente" disabled={value.to >= today}>
            ›
          </button>
        </div>
      )}
    </div>
  );
}

export function Kpi({ label, value, sub, tone, lead }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'ok' | 'warn' | 'danger' | 'gold'; lead?: boolean }) {
  return (
    <div className={`kpi ${lead ? 'kpi-lead' : ''} ${tone ? `kpi-${tone}` : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {sub && <small>{sub}</small>}
    </div>
  );
}

/** Lista de opciones como botones (más rápido que un select en el celular). */
export function Chips({ value, options, onChange, label }: { value: string; options: { value: string; label: string }[]; onChange(v: string): void; label: string }) {
  return (
    <div className="chips" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={`chip ${value === o.value ? 'on' : ''}`} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function downloadBlob(name: string, blob: Blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
