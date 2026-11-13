# Evidencia · Issue #38 — Retiro en tienda acordado y seguimiento

Tras una entrega fallida, el ADMIN puede acordar con el cliente que **retire el pedido en la tienda** en lugar de
reprogramarlo. Acordar y confirmar el retiro son **pasos distintos**: el acuerdo deja el pedido pendiente de retiro sin
crear una ruta; solo la confirmación del retiro físico lo entrega. El cliente con cuenta ve ese estado en _Mis pedidos_.

- **Issue:** [#38](https://github.com/logistica-gc-uta/frontend-web-logistica/issues/38)
- **Fecha de ejecución:** 13/11/2026
- **Backend:** `logistica-gc-uta/backend` en `main` @ `1d28895` (incluye #50, `docs/issue-50-store-pickup.md`, migración
  `20261113T0313_order_store_pickup`)
- **Frontend:** rama `feat/38-retiro-en-tienda` (desde `main` @ `2eaa9db`)
- **Entorno:** Node 26.7.0, pnpm 12.4.2, Vitest 5.0.3, PostgreSQL 16 local (Docker)

## 1. Contrato usado (backend #50)

| Llamada / campo                                                              | Uso en la web                                                                                         |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `POST /dispatch/interventions` `PICKUP_DECLINE`                              | _El cliente no acepta retirar_: solo se audita; el pedido sigue pendiente de gestión.                 |
| `POST /dispatch/interventions` `PICKUP_AGREE`                                | _El cliente retirará en tienda_ (con el último intento fallido): pendiente de retiro, sin ruta nueva. |
| `POST /dispatch/interventions` `PICKUP_CONFIRM`                              | _Confirmar retiro_: el pedido pasa a entregado. Es la única acción que entrega.                       |
| `GET /dispatch/inbox` → `incidents[].pickup`                                 | Estado del retiro en la tarjeta de la entrega fallida.                                                |
| `GET /shop/orders(/:id)` → `pickup`, `pendingManagement`, `timeline`         | Estado de seguimiento del cliente y eventos `PICKUP_AGREED` / `PICKED_UP` con el texto del servidor.  |
| 409 `PICKUP_ALREADY_AGREED`, `PICKUP_NOT_AGREED`, `PICKUP_ALREADY_CONFIRMED` | Mensajes en español, sin éxito falso.                                                                 |

**Decisiones documentadas**

- **Dónde está la acción:** solo en _Entregas fallidas_, junto a contacto y reprogramación. Con el retiro acordado,
  la tarjeta ya no ofrece contacto ni reprogramación, para no tener dos decisiones contradictorias.
- **Pedidos sin intento fallido:** el backend permite acordar un retiro sin intento, pero las consultas ADMIN de un
  pedido (`GET /orders`, `GET /orders/:id`) **no devuelven el estado del retiro**. Sin poder leerlo, la web no podría
  mostrar si ya hay un retiro acordado ni ofrecer confirmarlo sin adivinar, así que esa acción no se ofrece. Queda
  pedido al backend: exponer `pickup` en la consulta ADMIN del pedido.
- **Sin estado nuevo del pedido:** como en el backend, «Pendiente de retiro» no es un valor de `status`; se muestra a
  partir de `pickup` y `pendingManagement`.

## 2. Qué cambió

| Pieza                 | Detalle                                                                                                                                                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Entregas fallidas     | Insignia _Entrega pendiente de gestión_ o _Pendiente de retiro en tienda_. Sección _Ofrecer retiro en tienda_ (respuesta y motivo obligatorios, referida al último intento). Con acuerdo: _Confirmar retiro_ aparte, con motivo. Aviso de éxito solo tras la respuesta del servidor. |
| Fallas                | Si una acción falla (por ejemplo, la red), no se da por hecha y se vuelve a consultar la bandeja para ver el estado real antes de repetir. Conflictos `PICKUP_*` traducidos.                                                                                                         |
| Gestiones registradas | El historial de la tarjeta incluye los acuerdos, rechazos y confirmaciones de retiro con actor y momento.                                                                                                                                                                            |
| Mis pedidos (Shop)    | Lista y detalle muestran _Entrega pendiente de gestión_, _Pendiente de retiro en tienda_ o _Entregado: retirado en tienda_. La línea de tiempo usa los textos del servidor. Se actualiza al recargar: no se inventan eventos en tiempo real.                                         |
| Estilos               | `.badge--warning` pasa a los estilos globales (antes solo estaba en la pantalla de repartidores).                                                                                                                                                                                    |

La reprogramación con acuerdo (contacto → reprogramar) no cambia y sigue probada.

## 3. Pruebas y resultados reales

### 3.1 Unitarias y de componentes

- `pnpm vitest run` con la API apuntando a un puerto vacío (como en CI, sin backend): **819/820 PASS**; la única
  diferencia es la prueba que lee justamente la URL de la API configurada.
- Nuevas: `StorePickup.test.tsx` (8): estado de seguimiento del cliente, conflictos traducidos, cuerpo de las acciones,
  tarjeta sin acuerdo (validación y respuesta), tarjeta con acuerdo (sin contacto ni reprogramación, confirmación aparte),
  acuerdo con aviso y nueva consulta, confirmación caída por red sin éxito falso y con nueva consulta, y doble
  confirmación explicada.
- Las pruebas existentes de entregas fallidas y reprogramación siguen pasando.

### 3.2 Integración contra el backend real

`src/integration/storePickup.int.test.ts` → **5/5 PASS**, con una zona, un repartidor (#36) y una clienta propios;
el repartidor registra de verdad la entrega fallida con su contraseña temporal:

| Caso de la issue                             | Resultado real                                                                                                              |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Tras la entrega fallida                      | El cliente ve `pendingManagement: true` → _Entrega pendiente de gestión_.                                                   |
| El cliente no acepta                         | `PICKUP_DECLINE` aplicado; sigue sin retiro.                                                                                |
| Se guarda el acuerdo, el cliente aún no vino | `PENDING_PICKUP`, no aparece en las propuestas de rutas, el cliente lo ve pendiente, no entregado.                          |
| Acordar dos veces                            | `PICKUP_ALREADY_AGREED` → mensaje claro.                                                                                    |
| CLIENT                                       | 403 al confirmar.                                                                                                           |
| Confirmar el retiro                          | Sale de la bandeja, `DELIVERED`, _Entregado: retirado en tienda_ con `PICKED_UP` en la línea de tiempo; repetir se rechaza. |

`support/driver.ts` acepta ahora las credenciales de un repartidor propio, para no ocupar al del seed.

Suite completa de integración: **16 archivos PASS, 109 pruebas PASS, 4 omitidas**. Sigue fallando la prueba ajena
`adminCatalog.int.test.ts` › _un cambio de precio posterior a una compra no reescribe su comprobante_, que falla igual
en `main` (documentado en la #37).

### 3.3 Verificación en el navegador

_Entregas fallidas_ carga sin errores en consola (la bandeja quedó vacía porque la prueba de integración confirmó su
retiro). Los estados de la tarjeta están cubiertos por las pruebas de pantalla y el flujo completo por la integración real.

### 3.4 Calidad

| Comando          | Resultado                                            |
| ---------------- | ---------------------------------------------------- |
| `pnpm lint`      | Sin errores ni avisos en los archivos de esta issue. |
| `pnpm typecheck` | Sin errores.                                         |
| `pnpm build`     | Compila.                                             |

## 4. Limitaciones y fuera de alcance

- **Deshacer un acuerdo de retiro** (el cliente no se presenta) no existe en el backend: quedó como pregunta al líder.
- **Retiro tras emergencia** (#39 / backend #51): el backend todavía no sabe si un producto está en recuperación.
- Sin mensajería automática, reembolso, stock automático ni eliminación de visitas históricas.
