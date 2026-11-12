# Evidencia · Issue #36 — Gestionar repartidores y ausencias

El ADMIN tiene una pantalla **Repartidores** (menú _Operación_) para dar de alta repartidores, corregir sus datos y
registrar o anular sus **ausencias**. La disponibilidad se consulta **por día**: una ausencia (_Ausente_) se distingue de
estar _Ocupado con una ruta_. Planificación y Urgencias ya no ofrecen un chofer ausente ese día.

- **Issue:** [#36](https://github.com/logistica-gc-uta/frontend-web-logistica/issues/36)
- **Fecha de ejecución:** 12/11/2026
- **Backend:** `logistica-gc-uta/backend` en `main` @ `0a4cf51` (incluye #43 `docs/issue-43-driver-profiles.md` y #44 `docs/issue-44-driver-absences.md`)
- **Frontend:** rama `feat/36-repartidores-ausencias` (desde `main` @ `fe333e6`)
- **Entorno:** Node 26.7.0, pnpm 12.4.2, Vitest 5.0.3, PostgreSQL 16 local (Docker), base aislada

## 1. Contrato usado (backend #43 y #44)

| Llamada                                        | Uso en la web                                                                                   |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `GET /drivers`                                 | Listado de repartidores (no trae ausencias).                                                    |
| `POST /drivers`                                | Alta con nombre, correo y vehículo; la respuesta trae `temporaryPassword` **una sola vez**.     |
| `PATCH /drivers/:id`                           | Corrección: se envían solo los campos que cambiaron. No toca rutas, reservas ni disponibilidad. |
| `GET /drivers/:id/availability?date=`          | Disponibilidad de un día (hoy o futuro) con `absence`; base de la columna de disponibilidad.    |
| `GET /drivers/:id/absences`                    | Ausencias activas que terminan desde hoy.                                                       |
| `POST /drivers/:id/absences`                   | Registra un rango; si choca con rutas asignadas se guarda igual y devuelve `conflicts`.         |
| `POST /drivers/:id/absences/:absenceId/cancel` | Anula con motivo opcional (las ausencias no se editan ni se borran).                            |
| `PATCH /routes/:id/assign-driver`              | Con un chofer ausente ese día responde 409 `DRIVER_ABSENT`.                                     |

Códigos traducidos: `EMAIL_ALREADY_EXISTS`, `INVALID_DATE`, `ABSENCE_DATE_IN_PAST`, `ABSENCE_RANGE_INVALID`,
`ABSENCE_OVERLAP`, `ABSENCE_ALREADY_CANCELLED`, `ABSENCE_ALREADY_ELAPSED`, `AVAILABILITY_DATE_IN_PAST`, `DRIVER_ABSENT`,
además de 401, 403, 404 y sin conexión.

## 2. Qué cambió

| Pantalla / módulo                    | Detalle                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repartidores (`/admin/repartidores`) | Alta con validación (nombre y vehículo 2–120, correo válido). Tras crear, la **contraseña temporal** se muestra una vez con botón _Copiar_ y aviso de que no se puede volver a ver; _Ya la entregué_ la oculta. Listado con correo, vehículo y disponibilidad del día elegido (_Disponible_, _Ausente · motivo_, _Ocupado con una ruta_, _Marcado como no disponible_). Sin botón de baja: el backend no la ofrece. |
| Corrección de datos                  | Formulario precargado; envía solo lo que cambió y avisa _Sus rutas, reservas y disponibilidad no cambiaron_. Sin cambios no llama al backend.                                                                                                                                                                                                                                                                       |
| Ausencias                            | Lista de ausencias vigentes con motivo y marca _Afecta una ruta_; registro con _Desde_ / _Hasta_ / _Motivo_ (solo hoy o futuro, rango en orden, motivo ≤ 300). Si la ausencia choca con rutas, aviso con fecha, estado y nº de pedidos de cada ruta, **sin cancelar ni reasignar nada**, con enlaces a Planificación y Urgencias. Anulación con motivo.                                                             |
| Planificación y Urgencias            | `driversService.listForDay(día)` consulta la disponibilidad del día de la ruta: un chofer ausente aparece como _ausente ese día_ y no se puede elegir. Si una consulta falla se deja el listado como estaba (el backend igual rechaza). `DRIVER_ABSENT` al asignar → _Ese chofer está ausente el día de la ruta: elige otro._                                                                                       |

## 3. Pruebas y resultados reales

### 3.1 Unitarias y de componentes

- `pnpm vitest run` con la API apuntando a un puerto vacío (como en CI, sin backend): **779/780 PASS**; la única
  diferencia es la prueba que lee justamente la URL de la API configurada.
- Nuevas de la #36: `driversLogic.test.ts` (7) y `DriversPage.test.tsx` (9): validaciones, etiquetas de disponibilidad,
  errores del backend, `listForDay` con chofer ausente o consulta fallida, menú, disponibilidad que cambia con el día,
  alta con contraseña temporal mostrada una vez, correo repetido sin perder lo escrito, corrección con solo los cambios,
  ausencia con conflictos sin reasignar, validación de fechas, solape del backend y anulación con motivo.
- Planificación y Urgencias simulan `listForDay` en sus pruebas para no llamar al backend.

### 3.2 Integración contra el backend real

`src/integration/drivers.int.test.ts` → **9/9 PASS**. Crea **sus propios** repartidores (nunca usa los del seed) y
trabaja en un miércoles al azar entre 2080 y 2099:

| Caso de la issue                     | Resultado real                                                                                 |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Alta con contraseña temporal         | El repartidor inicia sesión con ella (rol `DRIVER`); el listado no expone la contraseña.       |
| Correo repetido                      | _Ya existe una cuenta con ese correo._                                                         |
| Corregir datos                       | Cambia solo el vehículo; nombre y correo intactos.                                             |
| Ausencia sobre una ruta asignada     | Se guarda `ACTIVE` con el conflicto de esa ruta; la ruta sigue `ASSIGNED` con el mismo chofer. |
| Disponibilidad por día               | Ausente el día de la ausencia, disponible el siguiente; `listForDay` lo marca `ABSENT`.        |
| Asignar ruta a un ausente            | 409 `DRIVER_ABSENT` → mensaje de la web.                                                       |
| Solape, fecha pasada, rango al revés | `ABSENCE_OVERLAP`, `ABSENCE_DATE_IN_PAST`, `ABSENCE_RANGE_INVALID`.                            |
| Anular                               | `CANCELLED`, libera el día; anular de nuevo → `ABSENCE_ALREADY_CANCELLED`.                     |
| CLIENT                               | 403 al crear, registrar ausencias y consultar disponibilidad.                                  |

Suite completa de integración: **13 archivos PASS, 91 pruebas PASS, 4 omitidas** (incidencias, por la ventana horaria).

### 3.3 Verificación en el navegador

Como ADMIN de la semilla en `/admin/repartidores`: el listado muestra los repartidores con su disponibilidad del día; el
repartidor de prueba con ruta asignada aparece _Ocupado con una ruta_ y su panel de ausencias muestra la ausencia
registrada con _Afecta una ruta_ y el botón _Anular_. Sin errores en consola. Sin desplazamiento horizontal en móvil
(375 px).

**Detalle del backend a tener en cuenta:** la disponibilidad de un día marca _ocupado_ a un repartidor con cualquier
reserva activa, aunque su ruta sea de otra fecha; la web muestra lo que dice el backend.

### 3.4 Calidad

| Comando          | Resultado                                            |
| ---------------- | ---------------------------------------------------- |
| `pnpm lint`      | Sin errores ni avisos en los archivos de esta issue. |
| `pnpm typecheck` | Sin errores.                                         |
| `pnpm build`     | Compila.                                             |

## 4. Fuera de alcance

Baja o eliminación de repartidores y restablecer contraseña (el backend no los ofrece), editar ausencias (se anulan y se
registran de nuevo) y reasignar automáticamente las rutas afectadas (lo decide el ADMIN en Planificación o Urgencias).
