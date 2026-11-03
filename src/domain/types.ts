export type Role = 'admin' | 'cajero';

export interface User {
  id: string;
  name: string;
  role: Role;
  pin: string;
  active: boolean;
}

export interface Category {
  id: string;
  name: string;
  sort: number;
}

export interface Option {
  name: string;
  /** Precio en CLP con IVA. Para variantes es el precio final; para extras, lo que se suma. */
  price: number;
}

export interface Product {
  id: string;
  categoryId: string;
  name: string;
  /** Precio base con IVA incluido (CLP). Se ignora si hay variantes. */
  price: number;
  variants: Option[];
  extras: Option[];
  soldOut: boolean;
  archived: boolean;
}

export interface PriceChange {
  id: string;
  productId: string;
  productName: string;
  before: string;
  after: string;
  by: string;
  at: string;
}

export interface OrderItem {
  id: string;
  productId: string;
  name: string;
  variant?: string;
  extras: string[];
  unitPrice: number;
  qty: number;
  note: string;
  /** Unidades ya enviadas a comanda. */
  sentQty: number;
}

export type OrderType = 'mesa' | 'llevar';
export type OrderStatus = 'abierto' | 'pagado' | 'anulado';
export type KitchenStatus = 'pendiente' | 'listo' | 'entregado';

export interface Discount {
  kind: 'monto' | 'porcentaje';
  value: number;
}

export interface Payment {
  method: string;
  /** Monto aplicado al pedido (incluye propina y redondeo). */
  amount: number;
  /** Solo efectivo: lo que entregó el cliente. */
  received?: number;
}

export interface Order {
  id: string;
  number: number;
  type: OrderType;
  tableId?: string;
  customerName: string;
  status: OrderStatus;
  kitchenStatus: KitchenStatus;
  items: OrderItem[];
  discount?: Discount;
  tip: number;
  /** Ajuste por redondeo del efectivo (puede ser negativo). */
  rounding: number;
  payments: Payment[];
  createdBy: string;
  createdAt: string;
  paidAt?: string;
  paidBy?: string;
  shiftId?: string;
  voidReason?: string;
  voidedBy?: string;
  voidedAt?: string;
}

export interface CashMovement {
  id: string;
  kind: 'ingreso' | 'retiro';
  amount: number;
  reason: string;
  by: string;
  at: string;
}

export interface Shift {
  id: string;
  openedBy: string;
  openedAt: string;
  openingCash: number;
  movements: CashMovement[];
  closedBy?: string;
  closedAt?: string;
  countedCash?: number;
  expectedCash?: number;
  note?: string;
}

export interface TableDef {
  id: string;
  name: string;
}

export interface Settings {
  businessName: string;
  address: string;
  phone: string;
  receiptFooter: string;
  tipPercent: number;
  paymentMethods: string[];
}

export interface AuditEntry {
  id: string;
  action: string;
  detail: string;
  by: string;
  at: string;
}

export interface AppState {
  version: 1;
  users: User[];
  categories: Category[];
  products: Product[];
  priceChanges: PriceChange[];
  tables: TableDef[];
  orders: Order[];
  shifts: Shift[];
  settings: Settings;
  audit: AuditEntry[];
  nextOrderNumber: number;
}

export const CASH = 'Efectivo';
