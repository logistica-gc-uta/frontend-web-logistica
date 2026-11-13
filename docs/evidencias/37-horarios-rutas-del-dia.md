# Evidencia · Issue #37 (parte 2) — Horarios agrupados y rutas del día

Completa la #37. La parte 1 (PR #49, `37-recorridos-por-calles.md`) mostró el motor vial. Esta parte integra
**backend #48** (horarios agrupados con margen configurable) y **backend #49** (rutas solo del día de entrega y rutas
sin zona que salen de la tienda).

- **Issue:** [#37](https://github.com/logistica-gc-uta/frontend-web-logistica/issues/37)
- **Fecha de ejecución:** 13/11/2026
- **Backend:** `logistica-gc-uta/backend` en `main` @ `1d28895` (incluye #48 y #49; migraciones
  `20261113T1124_route_schedule_margin_settings` y `20261113T1220_route_zone_id_optional_and_release_draft`)
- **Frontend:** rama `feat/37-horarios-rutas-del-dia` (desde `main` @ `e683efb`)
- **Entorno:** Node 26.7.0, pnpm 12.4.2, Vitest 5.0.3, PostgreSQL 16 local (Docker). Las 4 migraciones nuevas del
  backend se aplicaron sobre la base existente, con un respaldo previo; no hizo falta recrearla.

## 1. Contrato usado (backend #48 y #49)

| Llamada / campo                                                                    | Uso en la web                                                                                                 |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `GET /route-proposals` → `isToday`, `canConfirm`                                   | Otro día: solo vista previa, sin confirmar ni asignar.                                                        |
| `GET /route-proposals` → `timeWindowMarginMinutes`                                 | Aviso del margen vigente de agrupación horaria.                                                               |
| `zoneId` / `zoneCode` / `zone` en `null`                                           | Propuestas, rutas guardadas, monitoreo e incidencias muestran «Tienda»; al confirmar se envía `zoneId: null`. |
| `POST /routes`, asignación → 409 `ROUTE_DATE_NOT_TODAY`                            | Mensaje: las rutas solo se confirman y asignan el mismo día de entrega.                                       |
| `POST /dispatch/interventions` `RELEASE_DRAFT`                                     | _Liberar borrador_ de otro día sin chofer, con motivo: sus pedidos vuelven a pendientes.                      |
| `GET/PATCH /admin/shop-settings` → `routePlanning.timeWindowMarginMinutes` (5–180) | Campo en _Configuración Shop_, guardado con `expectedVersion`.                                                |

**Decisión documentada:** el control del margen va en la pantalla existente _Configuración Shop_, porque el backend lo
guarda en la misma configuración versionada (`ShopBusinessSettings`).

## 2. Qué cambió

| Pieza               | Detalle                                                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rutas sin zona      | `areaLabel()` muestra «Tienda» cuando no hay zona. Antes, una ruta con `zone: null` rompía Planificación (rutas guardadas) y Monitoreo al leer `zone.code`.                                      |
| Día de entrega      | Otro día: aviso _Solo vista previa: no es el día de entrega_, sin _Confirmar ruta_ ni _Confirmar todas_ (etiqueta _Solo vista previa_). `ROUTE_DATE_NOT_TODAY` traducido al confirmar o asignar. |
| Borradores vencidos | Un borrador sin chofer de otro día no ofrece asignar: explica por qué y ofrece _Liberar borrador_ (motivo obligatorio, confirmación, auditado como _Liberar borrador vencido_).                  |
| Horarios            | Aviso _Horarios agrupados_: junta horas pedidas con hasta N minutos de diferencia, máximo 4 paradas, en orden de hora, y aclara que no es una promesa de entregar dentro de ±N minutos.          |
| Margen configurable | _Configuración Shop → Planificación de rutas_: «Margen para agrupar horarios (minutos)», entero de 5 a 180, solo se envía si cambió; conflicto de versión como el resto de la configuración.     |
| Urgencias           | `zoneId` puede ser `null` (despacho desde la tienda).                                                                                                                                            |

## 3. Pruebas y resultados reales

### 3.1 Unitarias y de componentes

- `pnpm vitest run` con la API apuntando a un puerto vacío (como en CI, sin backend): **811/812 PASS**; la única
  diferencia es la prueba que lee justamente la URL de la API configurada.
- Nuevas: `DailyRoutes.test.tsx` (11): rutas sin zona como «Tienda» en planificación y monitoreo,
  `ROUTE_DATE_NOT_TODAY`, `RELEASE_DRAFT`, borrador de otro día que no se asigna y se libera con motivo, hoy se asigna
  como siempre, vista previa de otro día sin confirmar, aviso del margen, hoy sí se confirma, validación y cambios del
  margen, lectura con valor por defecto 30 y guardado desde la pantalla con la versión.

### 3.2 Integración contra el backend real

`src/integration/dailyRoutes.int.test.ts` → **5/5 PASS**: otro día `isToday/canConfirm=false` y confirmar → 409
traducido; una venta sin zona se planifica con `zoneId: null`; horas 10:00 y 15:00 en rutas distintas; margen guardado
con versión, reflejado en las propuestas y restaurado (versión vieja → 409); hoy se confirma un borrador sin zona
(«Tienda») y se libera con `RELEASE_DRAFT` (`APPLIED`), quedando el pedido otra vez planificable; CLIENT → 403.

**Pruebas existentes adaptadas a la regla del día (#49):** `planning.int.test.ts`, `drivers.int.test.ts` y
`realtime.int.test.ts` confirmaban o asignaban rutas en días futuros, que ahora el backend rechaza con 409. La vista
previa sigue en un día futuro propio; confirmar, corregir, asignar a un repartidor propio y el aviso de tiempo real se
prueban **hoy** con pedidos y repartidores propios, y los borradores se liberan al final. Fuera del horario de reparto
se omiten, como urgencias e incidencias. El punto de salida esperado ahora es la tienda (#48).

Suite completa de integración: **16 archivos PASS, 108 pruebas PASS, 14 omitidas**. Falla 1 prueba ajena a esta
issue: `adminCatalog.int.test.ts` › _un cambio de precio posterior a una compra no reescribe su comprobante_ (la
cotización del Shop responde 422). **Falla igual en `main` sin estos cambios** (verificado guardando los cambios y
ejecutándola sola), así que no la causa esta issue.

### 3.3 Verificación en el navegador

Como ADMIN de la semilla: _Planificación_ de mañana muestra _Solo vista previa: no es el día de entrega_, el aviso de
_Horarios agrupados_ con 30 minutos y ningún botón de confirmar. _Configuración Shop_ muestra _Planificación de rutas_
con el margen en 30 y su explicación. Sin errores en consola.

### 3.4 Calidad

| Comando          | Resultado                                            |
| ---------------- | ---------------------------------------------------- |
| `pnpm lint`      | Sin errores ni avisos en los archivos de esta issue. |
| `pnpm typecheck` | Sin errores.                                         |
| `pnpm build`     | Compila.                                             |

## 4. Fuera de alcance

Navegación GPS del conductor, hora de llegada garantizada, tráfico en vivo y optimización duplicada en React. Las
emergencias de ruta (#39) esperan backend #51.
