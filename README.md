# Dolce Rosa

App web para la cafetería Dolce Rosa, pensada para el iPhone de los meseros, la tablet de cocina y el PC de administración.

## Cómo correrla

```bash
npm install
npm run dev      # desarrollo en http://localhost:5173
npm test         # pruebas del flujo de mesas, comandas y cobro
npm run build    # genera dist/ para publicar como sitio estático
```

PIN de administración de prueba: `1234` (se cambia en Configurar).

## Cómo se usa

- **Mesas** (inicio, sin login): el mesero toca una mesa, anota desde el menú con tamaño, extras, opciones (salsa, topping, crema, fruta, sabores de helado) y nota, y envía. El pedido se separa solo en **Cocina** y **Cafetería y preparados**.
- **Cocina** (sin PIN): las comandas cuelgan como papeles en un riel, primero la que más espera. Empezar → Marcar listo → Entregado.
- **Detalle de cuenta**: se emite e imprime antes del pago, con su ID correlativo y la propina sugerida. La mesa queda *por cobrar* hasta registrar el pago (propina, medio de pago, N° de boleta).
- **Cuentas**: detalles del turno para cuadrar con las boletas. Los trabajadores ven solo su turno de hoy (mañana / tarde); administración ve todo.
- **Configurar** (con PIN): reportes, menú, mesas, turnos, cobro, impresión y respaldo.

La app no emite boletas SII.

## Estado

Los datos se guardan en el navegador (localStorage). Para que varios aparatos compartan pedidos falta conectar una base de datos (Supabase).

## Publicar en Vercel

1. Entra a [vercel.com/new](https://vercel.com/new) con tu cuenta de GitHub e importa este repositorio.
2. Vercel detecta Vite solo: comando `npm run build`, carpeta `dist`.
3. Cada cambio que se suba a `main` se publica automáticamente.
