import type { AppState, Category, Option, Product } from './types';

/** Carta base de ejemplo (precios inventados) y configuración inicial. */
export function seedState(): AppState {
  let n = 0;
  const id = (p: string) => `${p}_seed_${++n}`;
  const cat = (name: string, station: Category['station'], sort: number): Category => ({ id: id('cat'), name, station, sort });
  const cats = [
    cat('Cafés', 'barra', 0),
    cat('Frappés y fríos', 'barra', 1),
    cat('Tés y jugos', 'barra', 2),
    cat('Tortas y pasteles', 'barra', 3),
    cat('Waffles y dulces', 'cocina', 4),
    cat('Salados', 'cocina', 5),
  ];
  const [cafes, frios, tes, tortas, waffles, salados] = cats;
  const milk: Option[] = [
    { name: 'Leche sin lactosa', price: 300 },
    { name: 'Leche vegetal (avena)', price: 600 },
    { name: 'Leche vegetal (almendra)', price: 600 },
    { name: 'Shot extra de espresso', price: 700 },
  ];
  const syrups: Option[] = [
    { name: 'Jarabe de vainilla', price: 500 },
    { name: 'Jarabe de caramelo', price: 500 },
  ];
  const sizes = (m: number, g: number): Option[] => [
    { name: 'Mediano', price: m },
    { name: 'Grande', price: g },
  ];
  const p = (categoryId: string, name: string, price: number, more: Partial<Product> = {}): Product => ({
    id: id('prod'),
    categoryId,
    name,
    description: '',
    price,
    variants: [],
    extras: [],
    soldOut: false,
    archived: false,
    ...more,
  });
  const products: Product[] = [
    p(cafes.id, 'Espresso', 1800, { extras: [milk[3]] }),
    p(cafes.id, 'Americano', 2200, { variants: sizes(2200, 2700), extras: milk }),
    p(cafes.id, 'Cappuccino', 2900, { variants: sizes(2900, 3400), extras: [...milk, ...syrups] }),
    p(cafes.id, 'Latte', 2900, { variants: sizes(2900, 3400), extras: [...milk, ...syrups] }),
    p(cafes.id, 'Mokaccino', 3300, { variants: sizes(3300, 3800), extras: [...milk, { name: 'Crema', price: 500 }] }),
    p(cafes.id, 'Latte rosa (frutilla)', 3600, { description: 'La especialidad de la casa', variants: sizes(3600, 4100), extras: milk.slice(0, 3) }),
    p(frios.id, 'Frappé moka', 3900, { extras: [{ name: 'Crema', price: 500 }, milk[1]] }),
    p(frios.id, 'Frappé frutilla', 3900, { extras: [{ name: 'Crema', price: 500 }, milk[1]] }),
    p(frios.id, 'Iced latte', 3400, { extras: [...milk, ...syrups] }),
    p(tes.id, 'Té o infusión', 1900),
    p(tes.id, 'Jugo natural', 2900, { variants: [{ name: 'Frutilla', price: 2900 }, { name: 'Naranja', price: 2900 }, { name: 'Mango', price: 3100 }] }),
    p(tes.id, 'Agua mineral', 1500, { variants: [{ name: 'Con gas', price: 1500 }, { name: 'Sin gas', price: 1500 }] }),
    p(tortas.id, 'Torta tres leches', 3500),
    p(tortas.id, 'Pie de limón', 3200),
    p(tortas.id, 'Cheesecake frambuesa', 3800),
    p(tortas.id, 'Kuchen de nuez', 3000),
    p(waffles.id, 'Waffle Nutella y frutillas', 4800, { extras: [{ name: 'Helado', price: 900 }, { name: 'Crema', price: 500 }] }),
    p(waffles.id, 'Waffle manjar plátano', 4500, { extras: [{ name: 'Helado', price: 900 }, { name: 'Crema', price: 500 }] }),
    p(waffles.id, 'Panqueques con manjar', 3900, { extras: [{ name: 'Helado', price: 900 }] }),
    p(salados.id, 'Tostado palta', 3600, { extras: [{ name: 'Huevo', price: 700 }, { name: 'Pan sin gluten', price: 900 }] }),
    p(salados.id, 'Barros Luco', 5900, { extras: [{ name: 'Palta', price: 900 }] }),
    p(salados.id, 'Croissant jamón queso', 3900),
    p(salados.id, 'Huevos revueltos', 3400, { extras: [{ name: 'Tocino', price: 900 }, { name: 'Palta', price: 900 }] }),
  ];
  return {
    version: 2,
    categories: cats,
    products,
    tables: [
      ...Array.from({ length: 8 }, (_, i) => ({ id: id('mesa'), name: `Mesa ${i + 1}` })),
      { id: id('mesa'), name: 'Terraza 1' },
      { id: id('mesa'), name: 'Terraza 2' },
      { id: id('mesa'), name: 'Barra' },
      { id: id('mesa'), name: 'Para llevar' },
    ],
    accounts: [],
    comandas: [],
    settings: {
      businessName: 'Dolce Rosa',
      address: '',
      phone: '',
      footer: 'Detalle de cuenta. No es boleta. La propina es voluntaria.',
      tipPercent: 10,
      paymentMethods: ['Efectivo', 'Débito', 'Crédito', 'Transferencia'],
      afternoonStartsAt: 15,
      adminPin: '1234',
    },
    audit: [],
    nextAccount: 1,
    nextComanda: 1,
  };
}
