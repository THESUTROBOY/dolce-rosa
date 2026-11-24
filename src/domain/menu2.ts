import type { AppState, Category, Option, Product } from './types';

/** Versión de la carta que ya está aplicada. */
export const MENU_VERSION = 2;

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/**
 * Actualización de carta de noviembre 2026: precios nuevos, matcha, Texas Cookies, croissant,
 * extra descafeinado y la categoría Almuerzos. Usa ids fijos para que todos los equipos
 * sincronizados creen los mismos productos y no se dupliquen.
 */
export function applyMenu2(s: AppState) {
  if ((s.settings.menuVersion ?? 1) >= 2) return;
  const byName = (name: string) => s.products.find((p) => norm(p.name) === norm(name));
  const catByName = (name: string) => s.categories.find((c) => norm(c.name) === norm(name));
  const catOrFirst = (name: string, station: Category['station']) => catByName(name) ?? s.categories.find((c) => c.station === station) ?? s.categories[0];
  const cafeCats = [catByName('Cafetería caliente'), catByName('Cafetería fría')].filter(Boolean).map((c) => c!.id);
  const cafeExtras = (): Option[] => [
    { name: 'Leche de almendras', price: 700 },
    { name: 'Syrup', price: 700 },
    { name: 'Crema chantilly', price: 700 },
    { name: 'Café descafeinado', price: 700 },
  ];

  const upsert = (id: string, categoryId: string, name: string, price: number, more: Partial<Product> = {}) => {
    const p = byName(name);
    if (p) {
      p.price = price;
      return p;
    }
    const np: Product = { id, categoryId, name, description: '', price, variants: [], extras: [], soldOut: false, archived: false, ...more };
    s.products.push(np);
    return np;
  };

  // Precios actualizados.
  for (const [name, price] of [
    ['Moka', 3790],
    ['Brownie', 2990],
    ['Brownie con helado', 4490],
  ] as const) {
    const p = byName(name);
    if (p) p.price = price;
  }

  // Productos nuevos (o precio nuevo si ya estaban).
  upsert('prod_m2_matcha', catOrFirst('Cafetería caliente', 'barra').id, 'Matcha Latte', 4190, { extras: cafeExtras() });
  upsert('prod_m2_icematcha', catOrFirst('Cafetería fría', 'barra').id, 'Ice Matcha Latte', 4790, { extras: cafeExtras() });
  const past = catOrFirst('Pastelería', 'barra').id;
  upsert('prod_m2_texas', past, 'Texas Cookie', 3890);
  upsert('prod_m2_texas4', past, 'Caja de 4 Texas Cookies', 13990);
  upsert('prod_m2_croissant', past, 'Croissant relleno', 4490);

  // Extra café descafeinado $700 en toda la cafetería.
  for (const p of s.products) {
    if (!cafeCats.includes(p.categoryId)) continue;
    const d = p.extras.find((e) => norm(e.name).includes('descafeinado'));
    if (d) d.price = 700;
    else p.extras.push({ name: 'Café descafeinado', price: 700 });
  }

  // Almuerzos: quedan "no disponibles" hasta cargar precio, descripción y extras.
  let alm = catByName('Almuerzos');
  if (!alm) {
    alm = { id: 'cat_m2_almuerzos', name: 'Almuerzos', station: 'cocina', sort: Math.max(0, ...s.categories.map((c) => c.sort)) + 1 };
    s.categories.push(alm);
  }
  const lunches: [string, string][] = [
    ['prod_m2_magnolia', 'Bowl Magnolia'],
    ['prod_m2_hortensia', 'Bowl Hortensia'],
    ['prod_m2_margarita', 'Bowl Margarita'],
    ['prod_m2_orquidea', 'Bowl Orquídea'],
    ['prod_m2_sakura', 'Gohan Sakura'],
  ];
  for (const [id, name] of lunches) {
    if (byName(name)) continue;
    s.products.push({ id, categoryId: alm.id, name, description: '', price: 0, variants: [], extras: [], soldOut: true, archived: false });
  }
  s.settings.menuVersion = MENU_VERSION;
}
