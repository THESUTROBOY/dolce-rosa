# Dolce Rosa · Caja

App web de ventas para la cafetería Dolce Rosa: pedidos para mesa o para llevar, cobro, cierre de caja, reportes y comprobantes de 80 mm.

## Cómo correrla

```bash
npm install
npm run dev      # desarrollo en http://localhost:5173
npm test         # pruebas de cálculos y flujo de caja
npm run build    # genera dist/ para publicar como sitio estático
```

PIN de prueba: administración `1234`, caja `0000` (cámbialos en Ajustes).

## Qué incluye (v1)

- **Vender**: carta por categorías, variantes (tamaños) y extras con precio, notas por producto ("sin azúcar"), descuento por % o monto, comanda (solo productos nuevos), precuenta con propina sugerida.
- **Cobrar**: efectivo con vuelto y redondeo a la decena (ley de redondeo), tarjeta, transferencia, pago dividido, propina voluntaria registrada aparte de la venta.
- **Pedidos**: mapa de mesas, pedidos abiertos con estado (pendiente, listo, entregado), búsqueda por número, mesa o cliente, reimpresión registrada, anulación con motivo (solo administración).
- **Caja**: apertura con efectivo inicial, ingresos y retiros con motivo, cierre con efectivo contado vs esperado, historial e impresión del cierre.
- **Reportes**: hoy, semana, mes o rango; total, neto, IVA, ticket promedio, propinas, descuentos, anulaciones, ranking de productos, por categoría, medio de pago y usuario; exportación CSV (abre en Excel).
- **Carta y ajustes**: productos, precios (con historial), agotados, archivado, mesas, usuarios con PIN y rol, medios de pago, datos del comprobante, respaldo/restauración.

## Importante

- El comprobante **no es boleta electrónica**. El local debe seguir emitiendo boletas por su vía actual hasta integrar un proveedor autorizado por el SII.
- Esta versión guarda los datos **en el navegador del equipo** (sirve para probar en un solo computador). El siguiente paso es conectar Supabase para tener base de datos en la nube, varios equipos a la vez y respaldos automáticos.
- La impresión usa el diálogo del navegador con papel de 80 mm. La impresión directa a la Bixolon (sin diálogo y con apertura de cajón) depende del modelo y la conexión.

## Estructura

- `src/domain/`: tipos, cálculos (`calc.ts`), reglas de negocio (`store.ts`) y pruebas. No depende de React.
- `src/ui/`: pantallas.
- `src/print.ts`: plantillas de comprobante, precuenta, comanda y cierre de caja.
