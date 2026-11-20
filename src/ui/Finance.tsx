import { useState } from 'react';
import { addDays, clp, dayKey, fmtDay, folioLabel, weekOf } from '../domain/calc';
import { bucketOf, finance, sales, shiftReport, shiftSummary, tipNet, tipWeeks } from '../domain/money';
import { uid } from '../domain/store';
import type { Account, CashCount, Fund, PayMethod, MovementKind, Reserve, ShiftClose, ShiftReport, TipBucket, Turno } from '../domain/types';
import { FUND_LABEL, MOVEMENT_LABEL, PAY_LABEL, PAY_METHODS, TIP_BUCKET_LABEL, TURNO_LABEL } from '../domain/types';
import { printHtml, shiftHtml } from '../print';
import { canPrint, useAction, useAppState, useNow, useStore, useUi } from '../state';
import { Chips, Empty, Kpi, MoneyField, periodOf, PeriodPicker, Segmented, Sheet, type Period } from './kit';
import { PaySheet, ReasonSheet } from './TableView';

const FUNDS = [
  { value: 'efectivo', label: FUND_LABEL.efectivo },
  { value: 'banco', label: FUND_LABEL.banco },
];

// ---------------- Finanzas ----------------
export function FinanceView() {
  const state = useAppState();
  const store = useStore();
  const run = useAction();
  const { isAdmin } = useUi();
  useNow(60000);
  const f = finance(state);
  const [moving, setMoving] = useState(false);
  const [opening, setOpening] = useState<false | 'editar' | 'nuevo'>(false);
  const [reserves, setReserves] = useState(false);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const movs = [...state.movements].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const since = state.settings.openingDate ? fmtDay(state.settings.openingDate, { day: 'numeric', month: 'long', year: 'numeric' }) : 'el inicio';

  return (
    <div className="admin-pad">
      <div className="kpis">
        <Kpi lead label="Saldo total esperado" value={clp(f.expectedTotal)} sub="Efectivo + banco + abonos y transferencias por llegar" />
        <Kpi label="Efectivo disponible" value={clp(f.cash)} tone={f.cash < 0 ? 'danger' : undefined} />
        <Kpi label="Saldo bancario disponible" value={clp(f.bank)} tone={f.bank < 0 ? 'danger' : undefined} />
        <Kpi label="Abonos de ventas pendientes" value={clp(f.pendingMp)} sub="Mercado Pago, ya sin comisión" tone="gold" />
        <Kpi label="Transferencias por recibir" value={clp(f.pendingTransfers)} tone={f.pendingTransfers ? 'warn' : undefined} />
      </div>

      <section className="group">
        <h2 className="group-title">Compromisos</h2>
        <ul className="list">
          <li className="kv">
            <span>Propinas de las meseras por entregar</span>
            <span className="muted">
              no son de Dolce Rosa · efectivo {clp(f.tipsByMethod.efectivo)} · débito {clp(f.tipsByMethod.debito)}
            </span>
            <strong>{clp(f.tipsPending)}</strong>
          </li>
          <li className="kv">
            <span>Reservado para arriendo y otros</span>
            <button className="btn-plain small" onClick={() => setReserves(true)}>
              Editar
            </button>
            <strong>{clp(f.reserved)}</strong>
          </li>
          <li className="kv">
            <span>Dinero prestado por recuperar</span>
            <span />
            <strong>{clp(f.lentOut)}</strong>
          </li>
          <li className="kv">
            <span>Préstamos recibidos por devolver</span>
            <span />
            <strong>{clp(f.borrowed)}</strong>
          </li>
          {f.pendingAccounts > 0 && (
            <li className="kv">
              <span>Cuentas emitidas por cobrar</span>
              <span />
              <strong>{clp(f.pendingAccounts)}</strong>
            </li>
          )}
          <li className="kv kv-total">
            <span>Libre después de propinas y reservas</span>
            <span className="muted">efectivo + banco</span>
            <strong className={f.free < 0 ? 'neg' : ''}>{clp(f.free)}</strong>
          </li>
        </ul>
      </section>

      <section className="group">
        <h2 className="group-title">
          Acumulado desde {since}
          <span className="btn-row">
            <button className="btn-plain small" onClick={() => setOpening('editar')}>
              Saldos iniciales
            </button>
            <button className="btn-plain small" onClick={() => setOpening('nuevo')}>
              Nuevo período
            </button>
          </span>
        </h2>
        <ul className="list">
          <li className="kv">
            <span>Saldo inicial en efectivo</span>
            <span />
            <strong>{clp(f.openingCash)}</strong>
          </li>
          <li className="kv">
            <span>Saldo inicial en cuenta bancaria</span>
            <span />
            <strong>{clp(f.openingBank)}</strong>
          </li>
          <li className="kv">
            <span>Ingresos por ventas</span>
            <span className="muted">sin propinas</span>
            <strong>{clp(f.income)}</strong>
          </li>
          <li className="kv">
            <span>Comisiones de Mercado Pago</span>
            <span />
            <strong className="neg">−{clp(f.fees)}</strong>
          </li>
          <li className="kv">
            <span>Gastos</span>
            <span />
            <strong className="neg">−{clp(f.expenses)}</strong>
          </li>
          {(f.capital > 0 || f.withdrawals > 0) && (
            <li className="kv">
              <span>Aportes de capital / retiros</span>
              <span className="muted">−{clp(f.withdrawals)}</span>
              <strong>{clp(f.capital)}</strong>
            </li>
          )}
          <li className="kv kv-total">
            <span>Resultado operacional</span>
            <span className="muted">ventas − comisiones − gastos</span>
            <strong className={f.income - f.fees - f.expenses < 0 ? 'neg' : ''}>{clp(f.income - f.fees - f.expenses)}</strong>
          </li>
        </ul>
      </section>

      <section className="group">
        <h2 className="group-title">
          Préstamos, aportes y traspasos
          <button className="btn-plain small" onClick={() => setMoving(true)}>
            + Registrar
          </button>
        </h2>
        <p className="hint">No son ventas ni gastos: solo mueven plata entre fondos o con terceros. Un traspaso de caja al banco no suma ingresos.</p>
        {movs.length === 0 ? (
          <Empty title="Sin movimientos" />
        ) : (
          <ul className="list">
            {(showAll ? movs : movs.slice(0, 8)).map((m) => (
              <li key={m.id} className={`kv ${m.voided ? 'voided' : ''}`}>
                <span>
                  {MOVEMENT_LABEL[m.kind]}
                  {m.counterpart ? ` · ${m.counterpart}` : ''}
                  <small className="block muted">
                    {fmtDay(m.date)} · {m.kind === 'traspaso' ? `${FUND_LABEL[m.fund]} → ${FUND_LABEL[m.toFund!]}` : FUND_LABEL[m.fund]}
                    {m.description ? ` · ${m.description}` : ''} · {m.by}
                    {m.voided ? ` · anulado: ${m.voided.reason}` : ''}
                  </small>
                </span>
                {!m.voided ? (
                  <button className="btn-plain danger small" onClick={() => setVoiding(m.id)}>
                    Anular
                  </button>
                ) : (
                  <span />
                )}
                <strong>{clp(m.amount)}</strong>
              </li>
            ))}
          </ul>
        )}
        {movs.length > 8 && (
          <button className="btn-plain" onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Ver menos' : `Ver los ${movs.length}`}
          </button>
        )}
      </section>

      {moving && <MovementSheet onClose={() => setMoving(false)} />}
      {opening && <OpeningSheet fresh={opening === 'nuevo' ? f : undefined} onClose={() => setOpening(false)} />}
      {reserves && <ReservesSheet onClose={() => setReserves(false)} />}
      {voiding && (
        <ReasonSheet
          title="Anular movimiento"
          onClose={() => setVoiding(null)}
          onConfirm={(r) => {
            if (run(() => (store.voidMovement(isAdmin, voiding, r), true), 'Movimiento anulado')) setVoiding(null);
          }}
        />
      )}
    </div>
  );
}

function MovementSheet({ onClose, preset }: { onClose(): void; preset?: { kind: MovementKind; amount: number; fund: Fund; description: string } }) {
  const store = useStore();
  const run = useAction();
  const { isAdmin } = useUi();
  const [kind, setKind] = useState<MovementKind>(preset?.kind ?? 'traspaso');
  const [amount, setAmount] = useState(Math.abs(preset?.amount ?? 0));
  const [negative, setNegative] = useState((preset?.amount ?? 0) < 0);
  const [fund, setFund] = useState<Fund>(preset?.fund ?? 'efectivo');
  const [toFund, setToFund] = useState<Fund>('banco');
  const [date, setDate] = useState(dayKey(new Date()));
  const [counterpart, setCounterpart] = useState('');
  const [description, setDescription] = useState(preset?.description ?? '');
  const loan = kind.includes('prestamo');
  const kinds: MovementKind[] = ['traspaso', 'prestamo_recibido', 'pago_prestamo', 'prestamo_entregado', 'cobro_prestamo', 'aporte', 'retiro', 'ajuste'];
  return (
    <Sheet
      title="Registrar movimiento"
      onClose={onClose}
      size="tall"
      footer={
        <button
          className="btn-primary wide"
          onClick={() => {
            const ok = run(
              () => (store.addMovement(isAdmin, { kind, amount: kind === 'ajuste' && negative ? -amount : amount, fund, toFund: kind === 'traspaso' ? toFund : undefined, date, counterpart: counterpart.trim() || undefined, description }), true),
              'Movimiento registrado',
            );
            if (ok) onClose();
          }}
        >
          Registrar {amount ? clp(amount) : ''}
        </button>
      }
    >
      <fieldset className="choice">
        <legend>Tipo</legend>
        <Chips label="Tipo" value={kind} options={kinds.map((k) => ({ value: k, label: MOVEMENT_LABEL[k] }))} onChange={(k) => setKind(k as MovementKind)} />
      </fieldset>
      <div className="field-row">
        <MoneyField id="mv-amount" label="Monto" value={amount} onChange={setAmount} />
        <label className="field grow" htmlFor="mv-date">
          <span>Fecha</span>
          <input id="mv-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      {kind === 'ajuste' && (
        <Segmented<'mas' | 'menos'>
          label="Sentido"
          value={negative ? 'menos' : 'mas'}
          onChange={(v) => setNegative(v === 'menos')}
          options={[
            { value: 'mas', label: 'Sobra plata (suma)' },
            { value: 'menos', label: 'Falta plata (resta)' },
          ]}
        />
      )}
      <fieldset className="choice">
        <legend>{kind === 'traspaso' ? 'Desde' : ['prestamo_recibido', 'cobro_prestamo', 'aporte'].includes(kind) ? 'Entra a' : kind === 'ajuste' ? 'Fondo' : 'Sale de'}</legend>
        <Chips label="Fondo" value={fund} options={FUNDS} onChange={(v) => setFund(v as Fund)} />
      </fieldset>
      {kind === 'traspaso' && (
        <fieldset className="choice">
          <legend>Hacia</legend>
          <Chips label="Fondo de destino" value={toFund} options={FUNDS} onChange={(v) => setToFund(v as Fund)} />
        </fieldset>
      )}
      {loan && (
        <label className="field" htmlFor="mv-who">
          <span>{kind === 'prestamo_recibido' || kind === 'pago_prestamo' ? '¿Quién prestó?' : '¿A quién se le prestó?'}</span>
          <input id="mv-who" value={counterpart} onChange={(e) => setCounterpart(e.target.value)} />
        </label>
      )}
      <label className="field" htmlFor="mv-desc">
        <span>Detalle</span>
        <input id="mv-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
    </Sheet>
  );
}

/** Saldos iniciales. Con `fresh` comienza un período nuevo: parte hoy con los saldos actuales y el historial se conserva. */
function OpeningSheet({ onClose, fresh }: { onClose(): void; fresh?: ReturnType<typeof finance> }) {
  const state = useAppState();
  const store = useStore();
  const run = useAction();
  const { isAdmin } = useUi();
  const [cash, setCash] = useState(fresh ? fresh.cash : state.settings.openingCash);
  const [bank, setBank] = useState(fresh ? fresh.bank : state.settings.openingBank);
  const [date, setDate] = useState(fresh ? addDays(dayKey(new Date()), 1) : state.settings.openingDate || dayKey(new Date()));
  return (
    <Sheet
      title={fresh ? 'Comenzar nuevo período' : 'Saldos iniciales'}
      onClose={onClose}
      footer={
        <button
          className="btn-primary wide"
          onClick={() => {
            if (run(() => (store.saveSettings(isAdmin, { ...state.settings, openingCash: cash, openingBank: bank, openingDate: date }), true), fresh ? 'Nuevo período iniciado' : 'Saldos guardados')) onClose();
          }}
        >
          Guardar
        </button>
      }
    >
      {fresh && (
        <>
          <p className="hint">Hazlo al cerrar el día: el período nuevo parte mañana con los saldos de hoy (revísalos con la cuadratura). No se borra nada: ventas, gastos, cierres y reportes anteriores quedan en el historial.</p>
          {(fresh.tipsPending > 0 || fresh.pendingMp > 0 || fresh.pendingTransfers > 0) && (
            <p className="hint warn-text">
              Antes de empezar conviene dejar en cero lo pendiente: propinas por entregar {clp(fresh.tipsPending)}, abonos de Mercado Pago {clp(fresh.pendingMp)} y transferencias {clp(fresh.pendingTransfers)}. Lo pendiente de antes de la fecha no se arrastra.
            </p>
          )}
        </>
      )}
      <p className="hint">Lo que había en la caja y en la cuenta bancaria al empezar a usar el control. Las ventas, gastos y movimientos anteriores a esa fecha no cambian los saldos (quedan en los reportes).</p>
      <label className="field" htmlFor="op-date">
        <span>Fecha de inicio</span>
        <input id="op-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <MoneyField id="op-cash" label="Efectivo en caja" value={cash} onChange={setCash} />
      <MoneyField id="op-bank" label="Saldo en cuenta bancaria" value={bank} onChange={setBank} />
    </Sheet>
  );
}

function ReservesSheet({ onClose }: { onClose(): void }) {
  const state = useAppState();
  const store = useStore();
  const run = useAction();
  const { isAdmin } = useUi();
  const [list, setList] = useState<Reserve[]>(state.reserves.length ? state.reserves : [{ id: uid('res'), name: 'Arriendo', amount: 0 }]);
  return (
    <Sheet
      title="Dinero reservado"
      onClose={onClose}
      footer={
        <button
          className="btn-primary wide"
          onClick={() => {
            if (run(() => (store.saveReserves(isAdmin, list), true), 'Reservas guardadas')) onClose();
          }}
        >
          Guardar
        </button>
      }
    >
      <p className="hint">Plata que sigue en caja o banco pero ya tiene destino (arriendo, sueldos, imposiciones…). Se descuenta de lo libre.</p>
      {list.map((r, i) => (
        <div className="opt-edit" key={r.id}>
          <input aria-label="Para qué" placeholder="Para qué" value={r.name} onChange={(e) => setList(list.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
          <input
            aria-label="Monto"
            inputMode="numeric"
            placeholder="$0"
            value={r.amount ? '$' + r.amount.toLocaleString('es-CL') : ''}
            onChange={(e) => setList(list.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value.replace(/\D/g, '') || 0) } : x)))}
          />
          <button className="btn-plain danger" onClick={() => setList(list.filter((_, j) => j !== i))}>
            Quitar
          </button>
        </div>
      ))}
      <button className="btn-plain" onClick={() => setList([...list, { id: uid('res'), name: '', amount: 0 }])}>
        + Agregar
      </button>
    </Sheet>
  );
}

// ---------------- Cuadratura ----------------
const diffTone = (d: number, pending?: boolean) => (d === 0 ? 'ok' : d < 0 && !pending ? 'danger' : 'warn');
const diffText = (d: number) => (d === 0 ? 'Cuadra' : d < 0 ? `Faltan ${clp(-d)}` : `Sobran ${clp(d)}`);

export function CashCountView() {
  const state = useAppState();
  const store = useStore();
  const run = useAction();
  const { isAdmin } = useUi();
  useNow(30000);
  const f = finance(state, new Date());
  const [realCash, setRealCash] = useState<number | null>(null);
  const [realBank, setRealBank] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [adjust, setAdjust] = useState<{ fund: Fund; amount: number } | null>(null);
  const dc = realCash === null ? null : realCash - f.cash;
  const db = realBank === null ? null : realBank - f.bank;
  const counts = [...state.counts].reverse();

  return (
    <div className="admin-pad">
      <p className="hint">Cuenta la plata de la caja y mira el saldo del banco. Diferencia = saldo real − saldo esperado.</p>
      <div className="count-grid">
        <div className={`count-card ${dc === null ? '' : `tone-${diffTone(dc)}`}`}>
          <h3>Efectivo</h3>
          <div className="kv">
            <span>Esperado</span>
            <strong>{clp(f.cash)}</strong>
          </div>
          <MoneyField id="cnt-cash" label="Lo que hay realmente" value={realCash ?? 0} onChange={setRealCash} />
          {dc !== null && <p className="count-diff">{diffText(dc)}</p>}
        </div>
        <div className={`count-card ${db === null ? '' : `tone-${diffTone(db)}`}`}>
          <h3>Cuenta bancaria</h3>
          <div className="kv">
            <span>Esperado</span>
            <strong>{clp(f.bank)}</strong>
          </div>
          <MoneyField id="cnt-bank" label="Saldo real en el banco" value={realBank ?? 0} onChange={setRealBank} />
          {db !== null && <p className="count-diff">{diffText(db)}</p>}
        </div>
      </div>
      <div className="count-aside">
        <div className="kv">
          <span>Abonos pendientes de Mercado Pago</span>
          <strong>{clp(f.pendingMp)}</strong>
        </div>
        <div className="kv">
          <span>Transferencias por recibir</span>
          <strong>{clp(f.pendingTransfers)}</strong>
        </div>
        <p className="hint">Estos montos todavía no están en el banco: no cuentan para la diferencia.</p>
      </div>
      <label className="field" htmlFor="cnt-note">
        <span>Nota (opcional)</span>
        <input id="cnt-note" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <button
        className="btn-primary wide"
        disabled={realCash === null && realBank === null}
        onClick={() => {
          const ok = run(
            () => (store.addCount(isAdmin, { realCash: realCash ?? f.cash, realBank: realBank ?? f.bank, expectedCash: f.cash, expectedBank: f.bank, pendingMp: f.pendingMp, note }), true),
            'Cuadratura guardada',
          );
          if (ok) {
            setRealCash(null);
            setRealBank(null);
            setNote('');
          }
        }}
      >
        Guardar cuadratura
      </button>

      <section className="group">
        <h2 className="group-title">Cuadraturas anteriores</h2>
        {counts.length === 0 ? (
          <Empty title="Aún no hay cuadraturas" />
        ) : (
          <ul className="list">
            {counts.map((c) => (
              <CountRow key={c.id} c={c} onAdjust={(fund, amount) => setAdjust({ fund, amount })} />
            ))}
          </ul>
        )}
      </section>
      {adjust && (
        <MovementSheet
          onClose={() => setAdjust(null)}
          preset={{ kind: 'ajuste', amount: adjust.amount, fund: adjust.fund, description: `Ajuste por cuadratura ${adjust.amount < 0 ? '(faltante)' : '(sobrante)'}` }}
        />
      )}
    </div>
  );
}

function CountRow({ c, onAdjust }: { c: CashCount; onAdjust(fund: Fund, amount: number): void }) {
  const store = useStore();
  const run = useAction();
  const { isAdmin } = useUi();
  const dc = c.realCash - c.expectedCash;
  const db = c.realBank - c.expectedBank;
  return (
    <li className="count-row">
      <div className="count-row-head">
        <strong>{new Date(c.at).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })}</strong>
        <span className="muted">{c.by}</span>
      </div>
      <div className="count-row-body">
        <span className={`pill pill-${diffTone(dc, c.pendingReconcile)}`}>Efectivo: {diffText(dc)}</span>
        <span className={`pill pill-${diffTone(db, c.pendingReconcile)}`}>Banco: {diffText(db)}</span>
        <span className="muted small">MP pendiente {clp(c.pendingMp)}</span>
      </div>
      {c.note && <p className="hint">{c.note}</p>}
      {(dc !== 0 || db !== 0) && (
        <div className="btn-row">
          <label className="toggle">
            <input type="checkbox" checked={!!c.pendingReconcile} onChange={(e) => run(() => store.setCountPending(isAdmin, c.id, e.target.checked))} />
            <span>Pendiente de conciliar</span>
          </label>
          {dc !== 0 && (
            <button className="btn-plain small" onClick={() => onAdjust('efectivo', dc)}>
              Ajustar efectivo
            </button>
          )}
          {db !== 0 && (
            <button className="btn-plain small" onClick={() => onAdjust('banco', db)}>
              Ajustar banco
            </button>
          )}
        </div>
      )}
    </li>
  );
}

// ---------------- Propinas ----------------
export function TipsView() {
  const state = useAppState();
  const store = useStore();
  const run = useAction();
  const { isAdmin } = useUi();
  const f = finance(state);
  const weeks = tipWeeks(state);
  const today = dayKey(new Date());
  const [paying, setPaying] = useState<{ week: string; bucket: TipBucket; pending: number } | null>(null);
  const [voiding, setVoiding] = useState<string | null>(null);
  const cur = weeks.find((w) => w.week === weekOf(today)) ?? { week: weekOf(today), accrued: { lv: 0, sd: 0 }, paid: { lv: 0, sd: 0 }, byMethod: { efectivo: 0, debito: 0, credito: 0, transferencia: 0 } };
  const payouts = [...state.tipPayouts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const weekLabel = (w: string) => `${fmtDay(w, { day: 'numeric', month: 'short' })} al ${fmtDay(addDays(w, 6), { day: 'numeric', month: 'short' })}`;

  return (
    <div className="admin-pad">
      <div className="kpis">
        <Kpi lead label="Propinas por entregar a las meseras" value={clp(f.tipsPending)} tone="gold" sub={`acumuladas ${clp(f.tipsAccrued)} · entregadas ${clp(f.tipsPaid)}`} />
        <Kpi label="Propinas en efectivo" value={clp(f.tipsByMethod.efectivo)} sub="están en la caja" />
        <Kpi label="Propinas con débito" value={clp(f.tipsByMethod.debito)} sub="llegan al banco" />
        {f.tipsByMethod.credito + f.tipsByMethod.transferencia > 0 && (
          <Kpi label="Crédito y transferencia" value={clp(f.tipsByMethod.credito + f.tipsByMethod.transferencia)} sub={`crédito ${clp(f.tipsByMethod.credito)} · transf. ${clp(f.tipsByMethod.transferencia)}`} />
        )}
      </div>
      <p className="hint">
        Las propinas son de las meseras, no de Dolce Rosa: no suman a ventas, ingresos, comisiones ni resultado. Montos exactos al peso.
        {state.settings.tipFeeFromTip ? ' La comisión que cobra Mercado Pago por la propina se descuenta de la propina.' : ''}
      </p>

      <section className="group">
        <h2 className="group-title">Esta semana · {weekLabel(cur.week)}</h2>
        <div className="tip-buckets">
          {(['lv', 'sd'] as TipBucket[]).map((b) => {
            const pending = cur.accrued[b] - cur.paid[b];
            return (
              <div key={b} className={`tip-bucket ${bucketOf(today) === b ? 'now' : ''}`}>
                <span>{TIP_BUCKET_LABEL[b]}</span>
                <strong>{clp(cur.accrued[b])}</strong>
                <small>
                  entregado {clp(cur.paid[b])} · pendiente {clp(pending)}
                </small>
                {pending > 0 && (
                  <button className="btn-secondary small" onClick={() => setPaying({ week: cur.week, bucket: b, pending })}>
                    Registrar entrega
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <ul className="sum-methods">
          {PAY_METHODS.filter((m) => m === 'efectivo' || m === 'debito' || cur.byMethod[m]).map((m) => (
            <li key={m}>
              <span>{PAY_LABEL[m]}</span>
              <span />
              <strong>{clp(cur.byMethod[m])}</strong>
            </li>
          ))}
        </ul>
      </section>

      <TipsByAccount />

      <section className="group">
        <h2 className="group-title">Semanas anteriores</h2>
        <ul className="list">
          {weeks
            .filter((w) => w.week !== cur.week)
            .slice(0, 12)
            .map((w) => (
              <li key={w.week} className="tip-week">
                <strong>{weekLabel(w.week)}</strong>
                {(['lv', 'sd'] as TipBucket[]).map((b) => {
                  const pending = w.accrued[b] - w.paid[b];
                  return (
                    <span key={b} className="tip-week-b">
                      <span className="muted">{b === 'lv' ? 'L–V' : 'S–D'}</span> {clp(w.accrued[b])}
                      {pending > 0 ? (
                        <button className="pill pill-warn" onClick={() => setPaying({ week: w.week, bucket: b, pending })}>
                          pendiente {clp(pending)}
                        </button>
                      ) : (
                        w.accrued[b] > 0 && <span className="pill pill-ok">entregado</span>
                      )}
                    </span>
                  );
                })}
              </li>
            ))}
        </ul>
      </section>

      <section className="group">
        <h2 className="group-title">Entregas registradas</h2>
        {payouts.length === 0 ? (
          <Empty title="Sin entregas" />
        ) : (
          <ul className="list">
            {payouts.slice(0, 30).map((p) => (
              <li key={p.id} className={`kv ${p.voided ? 'voided' : ''}`}>
                <span>
                  {TIP_BUCKET_LABEL[p.bucket]} · semana {fmtDay(p.week, { day: 'numeric', month: 'short' })}
                  <small className="block muted">
                    {fmtDay(p.date)} · desde {p.fund === 'efectivo' ? 'efectivo' : 'cuenta bancaria'} · {p.by}
                    {p.note ? ` · ${p.note}` : ''}
                    {p.voided ? ` · anulada: ${p.voided.reason}` : ''}
                  </small>
                </span>
                {!p.voided ? (
                  <button className="btn-plain danger small" onClick={() => setVoiding(p.id)}>
                    Anular
                  </button>
                ) : (
                  <span />
                )}
                <strong>{clp(p.amount)}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>
      {paying && <TipPayoutSheet {...paying} onClose={() => setPaying(null)} />}
      {voiding && (
        <ReasonSheet
          title="Anular entrega de propinas"
          onClose={() => setVoiding(null)}
          onConfirm={(r) => {
            if (run(() => (store.voidTipPayout(isAdmin, voiding, r), true), 'Entrega anulada')) setVoiding(null);
          }}
        />
      )}
    </div>
  );
}

const tipLine = (ps: { method: PayMethod; tip: number }[]) =>
  ps
    .filter((p) => p.tip)
    .map((p) => `${PAY_LABEL[p.method]} ${clp(p.tip)}`)
    .join(' · ');

/** Sumatoria de propinas por turno y medio en un período, con la propina de cada cuenta para cambiarla. */
function TipsByAccount() {
  const state = useAppState();
  const today = dayKey(new Date());
  const [period, setPeriod] = useState<Period>(() => periodOf('dia', today));
  const [editing, setEditing] = useState<Account | null>(null);
  const [all, setAll] = useState(false);
  const list = sales(state)
    .filter((x) => x.day >= period.from && x.day <= period.to)
    .reverse();
  const net = (x: (typeof list)[number], m?: PayMethod) => x.payments.filter((p) => !m || p.method === m).reduce((b, p) => b + tipNet(p, state.settings), 0);
  const byMethod = PAY_METHODS.map((m) => ({ m, t: list.reduce((a, x) => a + net(x, m), 0) })).filter((x) => x.t || x.m === 'efectivo' || x.m === 'debito');
  const byTurno = (['mañana', 'tarde'] as Turno[]).map((t) => ({ t, v: list.filter((x) => x.turno === t).reduce((a, x) => a + net(x), 0) }));
  const total = list.reduce((a, x) => a + net(x), 0);
  return (
    <section className="group">
      <h2 className="group-title">Sumatoria de propinas</h2>
      <PeriodPicker value={period} onChange={setPeriod} today={today} />
      <div className="tip-sums">
        <Kpi lead label="Total propinas" value={clp(total)} sub={`${list.filter((x) => x.tip).length} de ${list.length} cuentas con propina`} />
        {byTurno.map(({ t, v }) => (
          <Kpi key={t} label={`Turno ${TURNO_LABEL[t]}`} value={clp(v)} />
        ))}
      </div>
      <ul className="sum-methods">
        {byMethod.map(({ m, t }) => (
          <li key={m}>
            <span>Propinas {PAY_LABEL[m].toLowerCase()}</span>
            <span />
            <strong>{clp(t)}</strong>
          </li>
        ))}
      </ul>
      <h3 className="mini-title">Propina de cada cuenta</h3>
      {list.length === 0 ? (
        <Empty title="Sin cuentas cobradas en este período" />
      ) : (
        <ul className="list">
          {(all ? list : list.slice(0, 6)).map((x) => (
            <li key={x.account.id} className="kv">
              <span>
                {folioLabel(x.account.folio)} · {x.account.tableName} · {period.from !== period.to ? `${fmtDay(x.day, { day: 'numeric', month: 'short' })} ` : ''}
                {TURNO_LABEL[x.turno]} {new Date(x.at).toLocaleTimeString('es-CL', { timeStyle: 'short' })}
                <small className="block muted">
                  consumo {clp(x.consumo)} · {x.tip ? `propina ${tipLine(x.payments)}` : 'sin propina'}
                </small>
              </span>
              <button className="btn-plain small" onClick={() => setEditing(x.account)}>
                Cambiar
              </button>
              <strong>{clp(x.tip)}</strong>
            </li>
          ))}
        </ul>
      )}
      {list.length > 6 && (
        <button className="btn-plain" onClick={() => setAll(!all)}>
          {all ? 'Ver menos' : `Ver las ${list.length} cuentas`}
        </button>
      )}
      {editing && <PaySheet account={editing} correcting onClose={() => setEditing(null)} onDone={() => setEditing(null)} />}
    </section>
  );
}

function TipPayoutSheet({ week, bucket, pending, onClose }: { week: string; bucket: TipBucket; pending: number; onClose(): void }) {
  const store = useStore();
  const run = useAction();
  const { isAdmin } = useUi();
  const [amount, setAmount] = useState(pending);
  const [fund, setFund] = useState<Fund>('efectivo');
  const [date, setDate] = useState(dayKey(new Date()));
  const [note, setNote] = useState('');
  return (
    <Sheet
      title={`Entregar propinas · ${TIP_BUCKET_LABEL[bucket].toLowerCase()}`}
      onClose={onClose}
      footer={
        <button
          className="btn-primary wide"
          onClick={() => {
            if (run(() => (store.payTips(isAdmin, { week, bucket, amount, fund, date, note }), true), 'Entrega registrada')) onClose();
          }}
        >
          Registrar entrega · {clp(amount)}
        </button>
      }
    >
      <p className="hint">
        Pendiente de la semana del {fmtDay(week, { day: 'numeric', month: 'long' })}: {clp(pending)}. No hace falta repartir por trabajadora.
      </p>
      <MoneyField id="tp-amount" label="Monto entregado" value={amount} onChange={setAmount} />
      <fieldset className="choice">
        <legend>El dinero salió de</legend>
        <Chips label="Fondo" value={fund} options={FUNDS} onChange={(v) => setFund(v as Fund)} />
      </fieldset>
      <label className="field" htmlFor="tp-date">
        <span>Fecha</span>
        <input id="tp-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="field" htmlFor="tp-note">
        <span>Nota</span>
        <input id="tp-note" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
    </Sheet>
  );
}

// ---------------- Cierres de turno ----------------
const minus = (n: number) => (n ? `−${clp(n)}` : clp(0));
const SALES_LABEL: Record<PayMethod, string> = { efectivo: 'Ventas efectivo', debito: 'Ventas débito', credito: 'Ventas crédito', transferencia: 'Transferencias' };

export function ShiftReportView({ r, full }: { r: ShiftReport; full: boolean }) {
  const x = shiftSummary(r);
  return (
    <div className="shift-report">
      <ul className="list close-sheet">
        {x.methods.map((m) => (
          <li key={m.method} className="kv">
            <span>
              {SALES_LABEL[m.method]} <span className="muted">· {m.count}</span>
            </span>
            <span />
            <strong>{clp(m.amount)}</strong>
          </li>
        ))}
        {!x.methods.length && <li className="kv muted">Sin cobros en este turno</li>}
        <li className="kv kv-total">
          <span>Total con propinas</span>
          <span />
          <strong>{clp(x.totalWithTips)}</strong>
        </li>
        {x.tipMethods.map((m) => (
          <li key={m.method} className="kv">
            <span>Propinas {PAY_LABEL[m.method].toLowerCase()}</span>
            <span />
            <strong>{clp(m.tip)}</strong>
          </li>
        ))}
        <li className="kv">
          <span>Comisiones</span>
          <span className="muted">Mercado Pago</span>
          <strong>{clp(x.fees + x.tipFees)}</strong>
        </li>
        <li className="kv">
          <span>Gastos</span>
          <span className="muted">
            caja {clp(r.expenses[0].amount)} · banco {clp(r.expenses[1].amount)}
          </span>
          <strong>{clp(x.expenses)}</strong>
        </li>
        <li className="kv kv-total">
          <span>Total propinas</span>
          <span className="muted">{x.tipFees ? `de las meseras, ya sin comisión ${clp(x.tipFees)}` : 'de las meseras, no de Dolce Rosa'}</span>
          <strong>{clp(x.tipsForStaff)}</strong>
        </li>
      </ul>
      <div className="close-liquid">
        <span>Saldo líquido del turno</span>
        <strong className={x.liquid < 0 ? 'neg' : ''}>{clp(x.liquid)}</strong>
        <small>
          Ventas sin propina {clp(r.consumo)}
          {r.discounts ? ` · descuentos ${clp(r.discounts)}` : ''} · {r.sales} {r.sales === 1 ? 'cuenta' : 'cuentas'}
        </small>
      </div>
      <h3 className="mini-title">Caja</h3>
      <ul className="list">
        <li className="kv">
          <span>Efectivo al inicio del turno</span>
          <span />
          <strong>{clp(r.cashStart)}</strong>
        </li>
        <li className="kv">
          <span>Gastos pagados</span>
          <span className="muted">
            caja {clp(r.expenses[0].amount)} · banco {clp(r.expenses[1].amount)}
          </span>
          <strong>{minus(r.expenses[0].amount + r.expenses[1].amount)}</strong>
        </li>
        {r.tipPayouts > 0 && (
          <li className="kv">
            <span>Propinas entregadas a las meseras</span>
            <span />
            <strong>{minus(r.tipPayouts)}</strong>
          </li>
        )}
        {(r.movementsIn > 0 || r.movementsOut > 0) && (
          <li className="kv">
            <span>Otros movimientos</span>
            <span className="muted">entran {clp(r.movementsIn)}</span>
            <strong>{minus(r.movementsOut)}</strong>
          </li>
        )}
        <li className="kv kv-total">
          <span>Efectivo esperado al cierre</span>
          <span />
          <strong>{clp(r.cashEnd)}</strong>
        </li>
        {full && (
          <>
            <li className="kv">
              <span>Saldo bancario</span>
              <span />
              <strong>{clp(r.bankEnd)}</strong>
            </li>
            <li className="kv">
              <span>Abonos Mercado Pago pendientes</span>
              <span />
              <strong>{clp(r.pendingMp)}</strong>
            </li>
            {r.pendingTransfers > 0 && (
              <li className="kv">
                <span>Transferencias por recibir</span>
                <span />
                <strong>{clp(r.pendingTransfers)}</strong>
              </li>
            )}
          </>
        )}
      </ul>
      {r.pendingAccounts > 0 && <p className="hint warn-text">Quedan {r.pendingAccounts} detalles por cobrar en este turno.</p>}
    </div>
  );
}

/** Cerrar el turno actual (o uno anterior sin cerrar). Lo pueden hacer trabajadoras y administración. */
export function CloseShiftSheet({ day, turno, onClose }: { day: string; turno: Turno; onClose(): void }) {
  const state = useAppState();
  const store = useStore();
  const run = useAction();
  const { isAdmin } = useUi();
  const r = shiftReport(state, day, turno);
  const prev = state.closes.find((c) => c.day === day && c.turno === turno);
  const [counted, setCounted] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const diff = counted === null ? null : counted - r.cashEnd;
  return (
    <Sheet
      title={`Cierre ${TURNO_LABEL[turno]} · ${fmtDay(day)}`}
      onClose={onClose}
      size="tall"
      footer={
        <button
          className="btn-primary wide"
          disabled={!!prev && !isAdmin}
          onClick={() => {
            const ok = run(() => (store.closeShift(day, turno, { countedCash: counted ?? undefined, note, replace: !!prev, isAdmin }), true), `Turno ${TURNO_LABEL[turno]} cerrado`);
            if (ok) {
              const c = store.get().closes.at(-1);
              if (c && canPrint) printHtml(shiftHtml(c, state.settings.businessName));
              onClose();
            }
          }}
        >
          {prev ? (isAdmin ? 'Rehacer cierre' : 'Turno ya cerrado') : 'Cerrar turno'}
        </button>
      }
    >
      {prev && <p className="hint">Este turno ya se cerró a las {new Date(prev.closedAt).toLocaleTimeString('es-CL', { timeStyle: 'short' })} por {prev.by}.</p>}
      <ShiftReportView r={r} full={isAdmin} />
      <fieldset className="choice">
        <legend>Arqueo de caja (opcional)</legend>
        <MoneyField id="cl-count" label="Efectivo contado en la caja" value={counted ?? 0} onChange={setCounted} />
        {diff !== null && <p className={`count-diff tone-${diffTone(diff)}`}>{diffText(diff)}</p>}
      </fieldset>
      <label className="field" htmlFor="cl-note">
        <span>Observaciones</span>
        <input id="cl-note" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <p className="hint">El dinero no se reinicia: el efectivo y los saldos pasan tal cual al turno siguiente.</p>
    </Sheet>
  );
}

export function ClosesView() {
  const state = useAppState();
  const store = useStore();
  const cur = store.currentTurno();
  const [closing, setClosing] = useState<{ day: string; turno: Turno } | null>(null);
  const [open, setOpen] = useState<ShiftClose | null>(null);
  const closes = [...state.closes].sort((a, b) => b.day.localeCompare(a.day) || b.turno.localeCompare(a.turno));
  // Turnos con ventas de los últimos 7 días que aún no se cierran.
  const missing: { day: string; turno: Turno }[] = [];
  for (let i = 0; i < 7; i++) {
    const day = addDays(cur.day, -i);
    for (const turno of ['tarde', 'mañana'] as Turno[]) {
      if (day === cur.day && turno === 'tarde' && cur.turno === 'mañana') continue;
      if (day === cur.day && turno === cur.turno) continue;
      const had = state.accounts.some((a) => a.paidAt && (a.payDay ?? a.day) === day && (a.payTurno ?? a.turno) === turno);
      if (had && !state.closes.some((c) => c.day === day && c.turno === turno)) missing.push({ day, turno });
    }
  }
  return (
    <div className="admin-pad">
      <section className="group">
        <h2 className="group-title">Turno actual · {TURNO_LABEL[cur.turno]}</h2>
        <ShiftReportView r={shiftReport(state, cur.day, cur.turno)} full />
        <button className="btn-primary wide" onClick={() => setClosing(cur)}>
          Cerrar turno {TURNO_LABEL[cur.turno]}
        </button>
      </section>
      {missing.length > 0 && (
        <section className="group">
          <h2 className="group-title">Turnos sin cerrar</h2>
          <ul className="list">
            {missing.map((m) => (
              <li key={m.day + m.turno}>
                <button className="row-btn" onClick={() => setClosing(m)}>
                  <span className="row-main">
                    <span className="row-title">
                      {fmtDay(m.day)} · {TURNO_LABEL[m.turno]}
                    </span>
                  </span>
                  <span className="pill pill-warn">Cerrar</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="group">
        <h2 className="group-title">Cierres anteriores</h2>
        {closes.length === 0 ? (
          <Empty title="Aún no hay cierres" />
        ) : (
          <ul className="list">
            {closes.map((c) => {
              const d = c.countedCash === undefined ? null : c.countedCash - c.report.cashEnd;
              return (
                <li key={c.id}>
                  <button className="row-btn" onClick={() => setOpen(c)}>
                    <span className="row-main">
                      <span className="row-title">
                        {fmtDay(c.day)} · {TURNO_LABEL[c.turno]}
                        {d !== null && <span className={`pill pill-${diffTone(d)} tag-gap`}>{diffText(d)}</span>}
                      </span>
                      <span className="row-sub">
                        {c.report.sales} cuentas · propinas meseras {clp(c.report.tips - (c.report.tipFees ?? 0))} aparte · cerró {c.by}
                      </span>
                    </span>
                    <span className="row-price">{clp(c.report.consumo)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {closing && <CloseShiftSheet {...closing} onClose={() => setClosing(null)} />}
      {open && (
        <Sheet title={`Cierre ${TURNO_LABEL[open.turno]} · ${fmtDay(open.day)}`} onClose={() => setOpen(null)} size="tall">
          <p className="hint">
            Cerrado el {new Date(open.closedAt).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })} por {open.by}
            {open.countedCash !== undefined ? ` · efectivo contado ${clp(open.countedCash)}` : ''}
            {open.note ? ` · ${open.note}` : ''}
          </p>
          <ShiftReportView r={open.report} full />
          {canPrint && (
            <button className="btn-secondary wide" onClick={() => printHtml(shiftHtml(open, state.settings.businessName))}>
              Imprimir cierre
            </button>
          )}
        </Sheet>
      )}
    </div>
  );
}
