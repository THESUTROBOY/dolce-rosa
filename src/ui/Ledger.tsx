import { useState } from 'react';
import { clp, dayKey } from '../domain/calc';
import { ledgerRows, LEDGER_COLUMNS, withoutDuplicates } from '../domain/ledger';
import { canPrint, useAction, useAppState, useStore, useUi } from '../state';
import { downloadBlob, Kpi, periodOf, PeriodPicker, periodLabel, type Period } from './kit';

export function LedgerView() {
  const state = useAppState();
  const store = useStore();
  const run = useAction();
  const { isAdmin, toast } = useUi();
  const today = dayKey(new Date());
  const [period, setPeriod] = useState<Period>(() => periodOf('mes', today));
  const [busy, setBusy] = useState('');
  const appRows = ledgerRows(state, period.from, period.to);
  const history = state.ledgerHistory.filter((r) => r.date >= period.from && r.date <= period.to);
  const income = appRows.reduce((a, r) => a + r.income, 0);
  const expense = appRows.reduce((a, r) => a + r.expense, 0);
  const tag = `${period.from}_${period.to}`;

  const guard = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo leer el archivo', 'error');
    }
    setBusy('');
  };

  return (
    <div className="admin-pad">
      <p className="hint">
        Columnas del contador: {LEDGER_COLUMNS.join(' · ')}. Las ventas van sin propina, agrupadas por día y medio de pago; las comisiones de Mercado Pago van como gasto del día; cada gasto va con su categoría y documento.
      </p>
      <PeriodPicker value={period} onChange={setPeriod} today={today} />
      <div className="kpis">
        <Kpi lead label="Filas a exportar" value={appRows.length} sub={periodLabel(period)} />
        <Kpi label="Ingresos" value={clp(income)} />
        <Kpi label="Gastos" value={clp(expense)} />
      </div>
      {!canPrint ? (
        <p className="hint">Disponible en la app publicada.</p>
      ) : (
        <>
          <section className="group">
            <h2 className="group-title">Agregar al Excel del contador</h2>
            <p className="hint">Elige el archivo «Control Gastos JJA SPA». Se agregan al final solo los movimientos que no están (misma fecha, concepto y monto no se repite). Las fórmulas y las demás hojas no se tocan. Descargas una copia actualizada.</p>
            <label className={`btn-primary wide file-btn ${busy ? 'disabled' : ''}`}>
              {busy === 'append' ? 'Procesando…' : 'Elegir mi Excel y agregar movimientos'}
              <input
                type="file"
                accept=".xlsx"
                hidden
                disabled={!!busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  guard('append', async () => {
                    const { appendToLedgerFile } = await import('../excel');
                    const r = await appendToLedgerFile(f, appRows);
                    downloadBlob(f.name.replace(/\.xlsx$/i, '') + ` (actualizado ${today}).xlsx`, r.blob);
                    toast(`${r.added} filas agregadas en «${r.sheet}»${r.skipped ? `, ${r.skipped} ya estaban` : ''}`);
                  });
                }}
              />
            </label>
          </section>
          <section className="group">
            <h2 className="group-title">Excel nuevo</h2>
            <p className="hint">Un archivo con las mismas columnas{history.length ? ', incluyendo el historial importado del período' : ''}.</p>
            <button
              className="btn-secondary wide"
              disabled={!!busy}
              onClick={() =>
                guard('new', async () => {
                  const { newLedgerFile } = await import('../excel');
                  const rows = [...history, ...withoutDuplicates(appRows, history)].sort((a, b) => a.date.localeCompare(b.date));
                  downloadBlob(`Control Gastos ${tag}.xlsx`, await newLedgerFile(rows));
                })
              }
            >
              {busy === 'new' ? 'Preparando…' : 'Descargar Excel del período'}
            </button>
          </section>
          <section className="group">
            <h2 className="group-title">Historial anterior</h2>
            <p className="hint">Importa el Excel que ya llevaban para que los reportes incluyan los registros antiguos. No cambia los saldos de caja ni banco (para eso están los saldos iniciales en Finanzas).</p>
            <p>
              <strong>{state.ledgerHistory.length}</strong> filas importadas
              {state.ledgerHistory.length > 0 && ` (del ${[...state.ledgerHistory].sort((a, b) => a.date.localeCompare(b.date))[0].date} al ${[...state.ledgerHistory].sort((a, b) => b.date.localeCompare(a.date))[0].date})`}
            </p>
            <div className="btn-pair">
              <label className={`btn-secondary file-btn ${busy ? 'disabled' : ''}`}>
                {busy === 'import' ? 'Leyendo…' : 'Importar historial'}
                <input
                  type="file"
                  accept=".xlsx"
                  hidden
                  disabled={!!busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (!f) return;
                    guard('import', async () => {
                      const { readLedgerFile } = await import('../excel');
                      const { rows, sheet } = await readLedgerFile(f);
                      // No importa lo que la app ya registró (ventas y gastos generados por ella).
                      const own = ledgerRows(state, '0000-00-00', '9999-12-31');
                      const fresh = withoutDuplicates(rows.map((r, i) => ({ ...r, id: String(i) })), own);
                      const n = run(() => store.importLedger(isAdmin, fresh));
                      if (n !== undefined) toast(`${n} filas importadas desde «${sheet}»`);
                    });
                  }}
                />
              </label>
              {state.ledgerHistory.length > 0 && (
                <button className="btn-secondary danger" onClick={() => run(() => store.clearLedger(isAdmin), 'Historial borrado')}>
                  Borrar historial importado
                </button>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
