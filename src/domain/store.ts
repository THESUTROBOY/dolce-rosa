import { dayKey, folioLabel, occupiesTable, scoopsFor, turnoOf } from './calc';
import { seedState } from './seed';
import type { Account, AppState, Category, Comanda, ComandaStatus, Line, Product, Settings, Station, TableDef } from './types';

export interface Persistence {
  load(): AppState | null;
  save(state: AppState): void;
  /** Avisa cuando otra pestaña del mismo equipo cambió los datos. */
  watch?(fn: (s: AppState) => void): void;
}

/** Respaldos anteriores al ID de detalle: continúa la numeración desde el mayor existente. */
function withFolio(s: AppState): AppState {
  if (!s.nextFolio) s.nextFolio = Math.max(0, ...s.accounts.map((a) => a.folio ?? 0)) + 1;
  // Antes el pago se registraba al emitir: esas cuentas ya están pagadas y no deben ocupar la mesa.
  for (const a of s.accounts) if (a.status === 'emitida' && !a.paidAt && a.paymentMethod) a.paidAt = a.emittedAt;
  return s;
}

export const localPersistence = (key: string): Persistence => ({
  load() {
    try {
      const raw = localStorage.getItem(key);
      const s = raw ? (JSON.parse(raw) as AppState) : null;
      return s?.version === 2 ? withFolio(s) : null;
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
        fn(JSON.parse(e.newValue) as AppState);
      } catch {
        /* ignora datos corruptos */
      }
    });
  },
});

export const memoryPersistence = (initial?: AppState): Persistence => {
  let s: AppState | null = initial ? structuredClone(initial) : null;
  return { load: () => (s ? withFolio(s) : null), save: (x) => (s = structuredClone(x)) };
};

export class DomainError extends Error {}

export const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export interface NewLine {
  productId: string;
  variant?: string;
  extras: string[];
  /** Grupo → opción elegida. */
  choices?: Record<string, string>;
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

  constructor(persistence: Persistence, initial: () => AppState = seedState) {
    this.persistence = persistence;
    this.state = persistence.load() ?? initial();
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

  private commit(mut: (d: AppState) => void) {
    const d = structuredClone(this.state);
    mut(d);
    this.state = d;
    this.persistence.save(d);
    this.listeners.forEach((l) => l());
  }

  private log(d: AppState, action: string, detail: string) {
    d.audit.push({ id: uid('log'), action, detail, at: this.iso() });
    if (d.audit.length > 2000) d.audit.splice(0, d.audit.length - 2000);
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

  checkPin(pin: string) {
    return pin === this.state.settings.adminPin;
  }

  // ---------- Mesas y cuentas ----------
  addLine(tableId: string, l: NewLine): Account {
    const table = this.state.tables.find((t) => t.id === tableId);
    if (!table) throw new DomainError('Mesa no encontrada');
    const p = this.state.products.find((x) => x.id === l.productId);
    if (!p || p.archived) throw new DomainError('Producto no disponible');
    if (p.soldOut) throw new DomainError(`${p.name} está agotado`);
    if (!(l.qty >= 1)) throw new DomainError('Cantidad inválida');
    const variant = l.variant ? p.variants.find((v) => v.name === l.variant) : undefined;
    if (p.variants.length && !variant) throw new DomainError('Elige una opción');
    const extrasPrice = l.extras.reduce((s, e) => {
      const x = p.extras.find((y) => y.name === e);
      if (!x) throw new DomainError(`Extra no válido: ${e}`);
      return s + x.price;
    }, 0);
    const choices: string[] = [];
    for (const g of p.choices ?? []) {
      const v = l.choices?.[g.name];
      if (!v || !g.options.includes(v)) throw new DomainError(`Elige ${g.name.toLowerCase()}`);
      choices.push(/^(con|sin) /i.test(v) ? v : `${g.name} ${v.toLowerCase()}`);
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

  /** Registra el pago de un detalle emitido y libera la mesa. */
  pay(accountId: string, opts: { tip: number; paymentMethod: string; boleta?: string }) {
    const a = this.state.accounts.find((x) => x.id === accountId);
    if (!a || a.status !== 'emitida') throw new DomainError('Primero emite el detalle de cuenta');
    if (a.paidAt) throw new DomainError('Este detalle ya está pagado');
    if (!(opts.tip >= 0)) throw new DomainError('Propina inválida');
    if (!opts.paymentMethod) throw new DomainError('Elige el medio de pago');
    this.commit((d) => {
      const acc = d.accounts.find((x) => x.id === accountId)!;
      acc.paidAt = this.iso();
      acc.tip = Math.round(opts.tip);
      acc.paymentMethod = opts.paymentMethod;
      acc.boleta = opts.boleta?.trim() || undefined;
    });
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
  updateEmitted(isAdmin: boolean, accountId: string, patch: Partial<Pick<Account, 'boleta' | 'checked' | 'paymentMethod'>>) {
    const a = this.state.accounts.find((x) => x.id === accountId);
    if (!a || a.status !== 'emitida') throw new DomainError('Cuenta no encontrada');
    const cur = this.currentTurno();
    if (!isAdmin && (a.day !== cur.day || a.turno !== cur.turno)) throw new DomainError('Solo puedes editar cuentas de tu turno');
    this.commit((d) => {
      const acc = d.accounts.find((x) => x.id === accountId)!;
      if (patch.boleta !== undefined) acc.boleta = patch.boleta.trim() || undefined;
      if (patch.checked !== undefined) acc.checked = patch.checked;
      if (patch.paymentMethod) acc.paymentMethod = patch.paymentMethod;
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
      this.log(d, 'Anular cuenta', `${acc.tableName} ${acc.folio ? `detalle ${folioLabel(acc.folio)}` : 'cuenta abierta'}: ${reason}`);
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
      if (prev && prev.price !== p.price) this.log(d, 'Cambio de precio', `${p.name}: ${prev.price} → ${p.price}`);
      if (i >= 0) d.products[i] = p;
      else d.products.push(p);
    });
  }

  removeProduct(isAdmin: boolean, id: string): 'archivado' | 'eliminado' {
    this.admin(isAdmin);
    const used = this.state.accounts.some((a) => a.lines.some((l) => l.productId === id));
    this.commit((d) => {
      if (used) {
        const p = d.products.find((x) => x.id === id);
        if (p) p.archived = true;
      } else d.products = d.products.filter((x) => x.id !== id);
    });
    return used ? 'archivado' : 'eliminado';
  }

  setSoldOut(isAdmin: boolean, id: string, soldOut: boolean) {
    this.admin(isAdmin);
    this.commit((d) => {
      const p = d.products.find((x) => x.id === id);
      if (p) p.soldOut = soldOut;
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
    if (!s.paymentMethods.length) throw new DomainError('Agrega al menos un medio de pago');
    this.commit((d) => {
      d.settings = s;
    });
  }

  replaceAll(isAdmin: boolean, next: AppState) {
    this.admin(isAdmin);
    if (next.version !== 2 || !Array.isArray(next.accounts)) throw new DomainError('El archivo no es un respaldo válido');
    this.commit((d) => Object.assign(d, withFolio(next)));
  }
}
