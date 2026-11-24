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
- **Cobro**: propina exacta del 10 % (redondeada al peso), otro monto o sin propina; pagos combinados (efectivo, débito, crédito, transferencia) con la propina repartida por medio de pago, comisión de Mercado Pago y vuelto.
- **Promociones y descuentos**: administración las crea; cualquiera las aplica en la cuenta. Descuentos manuales solo con PIN.
- **Gastos**: cualquiera anota un gasto con categoría del contador, método, fondo (caja o banco), documento y foto. Se descuenta del fondo.
- **Cierre de turno** (en Cuentas): ventas, propinas, comisiones, gastos, medios de pago y efectivo esperado del turno AM o PM. Los saldos pasan al turno siguiente.
- **Admin** (con PIN): Finanzas, Cuadratura (verde/rojo/amarillo), Cierres, Propinas (L–V y S–D, entregas), Reportes con gráficos, Excel del contador, Menú, Promociones, Mesas, Personas y registro de cambios, Ajustes y Datos.
- Quién atiende se elige en Mesas; queda registrado en cobros, gastos, cierres y en el registro de cambios.

La app no emite boletas SII.

## Datos y sincronización

Cada equipo guarda los datos en el navegador (IndexedDB). Para que celulares, tablets y computadores compartan todo:

1. Crear un proyecto en Supabase y correr `supabase/migrations/20261120_sync.sql`.
2. Crear un usuario (Authentication → Users) para el local.
3. Poner `VITE_SUPABASE_URL` y `VITE_SUPABASE_KEY` (clave publishable) en el workflow `.github/workflows/deploy-vercel.yml` (ya están las de Dolce Rosa), o pegarlas en Admin → Datos.
4. En cada equipo, iniciar sesión una vez con el usuario del local.

Sin internet la app sigue funcionando y sube los cambios al volver. Hay un respaldo completo diario en la nube (30 días) y se puede descargar un respaldo JSON en Admin → Datos.

## Excel del contador

Admin → Excel del contador agrega al archivo «Control Gastos JJA SPA» las ventas (sin propina, por día y medio de pago), las comisiones y los gastos, sin duplicar y sin tocar fórmulas ni otras hojas. También importa el historial anterior para los reportes.

## Publicar en Vercel

1. Entra a [vercel.com/new](https://vercel.com/new) con tu cuenta de GitHub e importa este repositorio.
2. Vercel detecta Vite solo: comando `npm run build`, carpeta `dist`.
3. Cada cambio que se suba a `main` se publica automáticamente.
