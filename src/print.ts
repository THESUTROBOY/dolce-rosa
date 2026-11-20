import { accountDue, accountSubtotal, accountTotal, clp, discountOf, fmtDay, folioLabel, lineTotal, netAndTax, suggestedTip } from './domain/calc';
import { paymentsOf, shiftSummary } from './domain/money';
import type { Account, Comanda, PayMethod, Settings, ShiftClose } from './domain/types';
import { PAY_LABEL, STATION_LABEL, TURNO_LABEL } from './domain/types';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const when = (iso: string) => new Date(iso).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });

const PAGE = `@page{size:80mm auto;margin:0}*{box-sizing:border-box}body{width:72mm;margin:0 auto;padding:3mm 0;font:12px/1.35 ui-monospace,Menlo,monospace;color:#000}
h1{font-size:16px;text-align:center;margin:0}.c{text-align:center}.r{display:flex;justify-content:space-between;gap:6px}.r span:first-child{flex:1}
.b{font-size:17px;font-weight:bold}hr{border:0;border-top:1px dashed #000;margin:6px 0}.n{padding-left:10px;font-style:italic}.s{font-size:11px}`;

export function accountHtml(a: Account, s: Settings) {
  const total = accountTotal(a);
  const { neto, iva } = netAndTax(total);
  const lines = a.lines
    .map(
      (l) =>
        `<div class="r"><span>${l.qty} x ${esc([l.name, l.variant].filter(Boolean).join(' '))}</span><span>${clp(lineTotal(l))}</span></div>` +
        (l.extras.length ? `<div class="n">+ ${l.extras.map(esc).join(', ')}</div>` : '') +
        (l.choices?.length ? `<div class="n">${l.choices.map(esc).join(' · ')}</div>` : ''),
    )
    .join('');
  return `<style>${PAGE}</style><h1>${esc(s.businessName)}</h1>
  ${s.address ? `<div class="c s">${esc(s.address)}</div>` : ''}${s.phone ? `<div class="c s">${esc(s.phone)}</div>` : ''}
  <hr><div class="c"><b>${a.folio ? `DETALLE DE CUENTA N° ${folioLabel(a.folio)}` : 'PRECUENTA'}</b></div>${a.turno && a.folio ? `<div class="c s">Turno ${a.turno}</div>` : ''}
  <div class="r"><span>${esc(a.tableName)}</span><span>${when(a.emittedAt ?? new Date().toISOString())}</span></div><hr>
  ${lines}<hr>
  ${
    a.discounts?.length
      ? `<div class="r"><span>Subtotal</span><span>${clp(accountSubtotal(a))}</span></div>` +
        a.discounts.map((d) => `<div class="r"><span>${esc(d.name)}</span><span>-${clp(discountOf(d, a.lines))}</span></div>`).join('')
      : ''
  }
  <div class="r b"><span>TOTAL</span><span>${clp(total)}</span></div>
  <div class="r s"><span>Neto ${clp(neto)}</span><span>IVA ${clp(iva)}</span></div>
  ${
    a.paidAt
      ? (a.tip ? `<div class="r"><span>Propina voluntaria</span><span>${clp(a.tip)}</span></div><div class="r b"><span>PAGADO</span><span>${clp(accountDue(a))}</span></div>` : '') +
        paymentsOf(a)
          .map((p) => `<div class="r"><span>${PAY_LABEL[p.method]}</span><span>${clp(p.amount)}</span></div>`)
          .join('')
      : s.tipPercent > 0
        ? `<hr><div class="r"><span>Propina sugerida ${s.tipPercent}%</span><span>${clp(suggestedTip(total, s.tipPercent))}</span></div><div class="r b"><span>TOTAL CON PROPINA</span><span>${clp(total + suggestedTip(total, s.tipPercent))}</span></div>`
        : ''
  }
  <hr><div class="c s">${esc(s.footer)}</div>`;
}

export function comandaHtml(c: Comanda) {
  return `<style>${PAGE} body{font-size:14px}</style><div class="c b">${esc(STATION_LABEL[c.station]).toUpperCase()}</div>
  <div class="c b">${esc(c.tableName)} · #${c.number}</div><div class="c s">${when(c.createdAt)}</div><hr>
  ${c.items.map((i) => `<div><b>${i.qty} x ${esc([i.name, i.variant].filter(Boolean).join(' '))}</b></div>${i.extras.length ? `<div class="n">+ ${i.extras.map(esc).join(', ')}</div>` : ''}${(i.choices ?? []).map((c) => `<div class="n">- ${esc(c)}</div>`).join('')}${i.note ? `<div class="n">» ${esc(i.note)}</div>` : ''}`).join('')}<hr>`;
}

export function printHtml(html: string) {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(f);
  const d = f.contentDocument!;
  d.open();
  d.write(`<!doctype html><meta charset="utf-8"><title>Imprimir</title><body>${html}</body>`);
  d.close();
  setTimeout(() => {
    f.contentWindow?.focus();
    f.contentWindow?.print();
    setTimeout(() => f.remove(), 1500);
  }, 60);
}

const SALES: Record<PayMethod, string> = { efectivo: 'Ventas efectivo', debito: 'Ventas débito', credito: 'Ventas crédito', transferencia: 'Transferencias' };

export function shiftHtml(c: ShiftClose, business: string) {
  const r = c.report;
  const x = shiftSummary(r);
  const row = (a: string, b: string) => `<div class="r"><span>${a}</span><span>${b}</span></div>`;
  return `<style>${PAGE} .big{font-size:22px}</style><div class="c"><b>${esc(business)} | Cierre de turno ${TURNO_LABEL[c.turno]}</b></div>
  <div class="c s">${fmtDay(c.day, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div><div class="c s">Cerró ${esc(c.by)} · ${when(c.closedAt)}</div><hr>
  ${x.methods.map((m) => row(`${SALES[m.method]} (${m.count})`, clp(m.amount))).join('')}
  <div class="r b"><span>Total con propinas</span><span>${clp(x.totalWithTips)}</span></div>
  ${x.tipMethods.map((m) => row(`Propinas ${PAY_LABEL[m.method].toLowerCase()}`, clp(m.tip))).join('')}
  ${row('Comisiones', clp(x.fees + x.tipFees))}${row('Gastos', clp(x.expenses))}
  <div class="r b"><span>Total propinas</span><span>${clp(x.tipsForStaff)}</span></div><hr>
  <div class="c">Saldo líquido del turno</div><div class="c big"><b>${clp(x.liquid)}</b></div>
  <div class="c s">Ventas sin propina ${clp(r.consumo)} · ${r.sales} cuentas${r.discounts ? ` · descuentos ${clp(r.discounts)}` : ''}</div><hr>
  ${row('Efectivo inicio', clp(r.cashStart))}${row('Gastos caja', '-' + clp(r.expenses[0].amount))}${row('Gastos banco', '-' + clp(r.expenses[1].amount))}${r.tipPayouts ? row('Propinas entregadas', '-' + clp(r.tipPayouts)) : ''}
  <div class="r b"><span>Efectivo esperado</span><span>${clp(r.cashEnd)}</span></div>
  ${c.countedCash !== undefined ? row('Efectivo contado', clp(c.countedCash)) + row('Diferencia', clp(c.countedCash - r.cashEnd)) : ''}
  ${row('Abonos MP pendientes', clp(r.pendingMp))}${c.note ? `<hr><div class="s">${esc(c.note)}</div>` : ''}<hr>`;
}
