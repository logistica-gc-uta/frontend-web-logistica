# Evidencia · Issue #39 (parte 2) — Emergencia en ruta, custodia por unidad y cierre

Completa la #39. La parte 1 (PR #52, `39-perdida-reemplazo.md`) integró pérdida, reemplazo y recuperación tardía. Esta
parte integra **backend #51**: declarar una emergencia en una ruta en curso, seguir cada unidad pendiente por
separado, confirmar el retorno del repartidor aparte, cerrar el incidente sin ocultar lo pendiente y habilitar un pedido
solo cuando todas sus unidades están resueltas. También integra **anular una pérdida** declarada por error.

- **Issue:** [#39](https://github.com/logistica-gc-uta/frontend-web-logistica/issues/39)
- **Fecha de ejecución:** 13/11/2026
- **Backend:** `logistica-gc-uta/backend` en `main` @ `cb76ae6` (incluye #51, `docs/issue-51-emergency-recovery.md`,
  migración `20261113T1720_emergency_recovery_and_loss_cancel`, aplicada sobre la base local con respaldo previo)
- **Frontend:** rama `feat/39-emergencia-ruta` (desde `main` @ `bab5f90`)
- **Entorno:** Node 26.7.0, pnpm 12.4.2, Vitest 5.0.3, PostgreSQL 16 local (Docker)

## 1. Contrato usado (backend #51)

| Llamada / acción                                                  | Uso en la web                                                                                                              |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `EMERGENCY_DECLARE` (`routeId`)                                   | _Declarar emergencia_ en _Seguimiento_, solo para rutas en curso.                                                          |
| `UNIT_RECOVERY_CONFIRM` (`recoveryId`)                            | _Confirmar retorno_ de una unidad. No toca el stock.                                                                       |
| `EMERGENCY_DRIVER_RELEASE` (`routeId`)                            | _Confirmar retorno del repartidor_, separado de las unidades y del cierre.                                                 |
| `EMERGENCY_CLOSE` (`routeId`)                                     | _Cerrar emergencia_, aunque queden unidades pendientes.                                                                    |
| `EMERGENCY_REQUEUE` (`orderId`, `emergencyId`)                    | _Habilitar para planificar_ un pedido con todas sus unidades resueltas.                                                    |
| `LOSS_CANCEL` (`lossId`)                                          | _Anular pérdida_ en _Pérdidas y reemplazos_; si el reemplazo estaba preparado vuelve una unidad (`REPLACEMENT_CANCEL_IN`). |
| `GET /dispatch/emergencies`, `GET /dispatch/routes/:id/emergency` | Emergencias con conteos y el detalle por unidad.                                                                           |
| `Route.status = INTERRUPTED`                                      | Nuevo estado en _Seguimiento_, _Planificación_ e _Inicio_.                                                                 |

**Diferencia con la documentación del backend:** `docs/issue-51-emergency-recovery.md` indica `routeUnitRecoveryId` para
confirmar una unidad y solo `orderId` para habilitar un pedido, pero el backend exige **`recoveryId`** y **`orderId` +
`emergencyId`**. La web usa lo que exige el backend (verificado en la integración real).

Errores traducidos: `EMERGENCY_ALREADY_DECLARED`, `EMERGENCY_ALREADY_CLOSED`, `UNIT_ALREADY_RECOVERED`,
`UNIT_HAS_ACTIVE_LOSS`, `RECOVERY_PENDING`, `DRIVER_ALREADY_RELEASED`, `EMERGENCY_RECOVERY_NOT_FOUND` y, al anular,
`LOSS_ALREADY_CANCELLED`, `LOSS_ALREADY_RECOVERED`, `LOSS_CANCEL_ORDER_STATE`, `LOSS_CANCEL_ACTIVE_CLAIM`,
`LOSS_CANCEL_PICKUP_EXISTS`.

## 2. Qué cambió

| Pieza                 | Detalle                                                                                                                                                                                                                                                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Seguimiento           | Una ruta en curso ofrece _Declarar emergencia_ (motivo obligatorio, explica qué se conserva). Una ruta interrumpida lo indica y enlaza a _Emergencias_. El chofer de una ruta interrumpida no figura como disponible sin confirmar su regreso.                                                                             |
| _Emergencias_ (nueva) | Por emergencia: motivo, estado (abierta o cerrada), conteos por unidad, **lo que ya pasó en la ruta** (entregado y fallido, que nunca se borra), **repartidor** (retorno confirmado o no, con su acción aparte) y **productos en custodia** por pedido y unidad, con _Confirmar retorno_ o _No aparece: declarar pérdida_. |
| Pedido por pedido     | Con unidades sin resolver: «Sigue bloqueado». Con todas resueltas: _Habilitar para planificar_ (o coordinar fecha o retiro). Confirmar una unidad de A no cambia B.                                                                                                                                                        |
| Cierre                | _Cerrar emergencia_ avisa que las pendientes seguirán a la vista; tras cerrar, «Cerrada con pendientes» las cuenta.                                                                                                                                                                                                        |
| Pérdidas y reemplazos | _Anular pérdida_ (motivo) cuando el original no se recuperó; la pérdida anulada se ve «Anulada» con su motivo y el movimiento de devolución, y la unidad se puede volver a declarar.                                                                                                                                       |
| Estado _Interrumpida_ | Agregado en Seguimiento, Planificación (rutas guardadas) e Inicio; motivo `RECOVERY_PENDING` traducido en pedidos excluidos.                                                                                                                                                                                               |

Todo lo que se muestra viene del servidor; tras cada acción, con éxito o sin él, se vuelve a leer el estado.

## 3. Pruebas y resultados reales

### 3.1 Unitarias y de componentes

- `pnpm vitest run` con la API apuntando a un puerto vacío (como en CI, sin backend): **89 archivos, 840/841 PASS**; la
  única diferencia es la prueba que lee justamente la URL de la API configurada.
- Nuevas: `Emergencies.test.tsx` (10): errores, cuerpos de las acciones, chofer no disponible por inferencia, declarar
  emergencia con motivo, ruta interrumpida sin otra emergencia, lo entregado conservado, **confirmar A no desbloquea B**,
  **cerrar con pendientes las deja a la vista**, habilitar sin resolver rechazado, y retorno del repartidor aparte.
  `LossesPanel.test.tsx` (+2): anular una pérdida y pérdida anulada sin acciones.

### 3.2 Integración contra el backend real

`src/integration/emergencies.int.test.ts` → **6/6 PASS**, con zona, producto y repartidor propios (el repartidor inicia
la ruta de hoy con su contraseña temporal y entrega un pedido):

| Ejemplo de la issue                       | Resultado real                                                                                                                                                                         |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| La emergencia no borra lo entregado       | Ruta `INTERRUPTED`, la parada entregada sigue `SUCCESSFUL`; A y B quedan `PENDING`; repetir → `EMERGENCY_ALREADY_DECLARED`.                                                            |
| Habilitar con unidades pendientes         | `RECOVERY_PENDING` traducido.                                                                                                                                                          |
| Confirmar el retorno de A no desbloquea B | A `RECOVERED` y se habilita; B sigue `PENDING` y habilitarlo → `RECOVERY_PENDING`.                                                                                                     |
| Reemplazo y anulación de pérdida          | B `LOST_PREPARED`; confirmar su retorno → `UNIT_HAS_ACTIVE_LOSS`; anular → movimientos `REPLACEMENT_OUT` y `REPLACEMENT_CANCEL_IN`, B vuelve a `PENDING`; anular otra vez → rechazado. |
| Retorno del repartidor y cierre           | Retorno registrado (repetir → `DRIVER_ALREADY_RELEASED`); cerrar deja B en las pendientes; cerrar otra vez → `EMERGENCY_ALREADY_CLOSED`.                                               |
| CLIENT                                    | 403.                                                                                                                                                                                   |

**Hallazgo sobre el «422 del Shop»:** las fallas de la prueba del catálogo (documentada en la #37) y de algunas compras
del Shop no eran un error del backend: la tarjeta de demostración aprobada de la base local se quedó sin saldo después de
tantas ejecuciones de prueba (quedaban $0,59). Se restauró su saldo original ($204,20, según
`respaldos-db/demo-rows.sql`) y esas tres suites pasan **29/29**.

Suite completa de integración (ejecutada después de las 17:00): **15 archivos PASS, 94 pruebas PASS, 31 omitidas**.
Las omitidas son las suites de «hoy» (urgencias, incidencias, planificación de hoy, repartidores con ruta, tiempo real,
retiro en tienda y esta), que solo corren dentro del horario de reparto; todas se ejecutaron y pasaron antes de las 17:00
por separado. En una corrida completa anterior falló una vez `losses.int.test.ts` › _con stock libre el reemplazo se
prepara al declarar…_; en tres corridas posteriores (sola, con sus vecinas y la suite completa) pasó siempre, así que se
registra como intermitente.

### 3.3 Verificación en el navegador

_Emergencias_ con la emergencia real de la prueba: «Cerrada», lo entregado en la ruta, retorno del repartidor confirmado,
la unidad de A «Recuperada en la tienda» con su pedido habilitado, la de B «Pendiente de recuperar» con su pedido
bloqueado y el aviso «Cerrada con pendientes». Sin errores en consola.

### 3.4 Calidad

| Comando          | Resultado                                            |
| ---------------- | ---------------------------------------------------- |
| `pnpm lint`      | Sin errores ni avisos en los archivos de esta issue. |
| `pnpm typecheck` | Sin errores.                                         |
| `pnpm build`     | Compila.                                             |

## 4. Fuera de alcance

Navegación del conductor, mensajería automática, reembolsos o nuevos cobros, y cambios en la app del repartidor (el
retorno desde la app ya lo emite el backend).
