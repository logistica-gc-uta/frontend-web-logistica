# Evidencia · Issue #33 — Seleccionar ubicación sin zona y avisar horario aproximado

El checkout del Shop deja de pedir una **zona fija**. El cliente marca el punto de entrega en un mapa que muestra el área
de entrega de la tienda (#32). El servidor decide si se entrega ahí: dentro y en el borde se acepta, fuera se rechaza.
La hora pasa a ser **aproximada** y se avisa antes de confirmar.

- **Issue:** [#33](https://github.com/logistica-gc-uta/frontend-web-logistica/issues/33)
- **Fecha de ejecución:** 11/11/2026
- **Backend:** `logistica-gc-uta/backend` en `main` @ `0a4cf51` (incluye #41 cobertura y #42 pedidos sin zona,
  `docs/orders-coverage-contract.md`)
- **Frontend:** rama `feat/33-checkout-sin-zona` (desde `main` @ `7e7df3b`)
- **Entorno:** Node 26.7.0, pnpm 12.4.2, Vitest 5.0.3, PostgreSQL 16 local (Docker), base aislada de desarrollo

## 1. Contrato usado

| Llamada                                   | Uso                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| `GET /store-coverage` (público)           | Área y tienda para el mapa. `{ configured: false }` detiene la compra con un aviso.         |
| `POST /store-coverage/evaluate` (público) | Verifica cada punto que marca el cliente: `INTERIOR`, `BOUNDARY` o `EXTERIOR`.              |
| `POST /shop/checkout/quote` y `/checkout` | Sin `zoneId`. Errores nuevos: 422 `DELIVERY_OUTSIDE_COVERAGE` y 409 `STORE_NOT_CONFIGURED`. |
| `GET /shop/orders/:id`                    | `delivery.zoneName` puede ser `null` en pedidos nuevos.                                     |

## 2. Qué cambió

| Parte                     | Detalle                                                                                                                                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sin zona                  | Se quitó el selector _Zona_ y el checkout ya no envía `zoneId` (el tipo lo deja opcional para borradores guardados antes del cambio).                                                                                                                                          |
| Mapa con área             | `LocationPicker` recibe, de forma **opcional**, el área y la tienda; el checkout se centra en la tienda. El alta de pedidos ADMIN no cambia (no pasa área).                                                                                                                    |
| Verificación del servidor | Cada punto se consulta a `evaluate`: _Dentro de la zona de entrega_ o _En el borde de la zona de entrega: sí entregamos ahí_. **Fuera** muestra el error y deshabilita _Confirmar ubicación_. Sin respuesta del servidor no se confirma ni se cotiza.                          |
| Errores del servidor      | `DELIVERY_OUTSIDE_COVERAGE` lleva a corregir la ubicación; `STORE_NOT_CONFIGURED` explica que no se puede comprar con entrega. Ninguno muestra una compra exitosa ni vacía la bolsa. En el pago, ambos vuelven al checkout (acción `fix` existente).                           |
| Sin cobertura configurada | Aviso _La tienda todavía no definió su zona de entrega…_ con enlace a la bolsa; no se muestra el formulario ni se cotiza.                                                                                                                                                      |
| Hora aproximada           | Campo _Hora aproximada de entrega_ y aviso _La hora que elijas es aproximada: la entrega puede llegar un poco antes o un poco después._ El pago repite _Hora aproximada: …_ y el aviso antes de pagar. No se promete una ventana exacta. Horario configurable igual que antes. |
| Recotizar                 | Mover el marcador anula la confirmación y la cotización; al confirmar se recotiza con el total del servidor y se conservan las fotos del resumen.                                                                                                                              |
| Detalle del pedido        | Si `zoneName` es `null` se muestra solo la dirección (antes quedaba un `·` colgando).                                                                                                                                                                                          |

## 3. Pruebas y resultados reales

### 3.1 Unitarias y de componentes

`pnpm vitest run` → **79 archivos, 743/743 PASS.**

Pruebas nuevas o adaptadas para esta issue:

- `CheckoutPage.test.tsx`: sin selector de zona y con área (4 puntos) y aviso de hora aproximada; punto en el **borde**
  se acepta y se cotiza; punto **fuera** no se puede confirmar ni cotizar; mover el punto después de cotizar exige
  confirmar y **recotiza conservando la foto** y el total del servidor; rechazo `DELIVERY_OUTSIDE_COVERAGE` al cotizar
  sin total y sin tocar la bolsa; **sin cobertura configurada** no deja comprar y conserva la bolsa. La cotización se
  envía sin `zoneId`.
- `PaymentPage.test.tsx`: el pago muestra _Hora aproximada_ y el aviso antes de pagar.
- `LocationPicker.test.tsx`: dibuja el área y la tienda, muestra la verificación y respeta `canConfirm`; sin área no
  dibuja nada (el alta ADMIN no cambia).
- `OrderPages.test.tsx`: un pedido sin zona muestra solo la dirección.

### 3.2 Integración contra el backend real

`pnpm vitest run --config vitest.integration.config.ts src/integration/shopCheckout.int.test.ts src/integration/storeCoverage.int.test.ts`
→ **2 archivos, 23/23 PASS.**

| Ejemplo de la issue                                  | Resultado real                                                                          |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Compra completa sin zona (cotizar, pagar, historial) | Cotiza y paga; el detalle del pedido trae `zoneName: null` y el punto enviado.          |
| Punto en el borde y hora válida                      | `evaluate` → `BOUNDARY`; la cotización responde 200 ($83,95).                           |
| Punto exterior                                       | `evaluate` → `accepted: false`; la cotización responde 422 `DELIVERY_OUTSIDE_COVERAGE`. |

**Otras integraciones que fallan y no son de esta issue:** `orders`, `planning` y `realtime` crean pedidos con
`POST /orders/admin`, cuyo contrato cambió en backend #45 (ahora exige `buyer` y `payment` y rechaza `recipient`).
Adaptarlo es la issue web **#34**. Fallan igual en `main` contra el backend actual.

### 3.3 Verificación en el navegador (backend y frontend locales, cliente de la semilla)

- `/checkout` sin selector de zona; el mapa dibuja el área y la tienda; etiqueta _Hora aproximada de entrega_ y su aviso.
- Clic en el mapa → `POST /store-coverage/evaluate` 200 y _Dentro de la zona de entrega._; _Confirmar ubicación_ habilitado.
- Con los datos de entrega completos → `POST /shop/checkout/quote` 200 y total con IVA en el resumen. No se completó el
  pago desde el navegador (lo cubre la integración).

### 3.4 Calidad

| Comando              | Resultado                                                                                                                                                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`          | Sin errores; los avisos que quedan ya existían en `main`.                                                                                                                                                                                                     |
| `pnpm typecheck`     | Sin errores.                                                                                                                                                                                                                                                  |
| `pnpm build`         | Compila.                                                                                                                                                                                                                                                      |
| E2E `06-compra-shop` | Se adaptó el paso de entrega (sin zona, espera la verificación, hora aproximada). La prueba **ya falla en `main` antes del checkout** porque busca textos del registro anteriores al rediseño (_Crear una cuenta_, _Tu cuenta se creó_); no es de esta issue. |

### 3.5 Base local

Para aplicar las migraciones nuevas del backend se recreó la base local desde cero: respaldo con `pg_dump`,
`docker compose down -v`, las 17 migraciones, la semilla (que ahora crea una cobertura de demostración de Ambato) y la
restauración de las 3 tarjetas de demostración. La base anterior no tenía las funciones de integridad de rutas que
exige la migración `order_zone_id_optional`.

## 4. Fuera de alcance

- Sin rutas GPS, nuevo proveedor de pago ni cambios al catálogo.
- El alta de pedidos ADMIN sin zona y con pago declarado es la issue #34.
