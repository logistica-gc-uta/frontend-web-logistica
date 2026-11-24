# Evidencia · Issue #69 — E2E de cancelación y disponibilidad en tienda en un entorno aislado

Este documento cubre dos recorridos en el navegador, con el **frontend**, el **backend real** y un **PostgreSQL descartable** con datos sintéticos:

1. **Cancelación desde Planificación.** Una ruta asignada y sin iniciar se cancela con motivo. Sus pedidos vuelven a planificación sin cancelarse y la ruta conserva su historial. Una ruta iniciada no ofrece la acción.
2. **Disponibilidad en tienda en Entregas fallidas.** El contacto es posible antes de confirmar. Reprogramar y acordar el retiro quedan bloqueados hasta confirmar la disponibilidad del intento actual. La pantalla se actualiza y la confirmación persiste al recargar, sin reintento automático.

Esto amplía la suite de [#10](10-e2e-playwright.md) y no la reemplaza. Lo agregado por los PR #63 y logistica-gc-uta/backend#81 se prueba aquí por primera vez en el navegador con ambos servicios conectados.

- **Issue:** [#69](https://github.com/logistica-gc-uta/frontend-web-logistica/issues/69)
- **Fecha de ejecución:** 20/11/2026 (noche, hora de Guayaquil)
- **Prueba:** [`e2e/08-cancelacion-y-disponibilidad.spec.ts`](../../e2e/08-cancelacion-y-disponibilidad.spec.ts)

## 1. Aislamiento

| Pieza      | Entorno aislado                                                                                   | Desarrollo (no se toca)           |
| ---------- | ------------------------------------------------------------------------------------------------- | --------------------------------- |
| PostgreSQL | `regalia_e2e_postgres`, `127.0.0.1:55432`, datos en **tmpfs** (memoria)                           | `logistica_postgres`, puerto 5432 |
| Backend    | `backend` real, `node dist/main`, puerto **3101**                                                 | `start:dev`, puerto 3000          |
| Panel      | `vite --port 5181 --strictPort`, nunca reutiliza un servidor abierto                              | `pnpm dev`, puerto 5173           |
| Motor vial | `ROAD_ENGINE=HAVERSINE` (sin OSRM)                                                                | OSRM local                        |
| Datos      | `prisma db migrate` + `seed` sobre la base vacía; cada prueba crea sus propios pedidos `E2E 69 …` | —                                 |

- El `.env` del backend no se modifica. Las variables del entorno aislado se pasan al proceso y tienen prioridad.
- La prueba se **omite** si no se ejecuta con `E2E_AISLADO=1` y una API local en el puerto 3101 ([`e2e/support/aislado.ts`](../../e2e/support/aislado.ts)). Así nunca corre contra la base de desarrollo ni contra un servicio desplegado. Sin `E2E_AISLADO`, el resultado es `3 skipped`.
- En la base descartable se abre el horario de entrega a 00:00–23:59, porque asignar exige rutas de **hoy**. Así el recorrido se repite a cualquier hora, salvo en los últimos 40 minutos del día, en que se omite.

## 2. Versiones

| Componente            | Versión                                                           |
| --------------------- | ----------------------------------------------------------------- |
| Backend               | `logistica-gc-uta/backend` en `main` @ `8cccc37` (27 migraciones) |
| Frontend              | `main` @ `392fb46` + esta rama                                    |
| PostgreSQL            | 16.15 (`postgres:16-alpine`)                                      |
| Node / pnpm           | 26.7.0 / 12.4.2                                                   |
| Playwright / Chromium | 1.64.1 / 156.0.8078.4                                             |
| Docker                | 29.7.2                                                            |

## 3. Paso a paso (PowerShell, desde `frontend-web-logistica`)

Requisitos: Docker en marcha, el backend clonado junto a este repositorio (`../backend`, con `pnpm install`) y `.env.integration.local` completo con los usuarios del seed (sus credenciales no van al repositorio).

```powershell
# 1. Base descartable: la recrea vacía, migra y carga el seed.
./e2e/aislado/entorno.ps1 preparar

# 2. Backend real contra esa base (deja la terminal ocupada; usar otra terminal).
./e2e/aislado/entorno.ps1 backend

# 3. Pruebas (Playwright levanta el panel en el 5181).
$env:E2E_AISLADO = '1'
$env:VITE_API_URL = 'http://localhost:3101/api/v1'
pnpm test:e2e e2e/08-cancelacion-y-disponibilidad.spec.ts
# Con capturas de evidencia: $env:E2E_CAPTURAS = '1' antes del comando.

# 4. Limpieza: baja la base; como vive en memoria, no queda ningún dato.
./e2e/aislado/entorno.ps1 limpiar
```

La prueba se puede repetir sobre la misma base. Al final, el chofer cierra y regresa la ruta iniciada, así que queda disponible para la siguiente ejecución.

## 4. Qué comprueba

| Prueba                                         | En el navegador                                                                                                                                                       | En el servidor (API real)                                                                                                                                                             |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cancelar una ruta asignada sin iniciar         | En «Rutas guardadas» de Planificación: sin motivo no envía nada; con motivo, la ruta queda «Cancelada (CANCELLED)» con su motivo y sin el botón; persiste al recargar | `CANCELLED` con su motivo; la parada sigue en la ruta (historial); el pedido queda en **`PENDING`, no `CANCELLED`**, sin otra ruta; el chofer queda libre                             |
| Ruta iniciada (negativa)                       | «En curso (IN_PROGRESS)» **sin** «Cancelar ruta»                                                                                                                      | `CANCEL_ROUTE` responde **409** y la ruta sigue `IN_PROGRESS`                                                                                                                         |
| Entrega fallida antes de confirmar (negativas) | «Reprogramar con este acuerdo» deshabilitado con el motivo en español; «El cliente retirará en tienda» deshabilitado                                                  | Caso `WAITING_STORE_READINESS`; `CONTACT` permitido                                                                                                                                   |
| Contacto antes de confirmar                    | Se registra el contacto con acuerdo (mañana 10:00–11:00); reprogramar **sigue** bloqueado                                                                             | —                                                                                                                                                                                     |
| Confirmar la disponibilidad                    | Con motivo, la tarjeta muestra «Disponibilidad en tienda confirmada» y reprogramar se habilita; persiste al recargar                                                  | `readiness.attemptId` = intento fallido **actual**; `RESCHEDULE` y `PICKUP_AGREE` permitidos; el pedido sigue solo en su ruta original (**sin reintento automático**) y no se cancela |

## 5. Resultado

Primera ejecución sobre la base recién creada:

```
Running 4 tests using 1 worker
  ok 1 [setup] › e2e\auth.setup.ts › sesión ADMIN
  ok 2 [chromium] › 08-cancelacion-y-disponibilidad.spec.ts › Planificación cancela con motivo una ruta asignada sin iniciar y sus pedidos vuelven sin cancelarse
  ok 3 [chromium] › 08-cancelacion-y-disponibilidad.spec.ts › una ruta iniciada no ofrece «Cancelar ruta» y el servidor también la rechaza
  ok 4 [chromium] › 08-cancelacion-y-disponibilidad.spec.ts › Entregas fallidas: contacto antes de confirmar, reprogramar y retiro bloqueados, y disponibilidad confirmada que persiste
  4 passed (12.0s)
```

Repetición sobre la misma base: 5 de 5 ejecuciones seguidas con `4 passed` (entre 15 y 22 s).

Durante el desarrollo de la prueba apareció un fallo intermitente. La prueba esperaba ver la notificación de éxito, que se va sola y puede desaparecer con la recarga en vivo. Ahora se comprueba lo que queda en la tarjeta y en el servidor, y el caso se ubica por el id del pedido.

## 6. Capturas

En [`capturas/69-e2e-aislado/`](capturas/69-e2e-aislado/), generadas por la prueba con `E2E_CAPTURAS=1`:

| Archivo                                            | Muestra                                                       |
| -------------------------------------------------- | ------------------------------------------------------------- |
| `01-cancelar-con-motivo.png`                       | Confirmación de la cancelación: «Los pedidos no se cancelan…» |
| `02-ruta-cancelada-con-historial.png`              | Ruta cancelada con su parada, chofer, fecha y motivo          |
| `03-ruta-iniciada-sin-cancelar.png`                | Ruta en curso sin «Cancelar ruta»                             |
| `04-retiro-bloqueado-antes-de-confirmar.png`       | Retiro en tienda bloqueado antes de confirmar                 |
| `05-contacto-registrado-reprogramar-bloqueado.png` | Contacto registrado y reprogramar todavía bloqueado           |
| `06-disponibilidad-confirmada.png`                 | Disponibilidad confirmada y reprogramar habilitado            |
| `07-persiste-al-recargar.png`                      | La confirmación sigue al abrir la página de nuevo             |
