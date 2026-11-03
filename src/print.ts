import { amountDue, clp, discountAmount, netAndTax, saleTotal, subtotal } from './domain/calc';
import { CASH, type AppState, type Order, type Shift } from './domain/types';
import { expectedCash } from './domain/calc';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });

const PAGE = `
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  body { width: 72mm; margin: 0 auto; padding: 3mm 0; font: 12px/1.35 ui-monospace, 'Courier New', monospace; color: #000; }
  h1 { font-size: 16px; text-align: center; margin: 0 0 2px; }
  .c { text-align: center; }
  .big { font-size: 18px; font-weight: bold; }
  .row { display: flex; justify-content: space-between; gap: 6px; }
  .row span:first-child { flex: 1; }
  hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
  .note { padding-left: 10px; font-style: italic; }
  .muted { font-size: 11px; }
  b { font-weight: bold; }
`;

function where(state: AppState, o: Order) {
  if (o.type === 'mesa') return state.tables.find((t) => t.id === o.tableId)?.name ?? 'Mesa';
  return 'Para llevar' + (o.customerName ? ` · ${esc(o.customerName)}` : '');
}

function itemLines(o: Order, onlyUnsent = false, withPrices = true) {
  return o.items
    .map((i) => {
      const qty = onlyUnsent ? i.qty - i.sentQty : i.qty;
      if (qty <= 0) return '';
      const name = [i.name, i.variant].filter(Boolean).join(' ');
      const extras = i.extras.length ? `<div class="note">+ ${i.extras.map(esc).join(', ')}</div>` : '';
      const note = i.note ? `<div class="note">» ${esc(i.note)}</div>` : '';
      return `<div class="row"><span>${qty} x ${esc(name)}</span>${withPrices ? `<span>${clp(i.unitPrice * qty)}</span>` : ''}</div>${extras}${note}`;
    })
    .join('');
}

export function receiptHtml(state: AppState, o: Order, users: Record<string, string>) {
  const s = state.settings;
  const total = saleTotal(o);
  const { neto, iva } = netAndTax(total);
  const disc = discountAmount(o);
  const pays = o.payments
    .map((p) => {
      const change = p.method === CASH && p.received && p.received > p.amount ? p.received - p.amount : 0;
      return `<div class="row"><span>${esc(p.method)}</span><span>${clp(p.amount)}</span></div>${
        change ? `<div class="row muted"><span>Recibido ${clp(p.received!)}</span><span>Vuelto ${clp(change)}</span></div>` : ''
      }`;
    })
    .join('');
  return `<style>${PAGE}</style>
  <h1>${esc(s.businessName)}</h1>
  ${s.address ? `<div class="c muted">${esc(s.address)}</div>` : ''}
  ${s.phone ? `<div class="c muted">${esc(s.phone)}</div>` : ''}
  <hr>
  <div class="row"><span>Pedido <b>#${o.number}</b></span><span>${fmtDate(o.paidAt ?? o.createdAt)}</span></div>
  <div>${where(state, o)}</div>
  <div class="muted">Atendió: ${esc(users[o.paidBy ?? o.createdBy] ?? '')}</div>
  <hr>
  ${itemLines(o)}
  <hr>
  <div class="row"><span>Subtotal</span><span>${clp(subtotal(o))}</span></div>
  ${disc ? `<div class="row"><span>Descuento</span><span>-${clp(disc)}</span></div>` : ''}
  <div class="row big"><span>TOTAL</span><span>${clp(total)}</span></div>
  <div class="row muted"><span>Neto ${clp(neto)}</span><span>IVA ${clp(iva)}</span></div>
  ${o.tip ? `<div class="row"><span>Propina (voluntaria)</span><span>${clp(o.tip)}</span></div>` : ''}
  ${o.rounding ? `<div class="row muted"><span>Redondeo</span><span>${clp(o.rounding)}</span></div>` : ''}
  ${o.status === 'pagado' ? `<div class="row"><span><b>Pagado</b></span><span><b>${clp(amountDue(o))}</b></span></div>${pays}` : ''}
  ${o.status === 'anulado' ? '<div class="c big">*** ANULADO ***</div>' : ''}
  <hr>
  <div class="c muted">${esc(s.receiptFooter)}</div>`;
}

export function preBillHtml(state: AppState, o: Order) {
  const total = saleTotal(o);
  const tip = Math.round((total * state.settings.tipPercent) / 100);
  return `<style>${PAGE}</style>
  <h1>${esc(state.settings.businessName)}</h1>
  <div class="c">Precuenta</div><hr>
  <div class="row"><span>Pedido <b>#${o.number}</b></span><span>${fmtDate(new Date().toISOString())}</span></div>
  <div>${where(state, o)}</div><hr>
  ${itemLines(o)}<hr>
  ${discountAmount(o) ? `<div class="row"><span>Descuento</span><span>-${clp(discountAmount(o))}</span></div>` : ''}
  <div class="row big"><span>TOTAL</span><span>${clp(total)}</span></div>
  ${state.settings.tipPercent ? `<div class="row"><span>Propina sugerida ${state.settings.tipPercent}%</span><span>${clp(tip)}</span></div>
  <div class="row"><span><b>Total con propina</b></span><span><b>${clp(total + tip)}</b></span></div>` : ''}
  <hr><div class="c muted">La propina es voluntaria. Este documento no es boleta.</div>`;
}

export function kitchenHtml(state: AppState, o: Order, onlyUnsent: boolean) {
  return `<style>${PAGE} body{font-size:14px}</style>
  <div class="c big">COMANDA #${o.number}</div>
  <div class="c"><b>${where(state, o)}</b></div>
  <div class="c muted">${fmtDate(new Date().toISOString())}</div><hr>
  ${itemLines(o, onlyUnsent, false)}<hr>`;
}

export function shiftHtml(state: AppState, sh: Shift, users: Record<string, string>) {
  const orders = state.orders.filter((o) => o.shiftId === sh.id && o.status === 'pagado');
  const byMethod = new Map<string, number>();
  orders.forEach((o) => o.payments.forEach((p) => byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + p.amount)));
  const expected = sh.expectedCash ?? expectedCash(state, sh);
  const diff = sh.countedCash != null ? sh.countedCash - expected : null;
  return `<style>${PAGE}</style>
  <h1>${esc(state.settings.businessName)}</h1><div class="c">Cierre de caja</div><hr>
  <div>Apertura: ${fmtDate(sh.openedAt)} (${esc(users[sh.openedBy] ?? '')})</div>
  ${sh.closedAt ? `<div>Cierre: ${fmtDate(sh.closedAt)} (${esc(users[sh.closedBy!] ?? '')})</div>` : ''}
  <hr>
  <div class="row"><span>Ventas</span><span>${orders.length}</span></div>
  <div class="row"><span>Total vendido</span><span>${clp(orders.reduce((s, o) => s + saleTotal(o), 0))}</span></div>
  <div class="row"><span>Propinas</span><span>${clp(orders.reduce((s, o) => s + o.tip, 0))}</span></div>
  <hr>${[...byMethod].map(([m, a]) => `<div class="row"><span>${esc(m)}</span><span>${clp(a)}</span></div>`).join('')}<hr>
  <div class="row"><span>Efectivo inicial</span><span>${clp(sh.openingCash)}</span></div>
  ${sh.movements.map((m) => `<div class="row"><span>${m.kind === 'ingreso' ? '+' : '-'} ${esc(m.reason)}</span><span>${clp(m.amount)}</span></div>`).join('')}
  <div class="row"><span><b>Efectivo esperado</b></span><span><b>${clp(expected)}</b></span></div>
  ${sh.countedCash != null ? `<div class="row"><span>Efectivo contado</span><span>${clp(sh.countedCash)}</span></div>
  <div class="row big"><span>Diferencia</span><span>${clp(diff!)}</span></div>` : ''}`;
}

/** Imprime HTML en un iframe oculto usando el diálogo del navegador (papel 80 mm). */
export function printHtml(html: string) {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(f);
  const doc = f.contentDocument!;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Imprimir</title></head><body>${html}</body></html>`);
  doc.close();
  setTimeout(() => {
    f.contentWindow?.focus();
    f.contentWindow?.print();
    setTimeout(() => f.remove(), 1000);
  }, 50);
}
