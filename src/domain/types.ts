/** Estación donde se prepara un producto. */
export type Station = 'barra' | 'cocina';

export const STATION_LABEL: Record<Station, string> = {
  barra: 'Cafetería y preparados',
  cocina: 'Cocina',
};

export type Turno = 'mañana' | 'tarde';
export const TURNO_LABEL: Record<Turno, string> = { mañana: 'AM', tarde: 'PM' };

/** Medios con que paga el cliente. */
export type PayMethod = 'efectivo' | 'debito' | 'credito' | 'transferencia';
export const PAY_METHODS: PayMethod[] = ['efectivo', 'debito', 'credito', 'transferencia'];
export const PAY_LABEL: Record<PayMethod, string> = { efectivo: 'Efectivo', debito: 'Débito', credito: 'Crédito', transferencia: 'Transferencia' };

/** Lugares donde está la plata del negocio. */
export type Fund = 'efectivo' | 'banco';
export const FUND_LABEL: Record<Fund, string> = { efectivo: 'Efectivo (caja)', banco: 'Cuenta bancaria' };

export interface Category {
  id: string;
  name: string;
  sort: number;
  station: Station;
  /** Extras que se pueden agregar a cualquier producto de la categoría (ej. agregados del gohan). */
  extras?: Option[];
}

export interface Option {
  name: string;
  /** CLP con IVA. Variante: precio final. Extra: lo que se suma. */
  price: number;
}

/** Grupo de opciones sin costo donde se elige una, ej. Salsa: chocolate, caramelo… */
export interface ChoiceGroup {
  name: string;
  options: string[];
  /** Se puede elegir más de una (ej. fruta: frutilla y plátano). */
  multi?: boolean;
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
  /** Opciones incluidas que hay que elegir (salsa, topping, crema, fruta). */
  choices?: ChoiceGroup[];
  /** Bolas de helado incluidas; el sabor se elige al pedir. */
  scoops?: number;
  /** No disponible por ahora: se ve en el menú pero no se puede pedir. */
  soldOut: boolean;
  archived: boolean;
}

/** Promoción o descuento que administración deja listo para aplicar en una cuenta. */
export interface Promotion {
  id: string;
  name: string;
  kind: 'percent' | 'amount';
  /** Porcentaje (0-100) o monto en pesos. Si aplica a productos, el monto es por unidad. */
  value: number;
  /** Vacío = toda la cuenta. */
  productIds: string[];
  categoryIds: string[];
  active: boolean;
  /** Días en que vale (0 domingo … 6 sábado). Vacío = todos. */
  weekdays?: number[];
}

/** Descuento aplicado en una cuenta (copia de la promoción al momento de aplicarla). */
export interface AppliedDiscount {
  id: string;
  promoId?: string;
  name: string;
  kind: 'percent' | 'amount';
  value: number;
  /** Productos a los que aplica; sin esto, a toda la cuenta. */
  productIds?: string[];
  by?: string;
}

/** Un pago (o parte de un pago combinado). */
export interface Payment {
  method: PayMethod;
  /** Lo que se cobró por este medio, propina incluida. */
  amount: number;
  /** Parte de `amount` que es propina. */
  tip: number;
  /** Comisión del medio de pago (Mercado Pago) sobre `amount`. */
  fee: number;
  /** Parte exacta de `fee` que corresponde a la propina (fee − comisión sobre el consumo). */
  tipFee?: number;
  /** Día en que el abono llega a la cuenta bancaria (tarjetas). */
  settleOn?: string;
  /** Transferencias: si ya se vio en la cuenta. */
  received?: boolean;
  receivedAt?: string;
}

export interface Line {
  id: string;
  productId: string;
  name: string;
  variant?: string;
  extras: string[];
  /** Lo elegido sin costo, ya escrito: "Salsa chocolate", "Helado lúcuma". */
  choices?: string[];
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
  /** Cuándo se registró el pago. Sin esto, el detalle emitido está "por cobrar" y la mesa sigue ocupada. */
  paidAt?: string;
  /** Fecha local YYYY-MM-DD y turno en que se emitió el detalle. */
  day?: string;
  turno?: Turno;
  /** Propina total (suma de la propina de cada pago). No es ganancia de la cafetería. */
  tip: number;
  /** Resumen legible de los medios de pago, ej. "Efectivo + Débito". */
  paymentMethod?: string;
  payments?: Payment[];
  discounts?: AppliedDiscount[];
  /** Día y turno en que se cobró (para los cierres de caja). */
  payDay?: string;
  payTurno?: Turno;
  emittedBy?: string;
  paidBy?: string;
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
  choices?: string[];
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
  /** Antiguo: medios de pago libres. Ahora son fijos (PAY_METHODS). */
  paymentMethods?: string[];
  /** Comisión en % (IVA incluido) por medio de pago. */
  fees: Record<PayMethod, number>;
  /** Días que demora el abono en llegar a la cuenta bancaria. */
  settleDays: Record<PayMethod, number>;
  /** Si la comisión de la propina pagada con tarjeta se descuenta de la propina (si no, la absorbe la cafetería). */
  tipFeeFromTip?: boolean;
  /** Saldos con que parte el control financiero. */
  openingCash: number;
  openingBank: number;
  /** Día desde el que cuentan los saldos (YYYY-MM-DD). */
  openingDate: string;
  /** Listas del Excel del contador. */
  expenseCategories: string[];
  expenseMethods: string[];
  docTypes: string[];
  /** Hora (0-23) en que empieza el turno de la tarde. */
  afternoonStartsAt: number;
  adminPin: string;
  /** Abrir la impresión del detalle apenas se emite (por defecto sí). */
  printOnEmit?: boolean;
  /** Imprimir las comandas apenas se envían a cocina y barra. */
  printOnSend?: boolean;
  /** Última actualización de carta aplicada (ver menu2.ts). */
  menuVersion?: number;
  /** Sabores de helado disponibles hoy. Cualquiera los agrega o quita cuando se acaban. */
  iceCreamFlavors?: string[];
}

export interface AuditEntry {
  id: string;
  action: string;
  detail: string;
  at: string;
  /** Quién lo hizo. */
  by?: string;
}

/** Marca de anulación: nada se borra, se anula con motivo y responsable. */
export interface Voided {
  at: string;
  by: string;
  reason: string;
}

export type Role = 'admin' | 'trabajador';
export interface Staff {
  id: string;
  name: string;
  role: Role;
  /** Solo administración entra con PIN. */
  pin?: string;
  active: boolean;
}

export interface Expense {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  description: string;
  category: string;
  amount: number;
  /** Método de pago según el Excel del contador. */
  method: string;
  fund: Fund;
  docType: string;
  docNumber?: string;
  /** Foto de la boleta o factura: clave en el almacén de fotos. */
  photo?: string;
  notes: string;
  createdAt: string;
  by: string;
  voided?: Voided;
}

export type MovementKind = 'prestamo_recibido' | 'pago_prestamo' | 'prestamo_entregado' | 'cobro_prestamo' | 'aporte' | 'retiro' | 'traspaso' | 'ajuste';
export const MOVEMENT_LABEL: Record<MovementKind, string> = {
  prestamo_recibido: 'Préstamo recibido',
  pago_prestamo: 'Pago de préstamo recibido',
  prestamo_entregado: 'Préstamo entregado',
  cobro_prestamo: 'Devolución de préstamo entregado',
  aporte: 'Aporte de capital',
  retiro: 'Retiro de socios',
  traspaso: 'Traspaso entre fondos',
  ajuste: 'Ajuste por cuadratura',
};

/** Movimientos de dinero que no son ventas ni gastos operacionales. */
export interface Movement {
  id: string;
  date: string;
  kind: MovementKind;
  /** Siempre positivo, salvo en ajustes (puede ser negativo). */
  amount: number;
  fund: Fund;
  /** Traspasos: fondo de destino. */
  toFund?: Fund;
  /** Quién prestó o a quién se le prestó. */
  counterpart?: string;
  description: string;
  createdAt: string;
  by: string;
  voided?: Voided;
}

/** Bloques de propinas: lunes a viernes y fin de semana. */
export type TipBucket = 'lv' | 'sd';
export const TIP_BUCKET_LABEL: Record<TipBucket, string> = { lv: 'Lunes a viernes', sd: 'Sábado y domingo' };

export interface TipPayout {
  id: string;
  date: string;
  amount: number;
  fund: Fund;
  bucket: TipBucket;
  /** Lunes de la semana a la que corresponden las propinas (YYYY-MM-DD). */
  week: string;
  note: string;
  createdAt: string;
  by: string;
  voided?: Voided;
}

/** Plata apartada para compromisos (arriendo, sueldos…). No se gasta, pero sigue en los fondos. */
export interface Reserve {
  id: string;
  name: string;
  amount: number;
}

/** Cuadratura: lo que realmente hay contra lo que el sistema espera. */
export interface CashCount {
  id: string;
  at: string;
  by: string;
  realCash: number;
  realBank: number;
  expectedCash: number;
  expectedBank: number;
  pendingMp: number;
  note: string;
  /** Diferencia revisada pero aún por conciliar (se muestra en amarillo). */
  pendingReconcile?: boolean;
}

/** Resumen guardado al cerrar un turno. */
export interface ShiftClose {
  id: string;
  day: string;
  turno: Turno;
  closedAt: string;
  by: string;
  report: ShiftReport;
  countedCash?: number;
  note: string;
}

export interface ShiftReport {
  sales: number;
  subtotal: number;
  discounts: number;
  consumo: number;
  /** Propinas cobradas (de las meseras, no de la cafetería). */
  tips: number;
  /** Comisión que se descuenta de las propinas (si está activado). */
  tipFees?: number;
  /** Comisiones que paga la cafetería (sin la parte de la propina). */
  fees: number;
  net: number;
  /** amount incluye la propina; amount − tip = venta de la cafetería. */
  byMethod: { method: PayMethod; count: number; amount: number; tip: number; fee: number }[];
  expenses: { fund: Fund; amount: number; count: number }[];
  tipPayouts: number;
  movementsIn: number;
  movementsOut: number;
  cashStart: number;
  cashEnd: number;
  bankEnd: number;
  pendingMp: number;
  pendingTransfers: number;
  pendingAccounts: number;
}

/** Fila del Excel del contador (importada o generada). */
export interface LedgerRow {
  id: string;
  date: string;
  tipo: string;
  description: string;
  category: string;
  method: string;
  income: number;
  expense: number;
  doc: string;
  notes: string;
}

export interface AppState {
  version: 3;
  categories: Category[];
  products: Product[];
  promotions: Promotion[];
  tables: TableDef[];
  accounts: Account[];
  comandas: Comanda[];
  settings: Settings;
  staff: Staff[];
  expenses: Expense[];
  movements: Movement[];
  tipPayouts: TipPayout[];
  reserves: Reserve[];
  counts: CashCount[];
  closes: ShiftClose[];
  /** Historial importado del Excel del contador (antes de usar la app). */
  ledgerHistory: LedgerRow[];
  audit: AuditEntry[];
  nextAccount: number;
  nextComanda: number;
  nextFolio: number;
}
