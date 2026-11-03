import { amountDue, expectedCash, paidSoFar } from './calc';
import { seedState } from './seed';
import type {
  AppState,
  Category,
  Order,
  OrderType,
  Payment,
  Product,
  Settings,
  Shift,
  TableDef,
  User,
} from './types';

export interface Persistence {
  load(): AppState | null;
  save(state: AppState): void;
}

export const localPersistence = (key = 'dolce-rosa:v1'): Persistence => ({
  load() {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as AppState) : null;
    } catch {
      return null;
    }
  },
  save(state) {
    localStorage.setItem(key, JSON.stringify(state));
  },
});

export const memoryPersistence = (): Persistence => {
  let s: AppState | null = null;
  return { load: () => s, save: (x) => (s = structuredClone(x)) };
};

export class DomainError extends Error {}

export const uid = (p: string) =>
  `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const now = () => new Date().toISOString();

export class Store {
  private state: AppState;
  private listeners = new Set<() => void>();
  private persistence: Persistence;

  constructor(persistence: Persistence) {
    this.persistence = persistence;
    this.state = persistence.load() ?? seedState();
    persistence.save(this.state);
  }

  get = () => this.state;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private commit(mut: (draft: AppState) => void) {
    const draft = structuredClone(this.state);
    mut(draft);
    this.state = draft;
    this.persistence.save(draft);
    this.listeners.forEach((l) => l());
  }

  private user(id: string): User {
    const u = this.state.users.find((x) => x.id === id && x.active);
    if (!u) throw new DomainError('Usuario no válido');
    return u;
  }

  private requireAdmin(userId: string) {
    if (this.user(userId).role !== 'admin') throw new DomainError('Solo un administrador puede hacer esto');
  }

  private log(d: AppState, by: string, action: string, detail: string) {
    d.audit.push({ id: uid('log'), action, detail, by, at: now() });
  }

  // ---------- Sesión ----------
  login(pin: string): User {
    const u = this.state.users.find((x) => x.pin === pin && x.active);
    if (!u) throw new DomainError('PIN incorrecto');
    return u;
  }

  // ---------- Caja ----------
  openShift(): Shift | undefined {
    return this.state.shifts.find((s) => !s.closedAt);
  }

  startShift(userId: string, openingCash: number) {
    this.user(userId);
    if (this.openShift()) throw new DomainError('Ya hay una caja abierta');
    if (!(openingCash >= 0)) throw new DomainError('Monto inicial inválido');
    this.commit((d) => {
      d.shifts.push({ id: uid('turno'), openedBy: userId, openedAt: now(), openingCash, movements: [] });
      this.log(d, userId, 'Abrir caja', `Monto inicial ${openingCash}`);
    });
  }

  addMovement(userId: string, kind: 'ingreso' | 'retiro', amount: number, reason: string) {
    this.user(userId);
    const s = this.openShift();
    if (!s) throw new DomainError('No hay caja abierta');
    if (!(amount > 0)) throw new DomainError('Monto inválido');
    if (!reason.trim()) throw new DomainError('Indica un motivo');
    this.commit((d) => {
      d.shifts.find((x) => x.id === s.id)!.movements.push({ id: uid('mov'), kind, amount, reason, by: userId, at: now() });
      this.log(d, userId, kind === 'ingreso' ? 'Ingreso de caja' : 'Retiro de caja', `${amount}: ${reason}`);
    });
  }

  closeShift(userId: string, countedCash: number, note = '') {
    this.user(userId);
    const s = this.openShift();
    if (!s) throw new DomainError('No hay caja abierta');
    if (!(countedCash >= 0)) throw new DomainError('Monto contado inválido');
    const expected = expectedCash(this.state, s);
    this.commit((d) => {
      const x = d.shifts.find((y) => y.id === s.id)!;
      x.closedAt = now();
      x.closedBy = userId;
      x.countedCash = countedCash;
      x.expectedCash = expected;
      x.note = note;
      this.log(d, userId, 'Cerrar caja', `Esperado ${expected}, contado ${countedCash}`);
    });
  }

  // ---------- Pedidos ----------
  newOrder(userId: string, type: OrderType, tableId?: string): Order {
    this.user(userId);
    return {
      id: uid('ped'),
      number: 0,
      type,
      tableId,
      customerName: '',
      status: 'abierto',
      kitchenStatus: 'pendiente',
      items: [],
      tip: 0,
      rounding: 0,
      payments: [],
      createdBy: userId,
      createdAt: now(),
    };
  }

  /** Guarda (crea o actualiza) un pedido abierto. Devuelve el pedido con número asignado. */
  saveOrder(userId: string, order: Order): Order {
    this.user(userId);
    const existing = this.state.orders.find((o) => o.id === order.id);
    if (existing && existing.status !== 'abierto') throw new DomainError('El pedido ya está cerrado');
    if (order.type === 'mesa' && !order.tableId) throw new DomainError('Elige una mesa');
    if (order.type === 'mesa') {
      const busy = this.state.orders.find(
        (o) => o.status === 'abierto' && o.tableId === order.tableId && o.id !== order.id,
      );
      if (busy) throw new DomainError(`La mesa ya tiene el pedido #${busy.number} abierto`);
    }
    let saved = order;
    this.commit((d) => {
      if (existing) {
        const i = d.orders.findIndex((o) => o.id === order.id);
        d.orders[i] = { ...order, number: existing.number };
        saved = d.orders[i];
      } else {
        saved = { ...order, number: d.nextOrderNumber++ };
        d.orders.push(saved);
      }
    });
    return saved;
  }

  markSent(orderId: string) {
    this.commit((d) => {
      const o = d.orders.find((x) => x.id === orderId);
      if (!o) return;
      o.items.forEach((i) => (i.sentQty = i.qty));
      o.kitchenStatus = 'pendiente';
    });
  }

  setKitchenStatus(orderId: string, status: Order['kitchenStatus']) {
    this.commit((d) => {
      const o = d.orders.find((x) => x.id === orderId);
      if (o) o.kitchenStatus = status;
    });
  }

  /** Elimina un pedido abierto sin cobrar (por ejemplo, creado por error). Queda en el registro. */
  discardOpenOrder(userId: string, orderId: string, reason: string) {
    this.voidOrder(userId, orderId, reason);
  }

  pay(userId: string, orderId: string, payments: Payment[], tip: number, rounding: number) {
    this.user(userId);
    const shift = this.openShift();
    if (!shift) throw new DomainError('Abre la caja antes de cobrar');
    const o = this.state.orders.find((x) => x.id === orderId);
    if (!o || o.status !== 'abierto') throw new DomainError('Pedido no disponible');
    if (o.items.length === 0) throw new DomainError('El pedido está vacío');
    if (tip < 0) throw new DomainError('Propina inválida');
    const due = amountDue({ ...o, tip, rounding });
    const paid = paidSoFar({ payments });
    if (paid !== due) throw new DomainError(`Los pagos (${paid}) no cuadran con el total (${due})`);
    this.commit((d) => {
      const x = d.orders.find((y) => y.id === orderId)!;
      x.payments = payments;
      x.tip = tip;
      x.rounding = rounding;
      x.status = 'pagado';
      x.paidAt = now();
      x.paidBy = userId;
      x.shiftId = shift.id;
    });
  }

  voidOrder(userId: string, orderId: string, reason: string) {
    const o = this.state.orders.find((x) => x.id === orderId);
    if (!o) throw new DomainError('Pedido no encontrado');
    if (o.status === 'anulado') throw new DomainError('El pedido ya está anulado');
    if (o.status === 'pagado') {
      this.requireAdmin(userId);
      const shift = this.state.shifts.find((s) => s.id === o.shiftId);
      if (shift?.closedAt) throw new DomainError('La caja de esa venta ya se cerró; no se puede anular');
    } else {
      this.user(userId);
    }
    if (!reason.trim()) throw new DomainError('Indica el motivo');
    this.commit((d) => {
      const x = d.orders.find((y) => y.id === orderId)!;
      x.status = 'anulado';
      x.voidReason = reason;
      x.voidedBy = userId;
      x.voidedAt = now();
      this.log(d, userId, 'Anular pedido', `#${x.number}: ${reason}`);
    });
  }

  logReprint(userId: string, orderId: string, what: string) {
    const o = this.state.orders.find((x) => x.id === orderId);
    this.commit((d) => this.log(d, userId, 'Reimpresión', `${what} #${o?.number ?? '?'}`));
  }

  // ---------- Carta ----------
  saveCategory(userId: string, c: Category) {
    this.requireAdmin(userId);
    if (!c.name.trim()) throw new DomainError('Nombre requerido');
    this.commit((d) => {
      const i = d.categories.findIndex((x) => x.id === c.id);
      if (i >= 0) d.categories[i] = c;
      else d.categories.push(c);
    });
  }

  deleteCategory(userId: string, id: string) {
    this.requireAdmin(userId);
    if (this.state.products.some((p) => p.categoryId === id && !p.archived))
      throw new DomainError('La categoría tiene productos; muévelos o archívalos primero');
    this.commit((d) => {
      d.categories = d.categories.filter((c) => c.id !== id);
    });
  }

  saveProduct(userId: string, p: Product) {
    this.requireAdmin(userId);
    if (!p.name.trim()) throw new DomainError('Nombre requerido');
    if (!(p.price >= 0) || p.variants.some((v) => !(v.price >= 0)) || p.extras.some((v) => !(v.price >= 0)))
      throw new DomainError('Precio inválido');
    const prev = this.state.products.find((x) => x.id === p.id);
    const priceSig = (x: Product) =>
      x.variants.length ? x.variants.map((v) => `${v.name} ${v.price}`).join(', ') : String(x.price);
    this.commit((d) => {
      const i = d.products.findIndex((x) => x.id === p.id);
      if (i >= 0) d.products[i] = p;
      else d.products.push(p);
      if (prev && priceSig(prev) !== priceSig(p)) {
        d.priceChanges.push({
          id: uid('precio'),
          productId: p.id,
          productName: p.name,
          before: priceSig(prev),
          after: priceSig(p),
          by: userId,
          at: now(),
        });
      }
    });
  }

  /** Productos con ventas no se borran: se archivan para no romper los reportes. */
  deleteProduct(userId: string, id: string) {
    this.requireAdmin(userId);
    const used = this.state.orders.some((o) => o.items.some((i) => i.productId === id));
    this.commit((d) => {
      if (used) {
        const p = d.products.find((x) => x.id === id);
        if (p) p.archived = true;
      } else {
        d.products = d.products.filter((x) => x.id !== id);
      }
    });
    return used ? 'archivado' : 'eliminado';
  }

  setSoldOut(userId: string, id: string, soldOut: boolean) {
    this.user(userId);
    this.commit((d) => {
      const p = d.products.find((x) => x.id === id);
      if (p) p.soldOut = soldOut;
    });
  }

  // ---------- Configuración ----------
  saveSettings(userId: string, s: Settings) {
    this.requireAdmin(userId);
    this.commit((d) => {
      d.settings = s;
    });
  }

  saveTables(userId: string, tables: TableDef[]) {
    this.requireAdmin(userId);
    const removed = this.state.tables.filter((t) => !tables.some((x) => x.id === t.id));
    if (removed.some((t) => this.state.orders.some((o) => o.status === 'abierto' && o.tableId === t.id)))
      throw new DomainError('No puedes quitar una mesa con pedido abierto');
    this.commit((d) => {
      d.tables = tables;
    });
  }

  saveUser(userId: string, u: User) {
    this.requireAdmin(userId);
    if (!u.name.trim()) throw new DomainError('Nombre requerido');
    if (!/^\d{4,6}$/.test(u.pin)) throw new DomainError('El PIN debe tener de 4 a 6 dígitos');
    if (this.state.users.some((x) => x.pin === u.pin && x.id !== u.id)) throw new DomainError('Ese PIN ya está en uso');
    const admins = this.state.users.filter((x) => x.role === 'admin' && x.active && x.id !== u.id);
    if (admins.length === 0 && (u.role !== 'admin' || !u.active))
      throw new DomainError('Debe quedar al menos un administrador activo');
    this.commit((d) => {
      const i = d.users.findIndex((x) => x.id === u.id);
      if (i >= 0) d.users[i] = u;
      else d.users.push(u);
      this.log(d, userId, 'Usuario', `${i >= 0 ? 'Editar' : 'Crear'} ${u.name}`);
    });
  }

  // ---------- Respaldo ----------
  exportBackup(): string {
    return JSON.stringify(this.state, null, 2);
  }

  importBackup(userId: string, json: string) {
    this.requireAdmin(userId);
    const s = JSON.parse(json) as AppState;
    if (s.version !== 1 || !Array.isArray(s.orders) || !Array.isArray(s.users))
      throw new DomainError('El archivo no es un respaldo válido');
    this.commit((d) => Object.assign(d, s));
  }
}
