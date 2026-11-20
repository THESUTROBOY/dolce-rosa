import type { PayMethod } from './types';

/** Categorías exactas del Excel del contador «Control Gastos JJA SPA». */
export const EXPENSE_CATEGORIES = [
  'Costo Fijo - Arriendo y Servicios',
  'Costo Fijo - Sueldos y Honorarios',
  'Costo Fijo - Software y Suscripciones',
  'Costo Variable - Mercadería e Insumos',
  'Costo Variable - Envases y Despachos',
  'Costo Variable - Marketing y Publicidad',
  'Costo Variable - Comisiones e Impuestos',
  'Gasto Extraordinario - Mantención y Otros',
];

/** Provisorios hasta tener el Excel del contador: se editan en Ajustes. */
export const EXPENSE_METHODS = ['Efectivo', 'Transferencia', 'Débito', 'Crédito'];
export const DOC_TYPES = ['Boleta', 'Factura', 'Comprobante de transferencia', 'Sin documento'];

/** Comisiones de Mercado Pago en %, IVA incluido. Provisorias: se ajustan en Ajustes. */
export const DEFAULT_FEES: Record<PayMethod, number> = { efectivo: 0, debito: 1.9, credito: 3.4, transferencia: 0 };
export const DEFAULT_SETTLE_DAYS: Record<PayMethod, number> = { efectivo: 0, debito: 1, credito: 1, transferencia: 0 };

export type CostGroup = 'fijo' | 'variable' | 'extraordinario';
export const COST_GROUP_LABEL: Record<CostGroup, string> = { fijo: 'Costos fijos', variable: 'Costos variables', extraordinario: 'Gastos extraordinarios' };
export function costGroup(category: string): CostGroup {
  const c = category.toLowerCase();
  if (c.startsWith('costo fijo')) return 'fijo';
  if (c.startsWith('costo variable')) return 'variable';
  return 'extraordinario';
}
