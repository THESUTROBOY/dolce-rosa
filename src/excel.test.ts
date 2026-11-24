import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { demoState } from './domain/demo';
import { ledgerRows } from './domain/ledger';
import { appendToLedgerFile, newLedgerFile, readLedgerFile } from './excel';

const asFile = async (b: Blob | ArrayBuffer, name = 'Control Gastos JJA SPA.xlsx') => new File([b], name);

describe('Excel del contador', () => {
  const st = demoState(new Date('2026-11-20T16:00:00'));
  const rows = ledgerRows(st, '2026-11-01', '2026-11-19');

  it('genera ventas sin propina por día y medio, comisiones y gastos', () => {
    expect(rows.length).toBeGreaterThan(40);
    expect(rows.some((r) => r.tipo === 'Ingreso' && r.category === 'Ventas')).toBe(true);
    expect(rows.some((r) => r.category === 'Costo Variable - Comisiones e Impuestos')).toBe(true);
    const income = rows.reduce((a, r) => a + r.income, 0);
    const consumo = st.accounts.filter((a) => a.status === 'emitida' && a.paidAt && a.payDay! >= '2026-11-01' && a.payDay! <= '2026-11-19').reduce((a, x) => a + x.lines.reduce((s, l) => s + l.unitPrice * l.qty, 0), 0);
    expect(income).toBe(consumo);
  });

  it('agrega al archivo original sin duplicar ni tocar fórmulas ni otras hojas', async () => {
    // Un Excel "del contador" con título, encabezado en la fila 3, una fórmula de saldo y una hoja de resumen.
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Movimientos');
    ws.getCell('A1').value = 'Control Gastos JJA SPA';
    ws.getRow(3).values = ['Fecha', 'Tipo', 'Descripción / Concepto', 'Categoría', 'Método de Pago', 'Ingreso ($)', 'Gasto ($)', 'Documento / Respaldo', 'Notas', 'Saldo'];
    ws.getRow(4).values = [new Date(Date.UTC(2026, 9, 31)), 'Gasto', 'Gas', 'Costo Fijo - Arriendo y Servicios', 'Efectivo', null, 15000, 'Boleta', ''];
    ws.getCell('J4').value = { formula: 'SUM(F$4:F4)-SUM(G$4:G4)' };
    const res = wb.addWorksheet('Resumen');
    res.getCell('B2').value = { formula: "SUM(Movimientos!G:G)" };
    const original = await asFile(await wb.xlsx.writeBuffer());

    const first = await appendToLedgerFile(original, rows);
    expect(first).toMatchObject({ added: rows.length, skipped: 0, sheet: 'Movimientos' });
    // Volver a exportar sobre el archivo actualizado no duplica nada.
    const again = await appendToLedgerFile(await asFile(await first.blob.arrayBuffer()), rows);
    expect(again.added).toBe(0);

    const check = new ExcelJS.Workbook();
    await check.xlsx.load(await first.blob.arrayBuffer());
    expect(check.getWorksheet('Resumen')!.getCell('B2').formula).toBe('SUM(Movimientos!G:G)');
    expect(check.getWorksheet('Movimientos')!.getCell('J4').formula).toBe('SUM(F$4:F4)-SUM(G$4:G4)');
    expect(check.getWorksheet('Movimientos')!.getCell('C5').value).toBe(rows[0].description);

    const back = await readLedgerFile(await asFile(await first.blob.arrayBuffer()));
    expect(back.rows).toHaveLength(rows.length + 1);
    expect(back.rows[0]).toMatchObject({ date: '2026-10-31', description: 'Gas', expense: 15000 });
  });

  it('crea un Excel nuevo con las columnas exactas', async () => {
    const blob = await newLedgerFile(rows.slice(0, 3));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());
    expect(wb.worksheets[0].getRow(1).values).toEqual([undefined, 'Fecha', 'Tipo', 'Descripción / Concepto', 'Categoría', 'Método de Pago', 'Ingreso ($)', 'Gasto ($)', 'Documento / Respaldo', 'Notas']);
  });
});
