import { DEFAULT_FEES, DEFAULT_SETTLE_DAYS, DOC_TYPES, EXPENSE_CATEGORIES, EXPENSE_METHODS } from './defaults';
import { applyMenu2 } from './menu2';
import type { AppState, Category, ChoiceGroup, Option, Product } from './types';

/** Carta oficial de Dolce Rosa (PDF de mayo 2026) y configuración inicial. */
export function seedState(): AppState {
  let n = 0;
  const id = (p: string) => `${p}_seed_${++n}`;
  const cat = (name: string, station: Category['station'], sort: number): Category => ({ id: id('cat'), name, station, sort });
  const cats = [
    cat('Cafetería caliente', 'barra', 0),
    cat('Cafetería fría', 'barra', 1),
    cat('Bebestibles', 'barra', 2),
    cat('Tortas', 'barra', 3),
    cat('Pastelería', 'barra', 4),
    cat('Pastelería saludable', 'barra', 5),
    cat('Helados', 'barra', 6),
    cat('Desayunos', 'cocina', 7),
    cat('Waffles', 'cocina', 8),
    cat('Celestinos', 'cocina', 9),
    cat('Fondue', 'cocina', 10),
    cat('Bocados salados', 'cocina', 11),
  ];
  const [caliente, fria, bebestibles, tortas, pasteleria, saludable, helados, desayunos, waffles, celestinos, fondue, salados] = cats;
  /** Extras de cafetería: $700 cada uno según la carta. */
  const cafeExtras: Option[] = [
    { name: 'Leche de almendras', price: 700 },
    { name: 'Syrup', price: 700 },
    { name: 'Crema chantilly', price: 700 },
  ];
  const helado: Option[] = [{ name: 'Bola de helado extra', price: 990 }];
  const salsa: ChoiceGroup = { name: 'Salsa', options: ['Chocolate', 'Caramelo', 'Frambuesa', 'Manjar'] };
  const topping: ChoiceGroup = { name: 'Topping', options: ['Chubi', 'Oreo', 'Malvas', 'Chips de colores'] };
  const crema: ChoiceGroup = { name: 'Crema', options: ['Con crema', 'Sin crema'] };
  const fruta: ChoiceGroup = { name: 'Fruta', options: ['Frutilla', 'Plátano'], multi: true };
  const waffle = [fruta, crema, salsa, topping];
  const desayunoBebida = (base: number): Option[] => ['Té negro', 'Cappuccino', 'Latte', 'Americano'].map((name) => ({ name, price: base }));
  const desmechado = (base: number): Option[] => [
    { name: 'Vacuno', price: base },
    { name: 'Pollo', price: base },
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
  const cafe = (categoryId: string, name: string, price: number, description = '') => p(categoryId, name, price, { description, extras: cafeExtras });
  const products: Product[] = [
    cafe(caliente.id, 'Espresso', 1990),
    cafe(caliente.id, 'Espresso doble', 2790),
    cafe(caliente.id, 'Americano', 2490),
    cafe(caliente.id, 'Americano doble', 2990),
    cafe(caliente.id, 'Cortado', 2990),
    cafe(caliente.id, 'Cortado doble', 3490),
    cafe(caliente.id, 'Cappuccino', 2990),
    cafe(caliente.id, 'Cappuccino variedades', 3490, 'Anotar el sabor en la nota'),
    cafe(caliente.id, 'Chai latte', 3690),
    cafe(caliente.id, 'Chocolate caliente', 3990),
    cafe(caliente.id, 'Latte', 3290),
    cafe(caliente.id, 'Latte variedades', 3790, 'Anotar el sabor en la nota'),
    cafe(caliente.id, 'Moka', 3490),
    cafe(fria.id, 'Affogato', 3990, 'Espresso diluido en helado de vainilla'),
    cafe(fria.id, 'Americano helado', 2990),
    cafe(fria.id, 'Café helado', 5990),
    cafe(fria.id, 'Ice latte', 3690),
    cafe(fria.id, 'Ice latte variedades', 3990, 'Anotar el sabor en la nota'),
    cafe(fria.id, 'Frappuccino', 5290),
    p(bebestibles.id, 'Agua mineral', 1200),
    p(bebestibles.id, 'Bebida', 2100),
    p(bebestibles.id, 'Jugo natural', 3490),
    p(bebestibles.id, 'Limonada', 3590),
    p(bebestibles.id, 'Smoothie', 3890),
    p(bebestibles.id, 'Té variedades', 1990, { description: 'Selección de tés clásicos y 500 ml de agua' }),
    p(tortas.id, 'Torta amor', 4490),
    p(tortas.id, 'Torta de yogurt', 3290),
    p(tortas.id, 'Torta del día', 4290),
    p(pasteleria.id, 'Cheesecake de frambuesa', 3890),
    p(pasteleria.id, 'Cheesecake de maracuyá', 3890),
    p(pasteleria.id, 'Cheesecake de ganache de chocolate', 3890),
    p(pasteleria.id, 'Kuchen de manzana', 3890),
    p(pasteleria.id, 'Kuchen de nuez', 3890),
    p(pasteleria.id, 'Pie de limón', 3890),
    p(pasteleria.id, 'Brazo de reina', 2490),
    p(pasteleria.id, 'Brownie', 3290),
    p(pasteleria.id, 'Brownie con helado', 4290, { scoops: 1 }),
    p(saludable.id, 'Chilenitos', 2000),
    p(saludable.id, 'Rollitos de canela', 2000),
    p(saludable.id, 'Mendocino', 2000),
    p(saludable.id, 'Cheesecake saludable', 4490),
    p(saludable.id, 'Kuchen saludable', 4490),
    p(helados.id, 'Copa simple', 3290, { description: 'Una bola de helado, crema chantilly, salsa y topping', scoops: 1, choices: [crema, salsa, topping] }),
    p(helados.id, 'Copa doble', 4290, { description: 'Dos bolas de helado, crema chantilly, salsa y topping', scoops: 2, choices: [crema, salsa, topping] }),
    p(desayunos.id, 'Energía dulce', 5890, { description: 'Té o café, pastel del día y jugo envasado', variants: desayunoBebida(5890) }),
    p(desayunos.id, 'Energía rosa', 6990, { description: 'Té o café, tostadas con palta y huevo y jugo envasado', variants: desayunoBebida(6990) }),
    p(desayunos.id, 'Energía encanto', 5290, { description: 'Té o café, aliado de jamón y queso y jugo envasado', variants: desayunoBebida(5290) }),
    p(waffles.id, 'Tentación', 5490, { description: 'Base de manjar, fruta, crema, salsa y topping', extras: helado, choices: waffle }),
    p(waffles.id, 'Encanto', 5990, { description: 'Base de nutella, fruta, crema, salsa y topping', extras: helado, choices: waffle }),
    p(waffles.id, 'Amore', 6990, { description: 'Base de manjar, fruta, dos bolas de helado, crema, salsa y topping', extras: helado, choices: waffle, scoops: 2 }),
    p(waffles.id, 'Dolce', 7990, { description: 'Base de nutella, fruta, dos bolas de helado, crema, salsa y topping', extras: helado, choices: waffle, scoops: 2 }),
    p(celestinos.id, 'Celestino rosa', 5490, { description: 'Relleno de manjar, una bola de helado, fruta, salsa y crema', choices: [fruta, crema, salsa], scoops: 1 }),
    p(celestinos.id, 'Celestino dolce', 5990, { description: 'Relleno de nutella, una bola de helado, fruta, salsa y crema', choices: [fruta, crema, salsa], scoops: 1 }),
    p(fondue.id, 'Fondue', 15990, {
      description: 'Chocolate derretido, waffle, fruta y malvaviscos',
      extras: [
        { name: 'Fruta', price: 2490 },
        { name: 'Waffles', price: 2490 },
        { name: 'Chocolate', price: 1990 },
        { name: 'Manjar', price: 1490 },
      ],
    }),
    p(salados.id, 'Amanecer napolitano', 6990, { description: 'Pan Selezione, queso, orégano, tomate y aceituna' }),
    p(salados.id, 'Huerto pesto', 7990, { description: 'Pan Selezione, pesto, aceitunas, quesillo, tomate y rúcula' }),
    p(salados.id, 'Jamón serrano bouquet', 7990, { description: 'Pan Selezione, pasta de aceitunas, pesto, jamón serrano y rúcula' }),
    p(salados.id, 'Atardecer huevo', 3990, { description: 'Pan Selezione, dos huevos y palta' }),
    p(salados.id, 'Atardecer fresco', 3990, { description: 'Pan Selezione, quesillo y palta' }),
    p(salados.id, 'Amanecer italiano', 8490, { description: 'Pan Selezione, desmechado 120 g, palta y tomate', variants: desmechado(8490) }),
    p(salados.id, 'Amanecer luco', 7490, { description: 'Pan Selezione, desmechado 120 g y queso', variants: desmechado(7490) }),
    p(salados.id, 'Amanecer texano', 8990, { description: 'Pan Selezione, desmechado 120 g, cheddar, cebolla morada y pepinillos, con ketchup y mostaza', variants: desmechado(8990) }),
    p(salados.id, 'Selladito', 2990, { description: 'Pan de miga, jamón y queso' }),
  ];
  const state: AppState = {
    version: 3,
    categories: cats,
    products,
    tables: [
      ...Array.from({ length: 8 }, (_, i) => ({ id: id('mesa'), name: `Mesa ${i + 1}` })),
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
      fees: { ...DEFAULT_FEES },
      settleDays: { ...DEFAULT_SETTLE_DAYS },
      openingCash: 0,
      openingBank: 0,
      openingDate: '',
      expenseCategories: [...EXPENSE_CATEGORIES],
      expenseMethods: [...EXPENSE_METHODS],
      docTypes: [...DOC_TYPES],
      afternoonStartsAt: 15,
      adminPin: '0310',
      printOnEmit: true,
      iceCreamFlavors: ['Vainilla', 'Chocolate', 'Frutilla', 'Lúcuma', 'Manjar', 'Menta chip'],
    },
    promotions: [],
    staff: [{ id: 'staff_admin', name: 'Administración', role: 'admin', pin: '0310', active: true }],
    expenses: [],
    movements: [],
    tipPayouts: [],
    reserves: [],
    counts: [],
    closes: [],
    ledgerHistory: [],
    audit: [],
    nextAccount: 1,
    nextComanda: 1,
    nextFolio: 1,
  };
  applyMenu2(state);
  return state;
}
