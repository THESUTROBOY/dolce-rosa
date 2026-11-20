import { useState } from 'react';
import { accountDiscount, accountDue, accountTotal, clp, folioLabel, isPending, lineTotal, summarize } from '../domain/calc';
import { paymentsOf } from '../domain/money';
import type { Account, Turno } from '../domain/types';
import { PAY_LABEL, TURNO_LABEL } from '../domain/types';
import { CloseShiftSheet } from './Finance';
import { accountHtml, printHtml } from '../print';
import { canPrint, useAction, useAppState, useStore, useUi } from '../state';
import { downloadFile, Empty, Segmented, Sheet, toCsv } from './kit';
import { PaySheet, ReasonSheet } from './TableView';

type TurnoSel = Turno | 'todo';

export function Accounts() {
  const state = useAppState();
  const store = useStore();
  const { isAdmin } = useUi();
  const run = useAction();
  const cur = store.currentTurno();
  const [day, setDay] = useState(cur.day);
  const [turno, setTurno] = useState<TurnoSel>(cur.turno);
  const [onlyPending, setOnlyPending] = useState(false);
  const [q, setQ] = useState('');
  const qd = q.replace(/\D/g, '');
  const [open, setOpen] = useState<Account | null>(null);
  const [closing, setClosing] = useState(false);

  // Los trabajadores solo ven su turno de hoy.
  const d = isAdmin ? day : cur.day;
  const t: TurnoSel = isAdmin ? turno : cur.turno;
  const sum = summarize(state, d, d, t === 'todo' ? undefined : t);
  const list = state.accounts
    .filter((a) => a.status !== 'abierta' && a.day === d && (t === 'todo' || a.turno === t))
    .filter((a) => !onlyPending || (a.status === 'emitida' && (!a.paidAt || !a.checked)))
    .filter((a) => !qd || folioLabel(a.folio).includes(qd) || String(a.folio ?? '') === qd || (a.boleta ?? '').includes(qd))
    .sort((a, b) => (b.emittedAt ?? b.voidedAt ?? '').localeCompare(a.emittedAt ?? a.voidedAt ?? ''));
  const rawDate = new Date(d + 'T12:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
  const dateLabel = rawDate.charAt(0).toUpperCase() + rawDate.slice(1);

  const exportCsv = () => {
    const rows: (string | number)[][] = [['ID detalle', 'Fecha', 'Turno', 'Mesa', 'Estado', 'Consumo', 'Propina', 'Total', 'Medio de pago', 'Boleta', 'Cuadrada']];
    state.accounts
      .filter((a) => a.status !== 'abierta' && a.day === d && (t === 'todo' || a.turno === t))
      .forEach((a) =>
        rows.push([folioLabel(a.folio), a.day!, a.turno!, a.tableName, a.status, accountTotal(a), a.tip, accountDue(a), a.paidAt ? (a.paymentMethod ?? '') : 'por cobrar', a.boleta ?? '', a.checked ? 'sí' : 'no']),
      );
    downloadFile(`cuentas_${d}_${t}.csv`, toCsv(rows));
  };

  return (
    <div className="screen">
      <header className="large-title">
        <h1>Cuentas</h1>
        <p className="subtitle">
          {dateLabel} · {t === 'todo' ? 'ambos turnos' : `turno ${t}`}
        </p>
      </header>

      {isAdmin ? (
        <div className="filters">
          <input id="acc-day" type="date" value={day} max={cur.day} onChange={(e) => setDay(e.target.value || cur.day)} aria-label="Día" />
          <Segmented<TurnoSel>
            label="Turno"
            value={turno}
            onChange={setTurno}
            options={[
              { value: 'mañana', label: 'Mañana' },
              { value: 'tarde', label: 'Tarde' },
              { value: 'todo', label: 'Ambos' },
            ]}
          />
        </div>
      ) : (
        <p className="hint pad">Ves las cuentas de tu turno de hoy. Administración ve todos los días.</p>
      )}

      <div className="summary">
        <div className="sum-main">
          <span>Ventas Dolce Rosa (sin propina)</span>
          <strong>{clp(sum.total)}</strong>
          <small>
            {sum.count} {sum.count === 1 ? 'cuenta' : 'cuentas'} · propinas de las meseras aparte: {clp(sum.tips)}
          </small>
        </div>
        <ul className="sum-methods" aria-label="Por medio de pago">
          {sum.byMethod.map((m) => (
            <li key={m.method}>
              <span>{m.method}</span>
              <span className="muted">
                {m.count}
                {m.tip ? ` · + propina ${clp(m.tip)}` : ''}
              </span>
              <strong>{clp(m.amount)}</strong>
            </li>
          ))}
        </ul>
        <p className={`sum-check ${sum.unchecked ? 'warn' : 'ok'}`}>
          {sum.pending ? `${sum.pending} por cobrar · ` : ''}
          {sum.unchecked ? `${sum.unchecked} por cuadrar con su boleta` : sum.count ? 'Todas cuadradas con su boleta' : 'Aún no hay cuentas en este turno'}
        </p>
      </div>

      <div className="pad">
        <input
          className="search"
          type="search"
          inputMode="numeric"
          placeholder="Buscar por ID de detalle o N° de boleta"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar por ID de detalle o número de boleta"
        />
      </div>
      <div className="list-tools">
        <label className="toggle">
          <input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} />
          <span>Solo por cuadrar</span>
        </label>
        {isAdmin && canPrint && (
          <button className="btn-plain small" onClick={exportCsv}>
            Descargar CSV
          </button>
        )}
      </div>

      {list.length === 0 ? (
        <Empty title={qd ? 'Sin resultados' : onlyPending ? 'Nada por cuadrar' : 'Sin cuentas emitidas'}>
          {qd ? 'Revisa el número o cambia el día y el turno.' : 'Al emitir el detalle de una mesa, la cuenta aparece aquí.'}
        </Empty>
      ) : (
        <ul className="list acc-list">
          {list.map((a) => (
            <li key={a.id} className={a.status === 'anulada' ? 'voided' : ''}>
              <button className="acc-row" onClick={() => setOpen(a)}>
                <span className="acc-num">{folioLabel(a.folio)}</span>
                <span className="row-main">
                  <span className="row-title">
                    {a.tableName}
                    {a.status === 'anulada' && <span className="pill pill-danger">Anulada</span>}
                    {isPending(a) && <span className="pill pill-warn tag-gap">Por cobrar</span>}
                  </span>
                  <span className="row-sub">
                    {new Date(a.emittedAt ?? a.voidedAt!).toLocaleTimeString('es-CL', { timeStyle: 'short' })} · {a.paidAt ? a.paymentMethod : 'sin pago aún'}
                    {a.boleta ? ` · Boleta ${a.boleta}` : ''}
                  </span>
                </span>
                <span className="row-price">{clp(accountDue(a))}</span>
              </button>
              {a.status === 'emitida' && a.paidAt && (
                <button
                  className={`check ${a.checked ? 'on' : ''}`}
                  aria-pressed={!!a.checked}
                  aria-label={a.checked ? 'Cuadrada con boleta' : 'Marcar cuadrada con boleta'}
                  onClick={() => run(() => store.updateEmitted(isAdmin, a.id, { checked: !a.checked }))}
                >
                  ✓
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="pad">
        <button className="btn-secondary wide" onClick={() => setClosing(true)}>
          Cierre de turno {TURNO_LABEL[cur.turno]}
        </button>
      </div>
      {closing && <CloseShiftSheet day={cur.day} turno={cur.turno} onClose={() => setClosing(false)} />}
      {open && <AccountSheet id={open.id} onClose={() => setOpen(null)} />}
    </div>
  );
}

function AccountSheet({ id, onClose }: { id: string; onClose(): void }) {
  const state = useAppState();
  const store = useStore();
  const run = useAction();
  const { isAdmin } = useUi();
  const a = state.accounts.find((x) => x.id === id)!;
  const [boleta, setBoleta] = useState(a.boleta ?? '');
  const [voiding, setVoiding] = useState(false);
  const [paying, setPaying] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const cur = store.currentTurno();
  const editable = a.status === 'emitida' && (isAdmin || (a.day === cur.day && a.turno === cur.turno));

  return (
    <Sheet title={a.folio ? `Detalle ${folioLabel(a.folio)} · ${a.tableName}` : `${a.tableName} · sin emitir`} onClose={onClose} size="tall">
      <article className="receipt">
        <ul>
          {a.lines.map((l) => (
            <li key={l.id}>
              <div className="rc-line">
                <span>
                  {l.qty} × {l.name}
                  {l.variant ? ` ${l.variant}` : ''}
                </span>
                <span>{clp(lineTotal(l))}</span>
              </div>
              {l.extras.length > 0 && <div className="rc-sub">+ {l.extras.join(', ')}</div>}
              {l.choices && <div className="rc-sub">{l.choices.join(' · ')}</div>}
            </li>
          ))}
        </ul>
        <footer>
          {accountDiscount(a) > 0 && (
            <div className="rc-line">
              <span>Descuentos ({a.discounts!.map((d) => d.name).join(', ')})</span>
              <span>−{clp(accountDiscount(a))}</span>
            </div>
          )}
          <div className="rc-line">
            <span>Consumo</span>
            <span>{clp(accountTotal(a))}</span>
          </div>
          {a.paidAt && (
            <div className="rc-line">
              <span>Propina</span>
              <span>{clp(a.tip)}</span>
            </div>
          )}
          <div className="rc-line rc-total">
            <span>Total</span>
            <span>{clp(accountDue(a))}</span>
          </div>
          <div className="rc-line rc-small">
            <span>{a.emittedAt ? new Date(a.emittedAt).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }) : ''}</span>
            <span>Turno {a.turno}</span>
          </div>
          {a.status === 'anulada' && <p className="hint">Anulada: {a.voidReason}</p>}
        </footer>
      </article>

      {isPending(a) && (
        <div className="actions">
          <p className="pending-note">
            <span className="pill pill-warn">Por cobrar</span> {a.tableName} sigue ocupada hasta registrar el pago.
          </p>
          <button className="btn-primary wide" onClick={() => setPaying(true)}>
            Registrar pago
          </button>
        </div>
      )}
      {a.paidAt && a.status === 'emitida' && (
        <section className="group">
          <h2 className="group-title">Pago</h2>
          <ul className="list">
            {paymentsOf(a).map((p, i) => (
              <li key={i} className="kv">
                <span>
                  {PAY_LABEL[p.method]}
                  {p.method === 'transferencia' && p.received === false && <span className="pill pill-warn tag-gap">Por recibir</span>}
                </span>
                <span className="muted">
                  {p.tip ? `propina ${clp(p.tip)}` : ''}
                  {isAdmin && p.fee ? ` · comisión ${clp(p.fee)}` : ''}
                </span>
                <strong>{clp(p.amount)}</strong>
                {isAdmin && p.method === 'transferencia' && (
                  <button className="btn-plain small" onClick={() => run(() => store.setTransferReceived(isAdmin, a.id, i, p.received === false))}>
                    {p.received === false ? 'Marcar recibida' : 'Marcar por recibir'}
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="hint">
            Cobró {a.paidBy ?? '—'} el {new Date(a.paidAt).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}
          </p>
          {isAdmin && (
            <button className="btn-plain" onClick={() => setCorrecting(true)}>
              Corregir pago o propina
            </button>
          )}
        </section>
      )}
      {editable && !isPending(a) && (
        <>
          <div className="field-row">
            <label className="field grow" htmlFor="sheet-boleta">
              <span>N° de boleta</span>
              <input id="sheet-boleta" inputMode="numeric" value={boleta} onChange={(e) => setBoleta(e.target.value.replace(/[^\d-]/g, ''))} />
            </label>
            <button className="btn-secondary" onClick={() => run(() => store.updateEmitted(isAdmin, a.id, { boleta }), 'Boleta guardada')}>
              Guardar
            </button>
          </div>
          <label className="toggle big">
            <input type="checkbox" checked={!!a.checked} onChange={(e) => run(() => store.updateEmitted(isAdmin, a.id, { checked: e.target.checked }))} />
            <span>Cuadrada con la boleta</span>
          </label>
        </>
      )}
      <div className="actions">
        {canPrint && (
          <button className="btn-secondary wide" onClick={() => printHtml(accountHtml(a, state.settings))}>
            Reimprimir detalle
          </button>
        )}
        {isAdmin && a.status === 'emitida' && (
          <button className="btn-plain danger" onClick={() => setVoiding(true)}>
            Anular cuenta
          </button>
        )}
      </div>
      {paying && <PaySheet account={a} onClose={() => setPaying(false)} onDone={() => setPaying(false)} />}
      {correcting && <PaySheet account={a} correcting onClose={() => setCorrecting(false)} onDone={() => setCorrecting(false)} />}
      {voiding && (
        <ReasonSheet
          title={a.folio ? `Anular detalle ${folioLabel(a.folio)}` : `Anular cuenta de ${a.tableName}`}
          onClose={() => setVoiding(false)}
          onConfirm={(r) => {
            if (run(() => (store.voidAccount(isAdmin, a.id, r), true), 'Cuenta anulada')) setVoiding(false);
          }}
        />
      )}
    </Sheet>
  );
}

