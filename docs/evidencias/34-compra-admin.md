# Evidencia · Issue #34 — Registrar compra y comprobante de cliente o invitado (parte invitado)

El alta de pedidos del panel pasa a ser una **venta**: comprador invitado con teléfono obligatorio, destinatario aparte
si el regalo lo recibe otra persona, **pago externo declarado** (efectivo o transferencia), entrega sin zona dentro de
la cobertura y en el horario de la tienda, y un **comprobante imprimible** con los importes del servidor. Desde el
comprobante se puede **corregir el contacto** con historial.

- **Issue:** [#34](https://github.com/logistica-gc-uta/frontend-web-logistica/issues/34)
- **Fecha de ejecución:** 12/11/2026
- **Backend:** `logistica-gc-uta/backend` en `main` @ `0a4cf51` (incluye #42 y #45, `docs/admin-purchases-contract.md`)
- **Frontend:** rama `feat/34-compra-admin` (desde `main` @ `713e7be`)
- **Entorno:** Node 26.7.0, pnpm 12.4.2, Vitest 5.0.3, Playwright 1.64.1, PostgreSQL 16 local (Docker), base aislada

## 1. Alcance de este PR y lo que queda pendiente

| Parte                            | Estado                                                                                                                                                                                                                                                |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Comprador **invitado**           | ✅ Completo.                                                                                                                                                                                                                                          |
| Comprador **cliente con cuenta** | ⏳ **Bloqueado por backend**: no existe ningún endpoint para buscar o listar clientes (ni en el código ni en las issues del backend). La opción se muestra deshabilitada con el aviso. Se pidió al equipo de backend un `GET /admin/clients?search=`. |
| Planificar ventas sin zona       | ⏳ Por decisión del equipo, las ventas **no envían zona** (#42). La planificación las tomará cuando **backend #49** agrupe por cobertura; hasta entonces no aparecen en las propuestas (`MISSING_ZONE`).                                              |

## 2. Contrato usado (backend #45)

| Llamada                                                                      | Uso                                                                                     |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `POST /orders/admin` + `Idempotency-Key` (UUIDv4)                            | Registrar la venta: `buyer` (GUEST), `giftRecipient` opcional, `payment` CASH/TRANSFER. |
| `GET /orders/admin/purchase-attempts/:key`                                   | Recuperar una venta cuyo resultado no se conoce (red caída, 5xx, en proceso).           |
| `GET /orders/:id/receipt`                                                    | Comprobante imprimible ADMIN (cliente o invitado).                                      |
| `GET /orders/:id` (ADMIN)                                                    | Contacto vigente y su `contactRevision`.                                                |
| `PATCH /orders/:id/contact`                                                  | Corrección de contacto con versión (`CONTACT_REVISION_CONFLICT` si es vieja).           |
| `GET /orders/:id/contact-history`                                            | Historial de correcciones.                                                              |
| `GET /store-coverage`, `POST /store-coverage/evaluate`, `GET /shop/settings` | Área en el mapa, verificación del punto y horario de reparto.                           |

## 3. Qué se implementó

| Parte                    | Detalle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Formulario _Nueva venta_ | Comprador (invitado; _Cliente con cuenta_ deshabilitado con su motivo), nombre y **teléfono obligatorio**; casilla _El regalo lo recibe otra persona_ con nombre y teléfono separados; **pago declarado** Efectivo/Transferencia, nota opcional (máx. 200) y aviso _no se valida en el banco ni se cobra con tarjeta_; dirección, fecha y hora aproximada en el horario de la tienda; productos; mapa con el área y verificación del punto por el servidor. Sin zona y sin campos de tarjeta. |
| Totales                  | Antes de enviar solo se muestra el **subtotal estimado** y se aclara que _el total con IVA lo calcula el servidor_ (no hay cotización ADMIN). El total real con IVA simulado y envío incluido sale del servidor en el comprobante.                                                                                                                                                                                                                                                            |
| Envío seguro             | `useAdminPurchase`: la misma venta reutiliza su `Idempotency-Key`; datos distintos usan otra. Sin respuesta, 5xx o `ADMIN_PURCHASE_IN_PROGRESS` → se **verifica el intento** con la misma clave en lugar de reenviar; mientras está pendiente no se puede enviar otra. Si la venta nunca llegó, se puede reenviar sin duplicar. Tras un rechazo, la siguiente usa una clave nueva. Los datos del formulario nunca se pierden por un error.                                                    |
| Errores                  | Por código: `DELIVERY_OUTSIDE_COVERAGE`, `DELIVERY_OUTSIDE_HOURS`, `STORE_NOT_CONFIGURED`, `IDEMPOTENCY_KEY_REUSED`, `ADMIN_PURCHASE_IN_PROGRESS`; stock (mensaje del backend), 403, 404 y el rechazo en inglés de productos sin precio en centavos, traducido.                                                                                                                                                                                                                               |
| Comprobante              | `/admin/pedidos/:id/comprobante`: número, emisión, aviso _sin validez tributaria_, comprador, quien recibe, entrega, productos, subtotal, IVA simulado, envío incluido y total del servidor; _Pago declarado: Efectivo/Transferencia… no es una verificación bancaria_ (o la tarjeta de demostración en compras del Shop). **Imprimir** usa la impresión del navegador y oculta menú, botones y contacto. Un pedido antiguo sin comprobante lo dice sin inventar importes.                    |
| Corregir contacto        | Teléfono del comprador, nombre y teléfono de quien recibe, y nombre del comprador **solo en invitados**. Envía solo lo que cambió con la versión vigente; ante conflicto no guarda y ofrece recargar. Historial de correcciones. El comprobante y los importes no cambian. No se envían mensajes automáticos.                                                                                                                                                                                 |
| Listado                  | Los pedidos sin zona muestran «—» (antes la tabla fallaba con `zone: null`); cada fila tiene _Ver_ para abrir su comprobante. Lo mismo en la tarjeta de urgencias.                                                                                                                                                                                                                                                                                                                            |

## 4. Pruebas y resultados reales

### 4.1 Unitarias y de componentes

`pnpm vitest run --coverage` → **81 archivos, 755/755 PASS**, cobertura 95,37 % de sentencias (el CI exige 80 %).
Repetida con la API apuntando a un puerto vacío (como en GitHub, sin backend): **754/755**; la única diferencia es la
prueba que comprueba la URL de tiempo real, que depende justamente de esa variable.

Pruebas de esta issue: `orderValidation.test.ts`, `ordersService.test.ts`, `purchaseErrors.test.ts`,
`OrdersPage.test.tsx` (formulario, idempotencia y recuperación) y `OrderReceiptPage.test.tsx` (comprobante, impresión,
pedido sin comprobante, corrección de contacto, conflicto e historial).

### 4.2 Integración contra el backend real

`pnpm vitest run --config vitest.integration.config.ts` → **10 archivos PASS, 73 pruebas PASS, 10 omitidas**.

| Ejemplo de la issue / caso                           | Resultado real                                                                                                                                                                                        |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Venta de invitado en efectivo                        | 201; `zoneId: null`; subtotal 2000, IVA del servidor, envío 0; pago `ADMIN_DECLARED_EXTERNAL`/`DECLARED`/`CASH`; stock −2; comprobante sin `cardLast4`; intento `SUCCEEDED` consultable por su clave. |
| Repetir con la misma clave                           | Mismo pedido, stock descontado una sola vez; con otros datos y la misma clave → 409 `IDEMPOTENCY_KEY_REUSED`.                                                                                         |
| Transferencia declarada y regalo a otra persona      | `TRANSFER`; comprador y destinatario separados en el pedido y en el comprobante.                                                                                                                      |
| Error de stock                                       | 400 _Stock insuficiente_; sin pedido, comprobante ni cambio de stock.                                                                                                                                 |
| Punto fuera de la cobertura / hora fuera del horario | 422 `DELIVERY_OUTSIDE_COVERAGE` / `DELIVERY_OUTSIDE_HOURS`; sin cambios de stock.                                                                                                                     |
| Teléfono del comprador vacío                         | 400.                                                                                                                                                                                                  |
| Corrección de contacto                               | Versión 0 → 1; con versión vieja 409 `CONTACT_REVISION_CONFLICT`; historial con el cambio; el comprobante conserva el teléfono de la venta.                                                           |
| CLIENT                                               | 403 al registrar y al corregir.                                                                                                                                                                       |

También se adaptaron al contrato nuevo las integraciones de planificación, tiempo real, urgencias e incidencias (siguen
enviando `zoneId` para que sus pedidos sean planificables hasta backend #49). **Urgencias e incidencias se omiten fuera
del horario de reparto** (07:00–17:00): registran pedidos para «más tarde hoy» y desde #42 el ADMIN también respeta el
horario. Esta ejecución fue de noche; deben repetirse en horario de reparto.

### 4.3 E2E en el navegador (Playwright)

`02-pedido-a-ruta`, `03-validaciones-pedido` y la prueba _sin conexión_ de `05-fallas-simuladas` → **PASS**:

- Venta de invitado desde el panel: punto verificado (_Dentro de la zona de entrega_), _Registrar venta_, comprobante con
  _Pago declarado: Efectivo_ y venta sin zona en el servidor.
- Validaciones del formulario sin enviar nada; fecha pasada y ubicación sin confirmar.
- Otra venta se lleva el último stock: rechazo del backend, sin comprobante y con los datos conservados.
- Sin conexión: _La venta no llegó a registrarse_; al volver la red, el reenvío usa **la misma `Idempotency-Key`** y
  registra una sola venta.

### 4.4 Verificación manual en el navegador

Comprobante real (`/admin/pedidos/:id/comprobante`) con subtotal $5,00, IVA 15 % $0,75, envío $0,00, total $5,75 y pago
declarado en efectivo; formulario de contacto con los datos vigentes; formulario _Nueva venta_ con sus cinco secciones;
sin desplazamiento horizontal en móvil (375 px).

### 4.5 Calidad

| Comando          | Resultado                                            |
| ---------------- | ---------------------------------------------------- |
| `pnpm lint`      | Sin errores ni avisos en los archivos de esta issue. |
| `pnpm typecheck` | Sin errores.                                         |
| `pnpm build`     | Compila.                                             |

## 5. Hallazgos para el equipo de backend

1. **No hay endpoint para buscar clientes registrados**: sin él, el ADMIN no puede elegir un comprador con cuenta.
2. **Los productos de la semilla no tienen precio en centavos**: `POST /orders/admin` los rechaza con
   _Product '…' has no valid price in cents configured_ (en inglés). El panel lo traduce, pero `GET /products` no
   expone `priceCents`, así que no puede ocultarlos de antemano.

## 6. Fuera de alcance

Sin banco, factura fiscal, envío automático de mensajes ni apertura de cuentas para invitados.
