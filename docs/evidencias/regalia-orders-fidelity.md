# REGALÍA — Fidelidad Visual de Pedidos y Comprobantes (T4)

**Referencia:** T4, S1-S4, S11-S12
**Bocetos aprobados de referencia:**
- `../backend/design/regalia-dual-theme/08-result.html`
- `../backend/design/regalia-dual-theme/09-orders.html`
- `../backend/design/regalia-dual-theme/10-order-detail.html`
**Superficies de edición autorizadas:**
- `src/features/shop/orders/OrderPages.tsx`
- `src/features/shop/orders/OrderPages.test.tsx`
- `src/features/shop/orders/OrderAmounts.tsx`
- `src/features/shop/orders/orders-presentation.css`
- `docs/evidencias/regalia-orders-fidelity.md`

---

## 1. Lista de Verificación Antes / Después

| Elemento | Estado Anterior (T4 preliminar) | Estado Actual (Fidelidad Corregida) | Boceto Aprobado |
|---|---|---|---|
| **Fila de pedido en historial** | Múltiples enlaces internos (`Ver detalle`, `Comprobante`, número e imagen separados) en cuadrícula dispersa. | Un único `<Link>` nativo que envuelve toda la fila (`.order`), sin enlaces internos duplicados. Estructura unificada en 5 columnas: Imagen (88px) + Info (identificador, fecha, conteo de ítems) + Estado (insignia con icono SVG local) + Total tabular (USD) + Flecha (`→`). | `09-orders.html` (`.orders .order`) |
| **Filtro de estado** | Bloque vertical solitario sin botón de reinicio compacto. | Barra de filtro horizontal (`.filter-bar`) con etiqueta, selector de estado y botón compacto «Limpiar filtros» que restablece a todos los estados y reinicia a página 1. Mantiene integración real con backend paginado. | `09-orders.html` (`.filter-bar`) |
| **Barra de resultados** | Sin encabezado con conteo y orden. | Encabezado dinámico con estado aria-live (`X pedidos`) y leyenda informativa «Más recientes primero». | `09-orders.html` (`.results-bar`) |
| **Banner de entrega en detalle** | Inexistente; solo lista genérica de hechos. | Banner destacado (`.delivery-banner`) con icono SVG de entrega, fecha real de entrega programada (`scheduledDeliveryDate`) con formato de Ecuador y nota horaria sin inventar ventanas horarias falsas. | `10-order-detail.html` (`.delivery-banner`) |
| **Datos de entrega en detalle y confirmación** | Lista de definición plana exponiendo coordenadas lat/lng en primer plano. | Columnas amigables para el cliente (`.delivery-info`): «Para quién» (nombre y teléfono) y «Dónde» (dirección, zona y notas). Coordenadas lat/lng removidas de la vista primaria y resguardadas bajo `<details class="delivery-coordinates-disclosure">` sin exponer secretos. | `10-order-detail.html` y `08-result.html` (`.delivery-info`) |
| **Recorrido del pedido** | Lista sin numeración de hitos. | Línea de tiempo (`.timeline`) con marcadores continuos y verificación únicamente sobre eventos persistidos reales del backend; sin eventos inventados ni mapas de rastreo GPS simulados. | `10-order-detail.html` (`.timeline`) |
| **Confirmación de compra** | Agrupación plana sin jerarquía de resultado. | Jerarquía visual aprobada: marca circular con SVG (`.status-art`), cintillo superior (`.eyebrow`), título principal, copy explicativo, bloque de referencias (`.sample-refs`), hechos de entrega en 2 columnas y botones de acción unificados (`.confirmation-actions`). | `08-result.html` (`.result`) |
| **Iconografía** | Emojis en algunos textos. | Iconos SVG locales y limpios (`CheckIcon`, `DeliveryVanIcon`, `OrderStatusIcon`, `ArrowRightIcon`) sin dependencias externas. | Bocetos 08, 09, 10 |
| **Impresión de comprobante** | Variables de color oscuro en tema vino podían afectar la legibilidad al imprimir. | Corrección de tokens de impresión en `@media print`: sobrescribe paleta a fondo blanco (#fff) e impresiones legibles (#234D3E, #4F6257, #D7DDD7), oculta controles `.no-print` y despliega la tabla de compras sin quiebres de página incómodos. | `10-order-detail.html` (`@media print`) |
| **Adaptabilidad móvil** | Tablas y filas colapsaban de forma desigual. | Reglas responsivas a 1050px, 760px, 520px y 360px. En móviles la fila de pedido se reorganiza a 3 celdas (imagen, datos y estado/importe en segunda fila; flecha oculta); en comprobante las celdas se presentan con `data-label`. | Bocetos 08, 09, 10 (`@media`) |

---

## 2. Disciplina de Pruebas (ODD / TDD)

### Fase RED (Observada)
Comando ejecutado:
```bash
PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=error pnpm exec vitest run src/features/shop/orders/OrderPages.test.tsx
```
**Resultado:** Fallo observado con código de salida 1 (5 pruebas fallidas):
- Fila no unificada como enlace nativo sin duplicados.
- Ausencia del botón «Limpiar filtros» en el filtro horizontal.
- Textos de estado vacío y banners no coincidentes.
- Ausencia de encabezados «Para quién» y «Dónde» en detalle.

### Fase GREEN (Observada)
Comando ejecutado:
```bash
PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=error pnpm exec vitest run src/features/shop/orders/OrderPages.test.tsx
```
**Resultado:** Código de salida 0.
**Pruebas:** 14 pasadas de 14 (1.81s).

Comprobación complementaria de servicio:
```bash
PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=error pnpm exec vitest run src/features/shop/orders/customerOrdersService.test.ts
```
**Resultado:** Código de salida 0.
**Pruebas:** 2 pasadas de 2 (0.64s).

### Verificación de Tipos (TypeScript noEmit)
Comando ejecutado:
```bash
pnpm exec tsc --noEmit
```
**Resultado:** Código de salida 0, 0 errores emitidos.

---

## 3. Estado de Evidencia Visual y Límites

- **Verificación en código y pruebas unitarias:** Completa y verificada con comandos reproducibles en primer plano.
- **Pruebas visuales en navegador (screenshots):** No ejecutadas directamente por este agente especializado; el orquestador principal administra las capturas en navegador Chromium/BrowserOS.
- **Archivos compartidos:** No se modificaron `src/styles/shop.css` ni `ShopLayout.tsx`. Todas las clases y estilos están encapsulados bajo `.shop .order-page`, `.shop .order-history-page`, `.shop .order-detail-page` y `.shop .order-receipt-page`.
- **Integridad de contratos:** No se alteraron los tipos, servicios, parámetros ni rutas existentes. La paginación y el filtrado por estado persisten contra el backend real.
