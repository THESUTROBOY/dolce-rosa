import { accountTotal, clp, dayKey, folioLabel, occupiesTable, scoopsFor, turnoOf } from './calc';
import { DEFAULT_FEES, DEFAULT_SETTLE_DAYS, DOC_TYPES, EXPENSE_CATEGORIES, EXPENSE_METHODS } from './defaults';
import { makePayment, methodsLabel, shiftReport, splitTip } from './money';
import { seedState } from './seed';
import type {
  Account,
  AppliedDiscount,
  AppState,
  CashCount,
  Category,
  Comanda,
  ComandaStatus,
  Expense,
  LedgerRow,
  Line,
  Movement,
  PayMethod,
  Product,
  Promotion,
  Reserve,
  Settings,
  Staff,
  Station,
  TableDef,
  TipPayout,
  Turno,
} from './types';
import { FUND_LABEL, MOVEMENT_LABEL, PAY_METHODS, TIP_BUCKET_LABEL } from './types';

export interface Persistence {
  load(): AppState | null;
  save(state: AppState): void;
  /** Avisa cuando otra pestaña del mismo equipo cambió los datos. */
  watch?(fn: (s: AppState) => void): void;
}

/**
 * Pone al día datos guardados con versiones anteriores:
 * ID de detalle (v2), pagos registrados al emitir, y finanzas, gastos y perfiles (v3).
 */
export function migrate(raw: unknown): AppState | null {
  const s = raw as Omit<AppState, 'version'> & { version: number };
  if (!s || (s.version !== 2 && s.version !== 3) || !Array.isArray(s.accounts)) return null;
  if (!s.nextFolio) s.nextFolio = Math.max(0, ...s.accounts.map((a) => a.folio ?? 0)) + 1;
  // Antes el pago se registraba al emitir: esas cuentas ya están pagadas y no deben ocupar la mesa.
  for (const a of s.accounts) if (a.status === 'emitida' && !a.paidAt && a.paymentMethod) a.paidAt = a.emittedAt;
  s.version = 3;
  s.promotions ??= [];
  s.expenses ??= [];
  s.movements ??= [];
  s.tipPayouts ??= [];
  s.reserves ??= [];
  s.counts ??= [];
  s.closes ??= [];
  s.ledgerHistory ??= [];
  s.staff ??= [{ id: 'staff_admin', name: 'Administración', role: 'admin', pin: s.settings.adminPin || '1234', active: true }];
  const st = s.settings;
  st.fees ??= { ...DEFAULT_FEES };
  st.settleDays ??= { ...DEFAULT_SETTLE_DAYS };
  st.openingCash ??= 0;
  st.openingBank ??= 0;
  st.openingDate ??= '';
  st.expenseCategories ??= [...EXPENSE_CATEGORIES];
  st.expenseMethods ??= [...EXPENSE_METHODS];
  st.docTypes ??= [...DOC_TYPES];
  return s as AppState;
}
const withFolio = (s: AppState) => migrate(s)!;

export const localPersistence = (key: string): Persistence => ({
  load() {
    try {
      const raw = localStorage.getItem(key);
      return raw ? migrate(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  },
  save(state) {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* sin almacenamiento: la app sigue funcionando en memoria */
    }
  },
  watch(fn) {
    window.addEventListener('storage', (e) => {
      if (e.key !== key || !e.newValue) return;
      try {
        const s = migrate(JSON.parse(e.newValue));
        if (s) fn(s);
      } catch {
        /* ignora datos corruptos */
      }
    });
  },
});

export const memoryPersistence = (initial?: AppState): Persistence => {
  let s: AppState | null = initial ? structuredClone(initial) : null;
  return { load: () => (s ? withFolio(structuredClone(s)) : null), save: (x) => (s = structuredClone(x)) };
};

export class DomainError extends Error {}

export const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export interface PayInput {
  tip: number;
  /** Atajo: un solo medio por el total. */
  paymentMethod?: PayMethod;
  payments?: { method: PayMethod; amount: number; tip?: number; received?: boolean }[];
  boleta?: string;
}

export interface NewLine {
  productId: string;
  variant?: string;
  extras: string[];
  /** Grupo → opción elegida. */
  choices?: Record<string, string | string[]>;
  /** Un sabor por bola de helado (incluidas + extras). */
  flavors?: string[];
  qty: number;
  note: string;
}

export class Store {
  private state: AppState;
  private listeners = new Set<() => void>();
  private persistence: Persistence;
  /** Reloj inyectable para pruebas. */
  now: () => Date = () => new Date();
  /** Quién está usando este equipo: queda en el registro de cambios. */
  actor = 'Sin nombre';

  constructor(persistence: Persistence, initial: () => AppState = seedState) {
    this.persistence = persistence;
    this.state = persistence.load() ?? migrate(initial())!;
    persistence.save(this.state);
    persistence.watch?.((s) => {
      this.state = s;
      this.listeners.forEach((l) => l());
    });
  }

  get = () => this.state;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private iso = () => this.now().toISOString();

  /** Avisos de cambios hechos en este equipo (para sincronizar). */
  private changeListeners = new Set<(s: AppState) => void>();
  onLocalChange = (fn: (s: AppState) => void) => {
    this.changeListeners.add(fn);
    return () => this.changeListeners.delete(fn);
  };

  private commit(mut: (d: AppState) => void) {
    const d = structuredClone(this.state);
    mut(d);
    this.state = d;
    this.persistence.save(d);
    this.listeners.forEach((l) => l());
    this.changeListeners.forEach((l) => l(d));
  }

  /** Datos que llegan de otro equipo: se guardan y se muestran, sin volver a enviarlos. */
  applyRemote(next: AppState) {
    this.state = next;
    this.persistence.save(next);
    this.listeners.forEach((l) => l());
  }

  private log(d: AppState, action: string, detail: string) {
    d.audit.push({ id: uid('log'), action, detail, at: this.iso(), by: this.actor });
    if (d.audit.length > 5000) d.audit.splice(0, d.audit.length - 5000);
  }

  // ---------- Consultas ----------
  /** La cuenta que ocupa la mesa: abierta, o con el detalle emitido y aún por cobrar. */
  openAccountFor(tableId: string): Account | undefined {
    return this.state.accounts.find((a) => a.tableId === tableId && occupiesTable(a));
  }

  stationOf(productId: string): Station {
    const p = this.state.products.find((x) => x.id === productId);
    return this.state.categories.find((c) => c.id === p?.categoryId)?.station ?? 'barra';
  }

  currentTurno(): { day: string; turno: ReturnType<typeof turnoOf> } {
    const n = this.now();
    return { day: dayKey(n), turno: turnoOf(n, this.state.settings.afternoonStartsAt) };
  }

  /** Devuelve la persona de administración dueña del PIN. */
  checkPin(pin: string): Staff | undefined {
    const admin = this.state.staff.find((p) => p.role === 'admin' && p.active && p.pin === pin);
    if (admin) return admin;
    if (pin === this.state.settings.adminPin) return { id: 'staff_admin', name: 'Administración', role: 'admin', pin, active: true };
    return undefined;
  }

  // ---------- Mesas y cuentas ----------
  addLine(tableId: string, l: NewLine): Account {
    const table = this.state.tables.find((t) => t.id === tableId);
    if (!table) throw new DomainError('Mesa no encontrada');
    const p = this.state.products.find((x) => x.id === l.productId);
    if (!p || p.archived) throw new DomainError('Producto no disponible');
    if (p.soldOut) throw new DomainError(`${p.name} no está disponible`);
    if (!(l.qty >= 1)) throw new DomainError('Cantidad inválida');
    const variant = l.variant ? p.variants.find((v) => v.name === l.variant) : undefined;
    if (p.variants.length && !variant) throw new DomainError('Elige una opción');
    const catExtras = this.state.categories.find((c) => c.id === p.categoryId)?.extras ?? [];
    const extrasPrice = l.extras.reduce((s, e) => {
      const x = p.extras.find((y) => y.name === e) ?? catExtras.find((y) => y.name === e);
      if (!x) throw new DomainError(`Extra no válido: ${e}`);
      return s + x.price;
    }, 0);
    const choices: string[] = [];
    for (const g of p.choices ?? []) {
      const raw = l.choices?.[g.name];
      const picked = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter((v) => g.options.includes(v));
      if (!picked.length || (!g.multi && picked.length > 1)) throw new DomainError(`Elige ${g.name.toLowerCase()}`);
      // Mantiene el orden de la carta: "Fruta frutilla y plátano".
      const v = g.options.filter((o) => picked.includes(o)).map((o) => o.toLowerCase()).join(' y ');
      choices.push(/^(con|sin) /i.test(v) ? v.charAt(0).toUpperCase() + v.slice(1) : `${g.name} ${v}`);
    }
    const scoops = scoopsFor(p, l.extras);
    const flavors = (l.flavors ?? []).map((f) => f.trim()).filter(Boolean);
    if (flavors.length < scoops) throw new DomainError(scoops === 1 ? 'Elige el sabor del helado' : `Elige los ${scoops} sabores de helado`);
    if (scoops) choices.push(`Helado ${flavors.slice(0, scoops).map((f) => f.toLowerCase()).join(' y ')}`);
    const line: Line = {
      id: uid('lin'),
      productId: p.id,
      name: p.name,
      variant: variant?.name,
      extras: l.extras,
      choices: choices.length ? choices : undefined,
      unitPrice: (variant?.price ?? p.price) + extrasPrice,
      qty: l.qty,
      note: l.note.trim(),
      station: this.stationOf(p.id),
      addedAt: this.iso(),
    };
    const current = this.openAccountFor(tableId);
    if (current && current.status !== 'abierta') throw new DomainError('La mesa tiene el detalle emitido. Reábrelo para agregar productos');
    let accountId = current?.id;
    this.commit((d) => {
      let acc = d.accounts.find((a) => a.id === accountId);
      if (!acc) {
        acc = {
          id: uid('cta'),
          number: d.nextAccount++,
          tableId,
          tableName: table.name,
          status: 'abierta',
          lines: [],
          openedAt: this.iso(),
          tip: 0,
        };
        d.accounts.push(acc);
        accountId = acc.id;
      }
      acc.lines.push(line);
    });
    return this.state.accounts.find((a) => a.id === accountId)!;
  }

  /** Cambia cantidad o nota de un producto que todavía no se envía. */
  updateUnsent(accountId: string, lineId: string, patch: { qty?: number; note?: string }) {
    const a = this.state.accounts.find((x) => x.id === accountId);
    const l = a?.lines.find((x) => x.id === lineId);
    if (!a || !l || a.status !== 'abierta') throw new DomainError('La cuenta ya no está abierta');
    if (l.sentAt) throw new DomainError('Ese producto ya se envió; para quitarlo pide a administración');
    this.commit((d) => {
      const acc = d.accounts.find((x) => x.id === accountId)!;
      const line = acc.lines.find((x) => x.id === lineId)!;
      if (patch.note !== undefined) line.note = patch.note.trim();
      if (patch.qty !== undefined) {
        if (patch.qty <= 0) acc.lines = acc.lines.filter((x) => x.id !== lineId);
        else line.qty = patch.qty;
      }
      this.dropIfEmpty(d, acc);
    });
  }

  /** Quita un producto ya enviado. Solo administración. */
  removeSent(isAdmin: boolean, accountId: string, lineId: string, reason: string) {
    if (!isAdmin) throw new DomainError('Solo administración puede quitar productos ya enviados');
    if (!reason.trim()) throw new DomainError('Indica el motivo');
    this.commit((d) => {
      const acc = d.accounts.find((x) => x.id === accountId);
      const line = acc?.lines.find((x) => x.id === lineId);
      if (!acc || !line || acc.status !== 'abierta') return;
      acc.lines = acc.lines.filter((x) => x.id !== lineId);
      this.log(d, 'Quitar producto enviado', `${acc.tableName} cuenta ${acc.number}: ${line.qty}× ${line.name} (${reason})`);
      this.dropIfEmpty(d, acc);
    });
  }

  private dropIfEmpty(d: AppState, acc: Account) {
    if (acc.lines.length === 0 && acc.status === 'abierta') d.accounts = d.accounts.filter((x) => x.id !== acc.id);
  }

  /** Envía lo pendiente: arma una comanda por estación. Devuelve cuántos productos fueron a cada una. */
  send(accountId: string): Record<Station, number> {
    const a = this.state.accounts.find((x) => x.id === accountId);
    if (!a || a.status !== 'abierta') throw new DomainError('La cuenta ya no está abierta');
    const pending = a.lines.filter((l) => !l.sentAt);
    if (!pending.length) throw new DomainError('No hay productos nuevos para enviar');
    const counts: Record<Station, number> = { barra: 0, cocina: 0 };
    this.commit((d) => {
      const acc = d.accounts.find((x) => x.id === accountId)!;
      for (const station of ['cocina', 'barra'] as Station[]) {
        const lines = acc.lines.filter((l) => !l.sentAt && l.station === station);
        if (!lines.length) continue;
        const c: Comanda = {
          id: uid('com'),
          number: d.nextComanda++,
          accountId: acc.id,
          tableName: acc.tableName,
          station,
          items: lines.map((l) => ({ name: l.name, variant: l.variant, extras: l.extras, choices: l.choices, qty: l.qty, note: l.note })),
          createdAt: this.iso(),
          status: 'pendiente',
          updatedAt: this.iso(),
        };
        d.comandas.push(c);
        lines.forEach((l) => {
          l.sentAt = this.iso();
          l.comandaId = c.id;
          counts[station] += l.qty;
        });
      }
    });
    return counts;
  }

  setComandaStatus(id: string, status: ComandaStatus) {
    this.commit((d) => {
      const c = d.comandas.find((x) => x.id === id);
      if (c) {
        c.status = status;
        c.updatedAt = this.iso();
      }
    });
  }

  /** El mesero entrega en la mesa todo lo enviado (esté en preparación o listo). Devuelve cuántas comandas cerró. */
  markServed(accountId: string): number {
    const pending = this.state.comandas.filter((c) => c.accountId === accountId && c.status !== 'entregado');
    if (!pending.length) throw new DomainError('No hay nada pendiente de entregar');
    this.commit((d) => {
      d.comandas
        .filter((c) => c.accountId === accountId && c.status !== 'entregado')
        .forEach((c) => {
          c.status = 'entregado';
          c.updatedAt = this.iso();
        });
    });
    return pending.length;
  }

  moveTable(accountId: string, tableId: string) {
    const table = this.state.tables.find((t) => t.id === tableId);
    if (!table) throw new DomainError('Mesa no encontrada');
    if (this.openAccountFor(tableId)) throw new DomainError(`${table.name} ya tiene una cuenta abierta`);
    this.commit((d) => {
      const acc = d.accounts.find((x) => x.id === accountId);
      if (!acc || !occupiesTable(acc)) return;
      const from = acc.tableName;
      acc.tableId = table.id;
      acc.tableName = table.name;
      d.comandas.filter((c) => c.accountId === acc.id).forEach((c) => (c.tableName = table.name));
      this.log(d, 'Cambiar mesa', `Cuenta ${acc.number}: ${from} → ${table.name}`);
    });
  }

  /**
   * Emite el detalle de cuenta (se entrega antes de pagar): le da su ID y lo deja en el turno actual.
   * La mesa sigue ocupada, "por cobrar", hasta registrar el pago.
   */
  emit(accountId: string) {
    const a = this.state.accounts.find((x) => x.id === accountId);
    if (!a || a.status !== 'abierta') throw new DomainError('La cuenta ya no está abierta');
    if (!a.lines.length) throw new DomainError('La cuenta no tiene productos');
    if (a.lines.some((l) => !l.sentAt)) throw new DomainError('Hay productos sin enviar. Envíalos o quítalos antes de emitir');
    const { day, turno } = this.currentTurno();
    this.commit((d) => {
      const acc = d.accounts.find((x) => x.id === accountId)!;
      acc.status = 'emitida';
      // Si se reabrió para agregar algo, conserva su ID.
      acc.folio ??= d.nextFolio++;
      acc.emittedAt = this.iso();
      acc.emittedBy = this.actor;
      acc.day = day;
      acc.turno = turno;
      // Lo que quedaba listo en cocina o barra se da por entregado.
      d.comandas
        .filter((c) => c.accountId === acc.id && c.status === 'listo')
        .forEach((c) => {
          c.status = 'entregado';
          c.updatedAt = this.iso();
        });
    });
  }

  /**
   * Registra el pago de un detalle emitido y libera la mesa.
   * Admite pagos combinados: la suma debe ser consumo + propina.
   */
  pay(accountId: string, opts: PayInput) {
    const a = this.state.accounts.find((x) => x.id === accountId);
    if (!a || a.status !== 'emitida') throw new DomainError('Primero emite el detalle de cuenta');
    if (a.paidAt) throw new DomainError('Este detalle ya está pagado');
    const { day, turno } = this.currentTurno();
    const payments = this.buildPayments(a, opts, day);
    this.commit((d) => {
      const acc = d.accounts.find((x) => x.id === accountId)!;
      this.applyPayment(acc, payments, opts.boleta, day, turno);
    });
  }

  /** Corrige el pago de una cuenta ya cobrada (solo administración, queda registrado). */
  correctPayment(isAdmin: boolean, accountId: string, opts: PayInput, reason: string) {
    this.admin(isAdmin);
    if (!reason.trim()) throw new DomainError('Indica el motivo');
    const a = this.state.accounts.find((x) => x.id === accountId);
    if (!a || a.status !== 'emitida' || !a.paidAt) throw new DomainError('La cuenta no está cobrada');
    const payments = this.buildPayments(a, opts, a.payDay ?? a.day!);
    this.commit((d) => {
      const acc = d.accounts.find((x) => x.id === accountId)!;
      const before = `${acc.paymentMethod} ${clp(accountTotal(acc) + acc.tip)} (propina ${clp(acc.tip)})`;
      acc.payments = payments;
      acc.tip = payments.reduce((x, p) => x + p.tip, 0);
      acc.paymentMethod = methodsLabel(payments);
      if (opts.boleta !== undefined) acc.boleta = opts.boleta.trim() || undefined;
      this.log(d, 'Corregir pago', `Detalle ${folioLabel(acc.folio)}: ${before} → ${acc.paymentMethod} ${clp(accountTotal(acc) + acc.tip)} (propina ${clp(acc.tip)}). ${reason}`);
    });
  }

  private buildPayments(a: Account, opts: PayInput, day: string) {
    const tip = Math.round(opts.tip);
    if (!(tip >= 0)) throw new DomainError('Propina inválida');
    const consumo = accountTotal(a);
    const rows = opts.payments?.length ? opts.payments : opts.paymentMethod ? [{ method: opts.paymentMethod, amount: consumo + tip }] : [];
    if (!rows.length) throw new DomainError('Elige el medio de pago');
    if (rows.some((r) => !PAY_METHODS.includes(r.method))) throw new DomainError('Medio de pago no válido');
    if (rows.some((r) => !(r.amount > 0))) throw new DomainError('Cada medio de pago necesita un monto');
    const sum = rows.reduce((x, r) => x + Math.round(r.amount), 0);
    if (sum !== consumo + tip) throw new DomainError(`Los pagos suman ${clp(sum)} y deben sumar ${clp(consumo + tip)}`);
    const tips = rows.every((r) => r.tip !== undefined) ? rows.map((r) => Math.round(r.tip!)) : splitTip(rows.map((r) => r.amount), tip);
    if (tips.reduce((x, y) => x + y, 0) !== tip || tips.some((t, i) => t < 0 || t > rows[i].amount)) throw new DomainError('Revisa cómo se reparte la propina');
    return rows.map((r, i) => makePayment(r.method, r.amount, tips[i], day, this.state.settings, r.received ?? true));
  }

  private applyPayment(acc: Account, payments: ReturnType<typeof makePayment>[], boleta: string | undefined, day: string, turno: Turno) {
    acc.paidAt = this.iso();
    acc.payDay = day;
    acc.payTurno = turno;
    acc.paidBy = this.actor;
    acc.payments = payments;
    acc.tip = payments.reduce((x, p) => x + p.tip, 0);
    acc.paymentMethod = methodsLabel(payments);
    acc.boleta = boleta?.trim() || undefined;
  }

  /** Marca una transferencia como recibida (o no) en la cuenta bancaria. */
  setTransferReceived(isAdmin: boolean, accountId: string, index: number, received: boolean) {
    this.admin(isAdmin);
    this.commit((d) => {
      const p = d.accounts.find((x) => x.id === accountId)?.payments?.[index];
      if (!p || p.method !== 'transferencia') return;
      p.received = received;
      p.receivedAt = received ? this.iso() : undefined;
    });
  }

  // ---------- Descuentos ----------
  /** Aplica una promoción (cualquiera) o un descuento manual (solo administración). */
  applyDiscount(isAdmin: boolean, accountId: string, d: Omit<AppliedDiscount, 'id' | 'by'>) {
    const a = this.state.accounts.find((x) => x.id === accountId);
    if (!a || !(a.status === 'abierta' || (a.status === 'emitida' && !a.paidAt))) throw new DomainError('Solo se aplican descuentos antes de cobrar');
    if (!d.promoId && !isAdmin) throw new DomainError('Los descuentos manuales los hace administración');
    if (d.promoId) {
      const promo = this.state.promotions.find((p) => p.id === d.promoId);
      if (!promo || !promo.active) throw new DomainError('La promoción no está activa');
      if (a.discounts?.some((x) => x.promoId === d.promoId)) throw new DomainError('Esa promoción ya está aplicada');
    }
    if (!(d.value > 0) || (d.kind === 'percent' && d.value > 100)) throw new DomainError('Revisa el valor del descuento');
    if (!d.name.trim()) throw new DomainError('El descuento necesita un nombre');
    this.commit((st) => {
      const acc = st.accounts.find((x) => x.id === accountId)!;
      acc.discounts = [...(acc.discounts ?? []), { ...d, name: d.name.trim(), id: uid('dto'), by: this.actor }];
      this.log(st, 'Aplicar descuento', `${acc.tableName} cuenta ${acc.number}: ${d.name} (${d.kind === 'percent' ? `${d.value}%` : clp(d.value)})`);
    });
  }

  /** Aplica una promoción de la lista, con sus productos y categorías ya resueltos. */
  applyPromotion(accountId: string, promoId: string) {
    const p = this.state.promotions.find((x) => x.id === promoId);
    if (!p) throw new DomainError('Promoción no encontrada');
    const ids = [...new Set([...p.productIds, ...this.state.products.filter((x) => p.categoryIds.includes(x.categoryId)).map((x) => x.id)])];
    const a = this.state.accounts.find((x) => x.id === accountId);
    if (ids.length && a && !a.lines.some((l) => ids.includes(l.productId))) throw new DomainError('La cuenta no tiene productos de esta promoción');
    this.applyDiscount(false, accountId, { promoId: p.id, name: p.name, kind: p.kind, value: p.value, productIds: ids.length ? ids : undefined });
  }

  removeDiscount(accountId: string, discountId: string) {
    this.commit((st) => {
      const acc = st.accounts.find((x) => x.id === accountId);
      if (!acc || acc.paidAt) return;
      const dd = acc.discounts?.find((x) => x.id === discountId);
      acc.discounts = acc.discounts?.filter((x) => x.id !== discountId);
      if (dd) this.log(st, 'Quitar descuento', `${acc.tableName} cuenta ${acc.number}: ${dd.name}`);
    });
  }

  /** Promociones activas hoy. */
  activePromotions(): Promotion[] {
    const wd = this.now().getDay();
    return this.state.promotions.filter((p) => p.active && (!p.weekdays?.length || p.weekdays.includes(wd)));
  }

  /** Vuelve a abrir un detalle emitido sin cobrar, para agregar o corregir productos. Conserva su ID. */
  reopen(accountId: string) {
    const a = this.state.accounts.find((x) => x.id === accountId);
    if (!a || a.status !== 'emitida' || a.paidAt) throw new DomainError('Solo se puede reabrir un detalle por cobrar');
    this.commit((d) => {
      const acc = d.accounts.find((x) => x.id === accountId)!;
      acc.status = 'abierta';
    });
  }

  /** Datos para cuadrar con la boleta. Los trabajadores solo pueden tocar su turno de hoy. */
  updateEmitted(isAdmin: boolean, accountId: string, patch: Partial<Pick<Account, 'boleta' | 'checked'>>) {
    const a = this.state.accounts.find((x) => x.id === accountId);
    if (!a || a.status !== 'emitida') throw new DomainError('Cuenta no encontrada');
    const cur = this.currentTurno();
    if (!isAdmin && (a.day !== cur.day || a.turno !== cur.turno)) throw new DomainError('Solo puedes editar cuentas de tu turno');
    this.commit((d) => {
      const acc = d.accounts.find((x) => x.id === accountId)!;
      if (patch.boleta !== undefined) acc.boleta = patch.boleta.trim() || undefined;
      if (patch.checked !== undefined) acc.checked = patch.checked;
    });
  }

  voidAccount(isAdmin: boolean, accountId: string, reason: string) {
    if (!isAdmin) throw new DomainError('Solo administración puede anular');
    if (!reason.trim()) throw new DomainError('Indica el motivo');
    this.commit((d) => {
      const acc = d.accounts.find((x) => x.id === accountId);
      if (!acc || acc.status === 'anulada') return;
      if (acc.status === 'abierta') {
        const { day, turno } = this.currentTurno();
        acc.day = day;
        acc.turno = turno;
      }
      acc.status = 'anulada';
      acc.voidReason = reason.trim();
      acc.voidedAt = this.iso();
      d.comandas
        .filter((c) => c.accountId === acc.id && c.status !== 'entregado')
        .forEach((c) => {
          c.status = 'entregado';
          c.updatedAt = this.iso();
        });
      this.log(d, 'Anular cuenta', `${acc.tableName} ${acc.folio ? `detalle ${folioLabel(acc.folio)}` : 'cuenta abierta'}${acc.paidAt ? ` (cobrada ${clp(accountTotal(acc) + acc.tip)})` : ''}: ${reason}`);
    });
  }

  // ---------- Administración ----------
  private admin(isAdmin: boolean) {
    if (!isAdmin) throw new DomainError('Necesitas el modo administrador');
  }

  saveProduct(isAdmin: boolean, p: Product) {
    this.admin(isAdmin);
    if (!p.name.trim()) throw new DomainError('El producto necesita nombre');
    if (!this.state.categories.some((c) => c.id === p.categoryId)) throw new DomainError('Elige una categoría');
    if (![p.price, ...p.variants.map((v) => v.price), ...p.extras.map((e) => e.price)].every((x) => Number.isFinite(x) && x >= 0))
      throw new DomainError('Revisa los precios');
    this.commit((d) => {
      const i = d.products.findIndex((x) => x.id === p.id);
      const prev = i >= 0 ? d.products[i] : undefined;
      if (!prev) this.log(d, 'Nuevo producto', `${p.name} ${clp(p.price)}`);
      else {
        if (prev.price !== p.price) this.log(d, 'Cambio de precio', `${p.name}: ${clp(prev.price)} → ${clp(p.price)}`);
        if (prev.description !== p.description) this.log(d, 'Cambio de descripción', `${p.name}: «${p.description}»`);
        if (prev.archived && !p.archived) this.log(d, 'Producto vuelve al menú', p.name);
      }
      if (i >= 0) d.products[i] = p;
      else d.products.push(p);
    });
  }

  removeProduct(isAdmin: boolean, id: string): 'archivado' | 'eliminado' {
    this.admin(isAdmin);
    const used = this.state.accounts.some((a) => a.lines.some((l) => l.productId === id));
    const name = this.state.products.find((x) => x.id === id)?.name ?? id;
    this.commit((d) => {
      if (used) {
        const p = d.products.find((x) => x.id === id);
        if (p) p.archived = true;
      } else d.products = d.products.filter((x) => x.id !== id);
      this.log(d, used ? 'Quitar del menú (archivado)' : 'Eliminar producto', name);
    });
    return used ? 'archivado' : 'eliminado';
  }

  setSoldOut(isAdmin: boolean, id: string, soldOut: boolean) {
    this.admin(isAdmin);
    this.commit((d) => {
      const p = d.products.find((x) => x.id === id);
      if (p && p.soldOut !== soldOut) {
        p.soldOut = soldOut;
        this.log(d, soldOut ? 'Producto no disponible' : 'Producto disponible', p.name);
      }
    });
  }

  saveCategory(isAdmin: boolean, c: Category) {
    this.admin(isAdmin);
    if (!c.name.trim()) throw new DomainError('La categoría necesita nombre');
    this.commit((d) => {
      const i = d.categories.findIndex((x) => x.id === c.id);
      if (i >= 0) d.categories[i] = c;
      else d.categories.push(c);
    });
  }

  deleteCategory(isAdmin: boolean, id: string) {
    this.admin(isAdmin);
    if (this.state.products.some((p) => p.categoryId === id && !p.archived))
      throw new DomainError('La categoría tiene productos. Muévelos o quítalos primero');
    this.commit((d) => {
      d.categories = d.categories.filter((c) => c.id !== id);
    });
  }

  saveTables(isAdmin: boolean, tables: TableDef[]) {
    this.admin(isAdmin);
    const clean = tables.map((t) => ({ ...t, name: t.name.trim() })).filter((t) => t.name);
    const removed = this.state.tables.filter((t) => !clean.some((x) => x.id === t.id));
    if (removed.some((t) => this.openAccountFor(t.id))) throw new DomainError('No puedes quitar una mesa con cuenta abierta');
    if (new Set(clean.map((t) => t.name.toLowerCase())).size !== clean.length) throw new DomainError('Hay mesas con el mismo nombre');
    this.commit((d) => {
      d.tables = clean;
    });
  }

  /** Sabores de helado del día: no pide PIN, para que quien vea que se acabó lo saque. */
  setFlavors(flavors: string[]) {
    const clean = [...new Set(flavors.map((f) => f.trim()).filter(Boolean))];
    this.commit((d) => {
      d.settings.iceCreamFlavors = clean;
    });
  }

  saveSettings(isAdmin: boolean, s: Settings) {
    this.admin(isAdmin);
    if (!/^\d{4,6}$/.test(s.adminPin)) throw new DomainError('El PIN debe tener de 4 a 6 números');
    if (!(s.afternoonStartsAt >= 1 && s.afternoonStartsAt <= 23)) throw new DomainError('Hora de cambio de turno inválida');
    if (PAY_METHODS.some((m) => !(s.fees[m] >= 0 && s.fees[m] < 20))) throw new DomainError('Revisa las comisiones');
    if (!s.expenseCategories.length || !s.expenseMethods.length || !s.docTypes.length) throw new DomainError('Las listas del contador no pueden quedar vacías');
    this.commit((d) => {
      const before = d.settings;
      d.settings = s;
      const changed = (Object.keys(s) as (keyof Settings)[]).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(s[k]));
      if (changed.length) this.log(d, 'Cambiar ajustes', changed.join(', ').replace('adminPin', 'PIN'));
    });
  }

  replaceAll(isAdmin: boolean, next: AppState) {
    this.admin(isAdmin);
    const m = migrate(structuredClone(next));
    if (!m) throw new DomainError('El archivo no es un respaldo válido');
    this.commit((d) => {
      Object.assign(d, m);
      this.log(d, 'Restaurar datos', `${m.accounts.length} cuentas, ${m.expenses.length} gastos`);
    });
  }

  // ---------- Promociones ----------
  savePromotion(isAdmin: boolean, p: Promotion) {
    this.admin(isAdmin);
    if (!p.name.trim()) throw new DomainError('La promoción necesita nombre');
    if (!(p.value > 0) || (p.kind === 'percent' && p.value > 100)) throw new DomainError('Revisa el valor del descuento');
    this.commit((d) => {
      const i = d.promotions.findIndex((x) => x.id === p.id);
      if (i >= 0) d.promotions[i] = p;
      else d.promotions.push(p);
      this.log(d, i >= 0 ? 'Editar promoción' : 'Nueva promoción', `${p.name} (${p.kind === 'percent' ? `${p.value}%` : clp(p.value)})${p.active ? '' : ' inactiva'}`);
    });
  }

  deletePromotion(isAdmin: boolean, id: string) {
    this.admin(isAdmin);
    this.commit((d) => {
      const p = d.promotions.find((x) => x.id === id);
      d.promotions = d.promotions.filter((x) => x.id !== id);
      if (p) this.log(d, 'Eliminar promoción', p.name);
    });
  }

  // ---------- Personas ----------
  saveStaff(isAdmin: boolean, staff: Staff[]) {
    this.admin(isAdmin);
    const clean = staff.map((p) => ({ ...p, name: p.name.trim() })).filter((p) => p.name);
    if (!clean.some((p) => p.role === 'admin' && p.active && p.pin)) throw new DomainError('Debe quedar al menos una persona de administración con PIN');
    if (clean.some((p) => p.role === 'admin' && !/^\d{4,6}$/.test(p.pin ?? ''))) throw new DomainError('El PIN debe tener de 4 a 6 números');
    const pins = clean.filter((p) => p.role === 'admin').map((p) => p.pin);
    if (new Set(pins).size !== pins.length) throw new DomainError('Dos personas no pueden tener el mismo PIN');
    this.commit((d) => {
      d.staff = clean;
      this.log(d, 'Cambiar perfiles', clean.map((p) => `${p.name} (${p.role}${p.active ? '' : ', inactiva'})`).join(', '));
    });
  }

  // ---------- Gastos ----------
  /** Cualquiera puede anotar un gasto (ej. compra de leche con plata de la caja). */
  addExpense(e: Omit<Expense, 'id' | 'createdAt' | 'by'>): Expense {
    this.checkExpense(e);
    const x: Expense = { ...e, description: e.description.trim(), notes: e.notes.trim(), id: uid('gas'), createdAt: this.iso(), by: this.actor };
    this.commit((d) => {
      d.expenses.push(x);
      this.log(d, 'Registrar gasto', `${x.date} ${x.description} ${clp(x.amount)} desde ${FUND_LABEL[x.fund]}`);
    });
    return x;
  }

  updateExpense(isAdmin: boolean, e: Expense) {
    this.admin(isAdmin);
    this.checkExpense(e);
    this.commit((d) => {
      const i = d.expenses.findIndex((x) => x.id === e.id);
      if (i < 0) return;
      const prev = d.expenses[i];
      d.expenses[i] = { ...e, createdAt: prev.createdAt, by: prev.by };
      this.log(d, 'Editar gasto', `${prev.description} ${clp(prev.amount)} → ${e.description} ${clp(e.amount)}`);
    });
  }

  voidExpense(isAdmin: boolean, id: string, reason: string) {
    this.admin(isAdmin);
    if (!reason.trim()) throw new DomainError('Indica el motivo');
    this.commit((d) => {
      const e = d.expenses.find((x) => x.id === id);
      if (!e || e.voided) return;
      e.voided = { at: this.iso(), by: this.actor, reason: reason.trim() };
      this.log(d, 'Anular gasto', `${e.description} ${clp(e.amount)}: ${reason}`);
    });
  }

  private checkExpense(e: Pick<Expense, 'date' | 'description' | 'category' | 'amount' | 'fund'>) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) throw new DomainError('Indica la fecha');
    if (!e.description.trim()) throw new DomainError('Describe el gasto');
    if (!e.category) throw new DomainError('Elige la categoría');
    if (!(e.amount > 0)) throw new DomainError('Indica el monto');
    if (e.fund !== 'efectivo' && e.fund !== 'banco') throw new DomainError('Elige el fondo');
  }

  // ---------- Movimientos de dinero ----------
  addMovement(isAdmin: boolean, m: Omit<Movement, 'id' | 'createdAt' | 'by'>) {
    this.admin(isAdmin);
    if (!(m.kind === 'ajuste' ? m.amount !== 0 : m.amount > 0)) throw new DomainError('Indica el monto');
    if (m.kind === 'traspaso' && (!m.toFund || m.toFund === m.fund)) throw new DomainError('El traspaso necesita otro fondo de destino');
    const x: Movement = { ...m, description: m.description.trim(), id: uid('mov'), createdAt: this.iso(), by: this.actor };
    this.commit((d) => {
      d.movements.push(x);
      this.log(d, MOVEMENT_LABEL[x.kind], `${x.date} ${clp(x.amount)} ${x.kind === 'traspaso' ? `${FUND_LABEL[x.fund]} → ${FUND_LABEL[x.toFund!]}` : FUND_LABEL[x.fund]}${x.description ? `: ${x.description}` : ''}`);
    });
    return x;
  }

  voidMovement(isAdmin: boolean, id: string, reason: string) {
    this.admin(isAdmin);
    if (!reason.trim()) throw new DomainError('Indica el motivo');
    this.commit((d) => {
      const m = d.movements.find((x) => x.id === id);
      if (!m || m.voided) return;
      m.voided = { at: this.iso(), by: this.actor, reason: reason.trim() };
      this.log(d, 'Anular movimiento', `${MOVEMENT_LABEL[m.kind]} ${clp(m.amount)}: ${reason}`);
    });
  }

  saveReserves(isAdmin: boolean, reserves: Reserve[]) {
    this.admin(isAdmin);
    const clean = reserves.map((r) => ({ ...r, name: r.name.trim() })).filter((r) => r.name);
    if (clean.some((r) => !(r.amount >= 0))) throw new DomainError('Revisa los montos reservados');
    this.commit((d) => {
      d.reserves = clean;
      this.log(d, 'Cambiar reservas', clean.map((r) => `${r.name} ${clp(r.amount)}`).join(', ') || 'sin reservas');
    });
  }

  // ---------- Propinas ----------
  payTips(isAdmin: boolean, p: Omit<TipPayout, 'id' | 'createdAt' | 'by'>) {
    this.admin(isAdmin);
    if (!(p.amount > 0)) throw new DomainError('Indica el monto entregado');
    const x: TipPayout = { ...p, note: p.note.trim(), id: uid('prp'), createdAt: this.iso(), by: this.actor };
    this.commit((d) => {
      d.tipPayouts.push(x);
      this.log(d, 'Entregar propinas', `${clp(x.amount)} ${TIP_BUCKET_LABEL[x.bucket].toLowerCase()} semana ${x.week}, desde ${FUND_LABEL[x.fund]}`);
    });
  }

  voidTipPayout(isAdmin: boolean, id: string, reason: string) {
    this.admin(isAdmin);
    if (!reason.trim()) throw new DomainError('Indica el motivo');
    this.commit((d) => {
      const p = d.tipPayouts.find((x) => x.id === id);
      if (!p || p.voided) return;
      p.voided = { at: this.iso(), by: this.actor, reason: reason.trim() };
      this.log(d, 'Anular entrega de propinas', `${clp(p.amount)}: ${reason}`);
    });
  }

  // ---------- Cuadratura y cierres ----------
  addCount(isAdmin: boolean, c: Omit<CashCount, 'id' | 'at' | 'by'>): CashCount {
    this.admin(isAdmin);
    if (!(c.realCash >= 0 && c.realBank >= 0)) throw new DomainError('Ingresa lo que hay en caja y en el banco');
    const x: CashCount = { ...c, note: c.note.trim(), id: uid('cua'), at: this.iso(), by: this.actor };
    this.commit((d) => {
      d.counts.push(x);
      this.log(d, 'Cuadratura', `Efectivo ${clp(x.realCash - x.expectedCash)}, banco ${clp(x.realBank - x.expectedBank)}`);
    });
    return x;
  }

  setCountPending(isAdmin: boolean, id: string, pending: boolean) {
    this.admin(isAdmin);
    this.commit((d) => {
      const c = d.counts.find((x) => x.id === id);
      if (c) c.pendingReconcile = pending || undefined;
    });
  }

  /** Cierra un turno: guarda el resumen. El dinero sigue acumulado para el turno siguiente. */
  closeShift(day: string, turno: Turno, opts: { countedCash?: number; note: string; replace?: boolean; isAdmin?: boolean }) {
    const prev = this.state.closes.find((c) => c.day === day && c.turno === turno);
    if (prev && !opts.replace) throw new DomainError('Ese turno ya está cerrado');
    if (prev && !opts.isAdmin) throw new DomainError('Solo administración puede rehacer un cierre');
    const report = shiftReport(this.state, day, turno, this.now());
    this.commit((d) => {
      d.closes = d.closes.filter((c) => c !== prev && c.id !== prev?.id);
      d.closes.push({ id: uid('cie'), day, turno, closedAt: this.iso(), by: this.actor, report, countedCash: opts.countedCash, note: opts.note.trim() });
      const diff = opts.countedCash !== undefined ? ` · contado ${clp(opts.countedCash)} (dif. ${clp(opts.countedCash - report.cashEnd)})` : '';
      this.log(d, prev ? 'Rehacer cierre de turno' : 'Cierre de turno', `${day} ${turno === 'mañana' ? 'AM' : 'PM'}: ventas ${clp(report.consumo)}, propinas ${clp(report.tips)}${diff}`);
    });
  }

  // ---------- Excel del contador ----------
  importLedger(isAdmin: boolean, rows: Omit<LedgerRow, 'id'>[]): number {
    this.admin(isAdmin);
    const key = (r: Omit<LedgerRow, 'id'>) => [r.date, r.tipo, r.description, r.income, r.expense].join('|');
    const have = new Set(this.state.ledgerHistory.map(key));
    const fresh = rows.filter((r) => !have.has(key(r)) && (have.add(key(r)), true));
    this.commit((d) => {
      d.ledgerHistory.push(...fresh.map((r) => ({ ...r, id: uid('his') })));
      this.log(d, 'Importar historial', `${fresh.length} filas nuevas del Excel (${rows.length - fresh.length} repetidas)`);
    });
    return fresh.length;
  }

  clearLedger(isAdmin: boolean) {
    this.admin(isAdmin);
    this.commit((d) => {
      this.log(d, 'Borrar historial importado', `${d.ledgerHistory.length} filas`);
      d.ledgerHistory = [];
    });
  }
}
