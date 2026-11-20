import { describe, expect, it } from 'vitest';
import { applyMenu2 } from './menu2';
import { seedState } from './seed';

describe('carta noviembre 2026', () => {
  it('actualiza precios, agrega productos y no duplica al aplicarse de nuevo', () => {
    const s = seedState();
    const price = (n: string) => s.products.find((p) => p.name === n)?.price;
    expect(price('Moka')).toBe(3790);
    expect(price('Matcha Latte')).toBe(4190);
    expect(price('Ice Matcha Latte')).toBe(4790);
    expect(price('Brownie')).toBe(2990);
    expect(price('Brownie con helado')).toBe(4490);
    expect(price('Texas Cookie')).toBe(3890);
    expect(price('Caja de 4 Texas Cookies')).toBe(13990);
    expect(price('Croissant relleno')).toBe(4490);
    expect(s.products.find((p) => p.name === 'Latte')!.extras).toContainEqual({ name: 'Café descafeinado', price: 700 });
    expect(s.products.filter((p) => /Bowl|Gohan Sakura/.test(p.name))).toHaveLength(5);
    const n = s.products.length;
    // Un equipo con la carta anterior también la recibe, y aplicarla dos veces no duplica nada.
    s.settings.menuVersion = 1;
    applyMenu2(s);
    expect(s.products.length).toBe(n);
    expect(s.products.find((p) => p.name === 'Latte')!.extras.filter((e) => e.name === 'Café descafeinado')).toHaveLength(1);
  });
});
