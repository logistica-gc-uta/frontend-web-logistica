# Evidencia · Issue #35 — Historial unificado de compras propias

_Mis pedidos_ muestra en **una sola lista** las compras que el cliente hizo en la web y las que la tienda registró a su
nombre, cada una con su **origen**. Los pedidos antiguos que se conservan **sin comprobante** siguen visibles con su
seguimiento, sin inventar número, importes ni productos.

- **Issue:** [#35](https://github.com/logistica-gc-uta/frontend-web-logistica/issues/35)
- **Fecha de ejecución:** 12/11/2026
- **Backend:** `logistica-gc-uta/backend` en `main` @ `0a4cf51` (incluye #46, `docs/issue-46-unified-purchase-history.md`)
- **Frontend:** rama `feat/35-historial-unificado` (desde `main` @ `690895d`)
- **Entorno:** Node 26.7.0, pnpm 12.4.2, Vitest 5.0.3, PostgreSQL 16 local (Docker), base aislada

## 1. Contrato usado (backend #46)

| Llamada                        | Cambio que consume la web                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `GET /shop/orders`             | Lista única (Shop + ADMIN) en orden `createdAt desc`; campos `source` (`SHOP`/`ADMIN`) y `receiptAvailable`.             |
| `GET /shop/orders/:id`         | Detalle aunque no haya comprobante; sin comprobante, número, importes, pago y productos en `null`/`[]`.                  |
| `GET /shop/orders/:id/receipt` | Pedido propio sin comprobante: 404 `RECEIPT_UNAVAILABLE`; ajeno o inexistente: 404 `ORDER_NOT_FOUND` (sin revelar nada). |
| Comprobante (`payment`)        | `ADMIN_DECLARED_EXTERNAL`/`DECLARED` con `method` en compras de tienda; tarjeta de demostración en compras de la web.    |

**Detalle del backend a tener en cuenta:** en el detalle, las compras de tienda también llegan con
`paymentStatus: 'APPROVED'`. La web interpreta el pago con `source` para no presentarlas como pago con tarjeta.

## 2. Qué cambió

| Pantalla         | Detalle                                                                                                                                                                                                                                                                                                                       |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mis pedidos      | Una sola lista en el orden del servidor. Etiqueta de origen _Compra en la web_ / _Registrada en tienda_ (también en el nombre accesible de cada fila). Sin comprobante: _Sin comprobante_, _Productos no disponibles_ e _Importe no disponible_; el pedido sigue abriéndose.                                                  |
| Detalle          | Etiqueta de origen. Pago según el origen: _Pago aprobado con tarjeta de demostración_ (web) o _Pago registrado en la tienda — no es una verificación bancaria_ (tienda). Sin comprobante: título _Pedido sin comprobante_, seguimiento real visible, aviso de productos e importes no disponibles y sin botón de comprobante. |
| Comprobante      | Pago declarado en la tienda (efectivo/transferencia, con fecha) en lugar de tarjeta; comprador con correo y teléfono, destinatario con teléfono. `RECEIPT_UNAVAILABLE` muestra _Este pedido no tiene comprobante…_ con enlace al detalle; un pedido ajeno sigue mostrando solo _Ver mis pedidos_.                             |
| Tipos y servicio | `source`, `receiptAvailable` y campos `null` según el contrato; `amountsOf()` para no mostrar importes incompletos; `ReceiptUnavailableError` separado de «pedido no encontrado».                                                                                                                                             |

Los estados de retiro y emergencia (#38, #39) no se inventan: se mostrarán cuando el backend los entregue.

## 3. Pruebas y resultados reales

### 3.1 Unitarias y de componentes

- `pnpm vitest run` con la API apuntando a un puerto vacío (como en CI, sin backend): **763/764 PASS**; la única
  diferencia es la prueba que lee justamente la URL de la API configurada.
- Pruebas nuevas de la #35 (`OrderPages.test.tsx` y `customerOrdersService.test.ts`): lista mixta con origen y orden del
  servidor, pedido sin comprobante en la lista y en el detalle (seguimiento visible, sin `$`), pago de tienda sin
  tarjeta, pago de la web con tarjeta de demostración, comprobante con pago declarado, `RECEIPT_UNAVAILABLE` frente a
  pedido ajeno, y `amountsOf` con importes incompletos.

### 3.2 Integración contra el backend real

`src/integration/purchaseHistory.int.test.ts` → **3/3 PASS**:

| Ejemplo de la issue                            | Resultado real                                                                                      |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Cliente con dos compras, una Shop y otra ADMIN | Ambas en su lista con `source` `SHOP` y `ADMIN`, `receiptAvailable: true`, la más reciente primero. |
| Pago externo declarado                         | Detalle `source: ADMIN`; comprobante `ADMIN_DECLARED_EXTERNAL`/`DECLARED`/`CASH`, sin `cardLast4`.  |
| Abrir el pedido de otra cuenta                 | Otro cliente no los ve en su lista; detalle y comprobante → _No encontramos este pedido_.           |
| Invitado con el mismo teléfono                 | La venta de invitado no aparece en el historial del cliente.                                        |

Suite completa de integración: **12 archivos PASS, 82 pruebas PASS, 4 omitidas** (incidencias, por la ventana horaria).
En una primera corrida fallaron 4 pruebas de urgencias por pedidos «de hoy» que dejó una ejecución anterior interrumpida;
solas pasan 6/6 y la suite completa repetida pasó.

### 3.3 Verificación en el navegador

Con el cliente de la semilla y una venta registrada en tienda a su nombre (transferencia): la lista muestra
_Registrada en tienda_; el detalle, _Pago registrado en la tienda… no es una verificación bancaria_; el comprobante,
_Pago declarado en la tienda: transferencia_ con subtotal $25,99, IVA 15 % $3,90 y total $29,89, sin tarjeta. Sin
desplazamiento horizontal en móvil (375 px).

### 3.4 Calidad

| Comando          | Resultado                                            |
| ---------------- | ---------------------------------------------------- |
| `pnpm lint`      | Sin errores ni avisos en los archivos de esta issue. |
| `pnpm typecheck` | Sin errores.                                         |
| `pnpm build`     | Compila.                                             |

## 4. Fuera de alcance

Portal o enlace para invitados, filtros no soportados por el backend, pago real y rediseño del Shop.
