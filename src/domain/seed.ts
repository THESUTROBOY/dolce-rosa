import type { AppState, Product } from './types';

let n = 0;
const sid = (p: string) => `${p}_seed_${++n}`;

export function seedState(): AppState {
  n = 0;
  const cats = ['Cafés', 'Frappuccinos', 'Waffles', 'Tortas y pasteles', 'Bebidas'].map((name, i) => ({
    id: sid('cat'),
    name,
    sort: i,
  }));
  const [cafes, frapps, waffles, tortas, bebidas] = cats;
  const milk = [
    { name: 'Leche sin lactosa', price: 300 },
    { name: 'Leche vegetal', price: 600 },
    { name: 'Shot extra', price: 700 },
  ];
  const p = (categoryId: string, name: string, price: number, extra: Partial<Product> = {}): Product => ({
    id: sid('prod'),
    categoryId,
    name,
    price,
    variants: [],
    extras: [],
    soldOut: false,
    archived: false,
    ...extra,
  });
  const sizes = (a: number, b: number) => [
    { name: 'Mediano', price: a },
    { name: 'Grande', price: b },
  ];
  const products: Product[] = [
    p(cafes.id, 'Espresso', 1800, { extras: [milk[2]] }),
    p(cafes.id, 'Americano', 2200, { variants: sizes(2200, 2700), extras: milk }),
    p(cafes.id, 'Cappuccino', 2900, { variants: sizes(2900, 3400), extras: milk }),
    p(cafes.id, 'Latte', 2900, { variants: sizes(2900, 3400), extras: [...milk, { name: 'Jarabe vainilla', price: 500 }] }),
    p(cafes.id, 'Mokaccino', 3300, { variants: sizes(3300, 3800), extras: milk }),
    p(frapps.id, 'Frappuccino moka', 3900, { extras: [{ name: 'Crema', price: 500 }] }),
    p(frapps.id, 'Frappuccino frutilla', 3900, { extras: [{ name: 'Crema', price: 500 }] }),
    p(waffles.id, 'Waffle Nutella', 4500, { extras: [{ name: 'Helado', price: 900 }, { name: 'Frutillas', price: 800 }] }),
    p(waffles.id, 'Waffle manjar plátano', 4300, { extras: [{ name: 'Helado', price: 900 }] }),
    p(tortas.id, 'Torta tres leches', 3500),
    p(tortas.id, 'Pie de limón', 3200),
    p(tortas.id, 'Cheesecake frambuesa', 3800),
    p(bebidas.id, 'Agua mineral', 1500),
    p(bebidas.id, 'Jugo natural', 2800),
  ];
  return {
    version: 1,
    users: [
      { id: sid('user'), name: 'Administración', role: 'admin', pin: '1234', active: true },
      { id: sid('user'), name: 'Caja', role: 'cajero', pin: '0000', active: true },
    ],
    categories: cats,
    products,
    priceChanges: [],
    tables: Array.from({ length: 8 }, (_, i) => ({ id: sid('mesa'), name: `Mesa ${i + 1}` })),
    orders: [],
    shifts: [],
    settings: {
      businessName: 'Dolce Rosa',
      address: '',
      phone: '',
      receiptFooter: '¡Gracias por tu visita! Este comprobante no es boleta.',
      tipPercent: 10,
      paymentMethods: ['Efectivo', 'Tarjeta débito', 'Tarjeta crédito', 'Transferencia'],
    },
    audit: [],
    nextOrderNumber: 1,
  };
}
