/** Estación donde se prepara un producto. */
export type Station = 'barra' | 'cocina';

export const STATION_LABEL: Record<Station, string> = {
  barra: 'Cafetería y preparados',
  cocina: 'Cocina',
};

export type Turno = 'mañana' | 'tarde';

export interface Category {
  id: string;
  name: string;
  sort: number;
  station: Station;
}

export interface Option {
  name: string;
  /** CLP con IVA. Variante: precio final. Extra: lo que se suma. */
  price: number;
}

export interface Product {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  /** Precio con IVA. Se ignora si hay variantes. */
  price: number;
  variants: Option[];
  extras: Option[];
  soldOut: boolean;
  archived: boolean;
}

export interface Line {
  id: string;
  productId: string;
  name: string;
  variant?: string;
  extras: string[];
  unitPrice: number;
  qty: number;
  note: string;
  station: Station;
  addedAt: string;
  /** Se completa al enviar a la comanda. */
  sentAt?: string;
  comandaId?: string;
}

export type AccountStatus = 'abierta' | 'emitida' | 'anulada';

/** La cuenta de una mesa: se abre con el primer producto y se cierra al emitir el detalle. */
export interface Account {
  id: string;
  number: number;
  tableId: string;
  tableName: string;
  status: AccountStatus;
  /** ID del detalle de cuenta: correlativo, se asigna al emitir y nunca se repite (las anuladas lo conservan). */
  folio?: number;
  lines: Line[];
  openedAt: string;
  emittedAt?: string;
  /** Fecha local YYYY-MM-DD y turno en que se emitió el detalle. */
  day?: string;
  turno?: Turno;
  tip: number;
  paymentMethod?: string;
  /** Número de boleta con que se cuadró (opcional). */
  boleta?: string;
  checked?: boolean;
  voidReason?: string;
  voidedAt?: string;
}

export type ComandaStatus = 'pendiente' | 'preparando' | 'listo' | 'entregado';

export interface ComandaItem {
  name: string;
  variant?: string;
  extras: string[];
  qty: number;
  note: string;
}

export interface Comanda {
  id: string;
  number: number;
  accountId: string;
  tableName: string;
  station: Station;
  items: ComandaItem[];
  createdAt: string;
  status: ComandaStatus;
  updatedAt: string;
}

export interface TableDef {
  id: string;
  name: string;
}

export interface Settings {
  businessName: string;
  address: string;
  phone: string;
  footer: string;
  tipPercent: number;
  paymentMethods: string[];
  /** Hora (0-23) en que empieza el turno de la tarde. */
  afternoonStartsAt: number;
  adminPin: string;
}

export interface AuditEntry {
  id: string;
  action: string;
  detail: string;
  at: string;
}

export interface AppState {
  version: 2;
  categories: Category[];
  products: Product[];
  tables: TableDef[];
  accounts: Account[];
  comandas: Comanda[];
  settings: Settings;
  audit: AuditEntry[];
  nextAccount: number;
  nextComanda: number;
  nextFolio: number;
}
