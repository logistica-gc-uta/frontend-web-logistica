# Evidencia · Issue #39 (parte 1) — Pérdida, reemplazo y recuperación tardía

Primera parte de la #39, con **backend #52**. El ADMIN declara la pérdida de **una unidad** de un producto del pedido,
prepara su reemplazo (ahora o cuando haya stock) y registra después si el original apareció **vendible** o
**dañado**. El reemplazo y el original se siguen por separado y el stock que se muestra es siempre el que devuelve el
servidor. La parte de **emergencia de ruta, custodia y retorno individual** espera **backend #51**, que sigue abierta.

- **Issue:** [#39](https://github.com/logistica-gc-uta/frontend-web-logistica/issues/39)
- **Fecha de ejecución:** 13/11/2026
- **Backend:** `logistica-gc-uta/backend` en `main` @ `1d28895` (incluye #52, `docs/issue-52-loss-replacement-recovery.md`,
  migración `20261113T1535_order_item_loss_replacement_recovery`)
- **Frontend:** rama `feat/39-perdida-reemplazo` (desde `main` @ `0be47af`)
- **Entorno:** Node 26.7.0, pnpm 12.4.2, Vitest 5.0.3, PostgreSQL 16 local (Docker)

## 1. Contrato usado (backend #52)

| Llamada                                                                                                    | Uso en la web                                                                                                             |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `GET /dispatch/orders/:id/losses`                                                                          | Pérdidas del pedido con `replacement`, `original` y `movements` (con `stockAfter`).                                       |
| `POST /dispatch/interventions` `LOSS_DECLARE`                                                              | `orderId`, `orderItemId`, `unitNumber` (si el ítem tiene varias unidades), `attemptId` (si viene de una entrega fallida). |
| `POST /dispatch/interventions` `REPLACEMENT_PREPARE`                                                       | `lossId`; sin stock libre → 409 `NO_FREE_STOCK` y no cambia nada.                                                         |
| `POST /dispatch/interventions` `ORIGINAL_RECOVER`                                                          | `lossId`, `recoveryCondition` `SELLABLE` (suma 1, una sola vez) o `DAMAGED` (no suma).                                    |
| `GET /orders/:id`                                                                                          | Ítems del pedido (id, producto, cantidad) para elegir qué unidad se perdió.                                               |
| 409 `LOSS_ALREADY_DECLARED`, `NO_FREE_STOCK`, `REPLACEMENT_ALREADY_PREPARED`, `ORIGINAL_ALREADY_RECOVERED` | Mensajes en español que aclaran que no cambió el stock.                                                                   |

**Decisiones documentadas**

- **Dónde:** en la página del pedido (_Pedidos → Comprobante y contacto_), sección _Pérdidas y reemplazos_, porque la
  pérdida es de un producto del pedido y no cambia el pedido. Desde _Entregas fallidas_, cada tarjeta enlaza a esa
  sección con su último intento (`?intento=`), para ligar la pérdida a él.
- **Entrega del reemplazo:** no hay un flujo nuevo. Se coordina con lo que ya existe (contacto y reprogramación, o
  retiro en tienda de la #38); la sección lo explica y enlaza a _Entregas fallidas_. No se inventa una fecha.
- **El stock nunca lo calcula la web:** se muestran los movimientos del servidor (−1 reemplazo, +1 original vendible,
  con el stock resultante). Tras cada acción, con éxito o sin él, se vuelve a leer el estado.

## 2. Qué cambió

| Pieza                     | Detalle                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dispatchService`         | `losses`, `declareLoss`, `prepareReplacement`, `recoverOriginal`; acciones nuevas en la auditoría con sus etiquetas.                                                                                                                                                                                                                                                      |
| _Pérdidas y reemplazos_   | Productos del pedido con sus unidades y _Declarar pérdida_ (unidad si hay varias, motivo). Cada pérdida muestra **Reemplazo** (preparado o pendiente sin stock), **Original** (perdido, recuperado vendible o dañado) y sus **movimientos de stock**. Acciones según el estado: _Preparar reemplazo_ y _Registrar recuperación del original_ (vendible o dañado, motivo). |
| Seguridad de las acciones | Mientras se guarda, los botones y el formulario quedan bloqueados (sin doble descuento ni doble suma por doble clic). Un pedido entregado o cancelado no admite pérdidas nuevas.                                                                                                                                                                                          |
| _Entregas fallidas_       | Enlace _Pérdida o reemplazo_ en cada tarjeta.                                                                                                                                                                                                                                                                                                                             |

## 3. Pruebas y resultados reales

### 3.1 Unitarias y de componentes

- `pnpm vitest run` con la API apuntando a un puerto vacío (como en CI, sin backend): **828/829 PASS**; la única
  diferencia es la prueba que lee justamente la URL de la API configurada.
- Nuevas: `LossesPanel.test.tsx` (9): conflictos traducidos, cuerpos de las acciones, declarar con unidad e intento y
  volver a leer, reemplazo y original separados con el stock del servidor, sin stock libre sigue pendiente, recuperación
  que exige elegir vendible o dañado, original ya recuperado sin acción, pedido entregado sin pérdidas nuevas y red caída
  sin éxito falso.
- Las pruebas que abren la página del comprobante simulan las llamadas nuevas (`test/lossFixtures.ts`) para no consultar
  un backend real; las de la tarjeta de entregas fallidas se envuelven en un router por el enlace nuevo.

### 3.2 Integración contra el backend real

`src/integration/losses.int.test.ts` → **5/5 PASS**, con un producto propio de 2 unidades y dos ventas (stock libre 0):

| Ejemplo de la issue                 | Resultado real                                                                                     |
| ----------------------------------- | -------------------------------------------------------------------------------------------------- |
| Pérdida sin stock libre             | Reemplazo `PENDING`, sin movimientos, stock 0; preparar → `NO_FREE_STOCK` y stock sigue en 0.      |
| Se repone stock                     | Preparar → `PREPARED`, un movimiento −1 (stock 0); repetir o declarar la misma unidad → rechazado. |
| El original aparece vendible        | `RECOVERED SELLABLE`, movimiento +1 (stock 1); repetir → `ORIGINAL_ALREADY_RECOVERED`, stock 1.    |
| Pérdida con stock y original dañado | Reemplazo preparado al declarar (stock 0); dañado no agrega movimiento, stock 0.                   |
| CLIENT                              | 403 al consultar y al declarar.                                                                    |

Suite completa de integración: **16 archivos PASS, 113 pruebas PASS, 4 omitidas**. Fallan dos pruebas que **fallan
igual en `main` sin estos cambios** (verificado guardando los cambios y ejecutándolas solas): la del catálogo (cotización
422, ya documentada en la #37) y `dispatch.int.test.ts` › _rechazar y priorizar…_, que agota el tiempo de 15 s, muy
probablemente por la cantidad de urgencias de hoy que acumuló la base local con todas las ejecuciones.

### 3.3 Verificación en el navegador

En la página de un pedido real con una pérdida: _Reemplazo: Preparado_, _Original: Perdido: todavía no aparece_,
_Salida por reemplazo (-1) · stock después: 0_ y el botón _Registrar recuperación del original_. Sin errores en consola.

### 3.4 Calidad

| Comando          | Resultado                                            |
| ---------------- | ---------------------------------------------------- |
| `pnpm lint`      | Sin errores ni avisos en los archivos de esta issue. |
| `pnpm typecheck` | Sin errores.                                         |
| `pnpm build`     | Compila.                                             |

## 4. Pendiente de la #39 y limitaciones

- **Pendiente (backend #51):** registrar la emergencia de una ruta, ver lo entregado y lo pendiente, confirmar el
  retorno físico de cada producto y mantener visibles las recuperaciones pendientes tras cerrar la incidencia.
- No existe una acción para **anular una pérdida** declarada por error (pregunta abierta al líder en backend #52).
- El cliente no ve estas pérdidas: son seguimiento interno del ADMIN.
- Sin nuevo cobro, comprobante, devolución ni stock fabricado.
