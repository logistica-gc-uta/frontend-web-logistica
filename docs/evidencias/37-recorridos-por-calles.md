# Evidencia · Issue #37 (parte 1) — Recorridos por calles con el motor vial

Primera parte de la #37: la planificación muestra lo que entrega el **motor vial** (backend #47): recorrido por calles,
distancias y duraciones **estimadas**, y qué pasa cuando el motor no está. Los horarios con margen y la capacidad N/4 por
hora (backend #48) y las reglas de rutas del día (backend #49) quedan para una parte siguiente: esas issues del backend
siguen abiertas.

- **Issue:** [#37](https://github.com/logistica-gc-uta/frontend-web-logistica/issues/37)
- **Fecha de ejecución:** 13/11/2026
- **Backend:** `logistica-gc-uta/backend` en `main` @ `1e36c3b` (incluye #47, `docs/issue-47-road-engine.md`)
- **Frontend:** rama `feat/37-recorridos-por-calles` (desde `main` @ `957c019`)
- **Entorno:** Node 26.7.0, pnpm 12.4.2, Vitest 5.0.3, PostgreSQL 16 local (Docker), base aislada, motor vial apagado
  (`ROAD_ENGINE` vacío, como en CI)

## 1. Contrato usado (backend #47)

| Llamada / campo                               | Uso en la web                                                                                                                                 |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /route-proposals?…&includeGeometry=true` | Se pide siempre el trazado; sin motor no llega y no se inventa.                                                                               |
| `distanceMethod`                              | `OSRM_ROAD_NETWORK` → textos «por calles»; `HAVERSINE_STRAIGHT_LINE` → textos «en línea recta».                                               |
| `totalDistanceKm`, `straightLineKm`           | Distancia por calles y la misma visita en línea recta, para contrastar.                                                                       |
| `totalDurationSeconds`, tramos y regreso      | Duración estimada (≈, sin tráfico en vivo) y km/min de cada tramo y del regreso al depósito.                                                  |
| `geometry` (GeoJSON `[lng, lat]`)             | Recorrido por calles dibujado en el mapa.                                                                                                     |
| `GET /route-proposals/road-engine`            | Aviso antes de planificar: activo, desactivado (línea recta) o sin respuesta.                                                                 |
| Errores `ROAD_*`                              | `ROAD_ENGINE_UNAVAILABLE` 503, `ROAD_ENGINE_BAD_RESPONSE` 502, `ROAD_ROUTE_NOT_FOUND`, `ROAD_POINT_OFF_NETWORK`, `ROAD_MATRIX_TOO_LARGE` 422. |
| Urgencias                                     | `distanceMethod` en la propuesta y motivos `ROAD_*` cuando queda bloqueada.                                                                   |

**Alojamiento del motor:** el líder decidió un contenedor Docker de OSRM en la VPS del backend; la VPS todavía no existe
y el motor está apagado por defecto. A la web no le afecta: solo consume el contrato HTTP.

## 2. Qué cambió

| Pieza                | Detalle                                                                                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Aviso del motor      | _Motor vial activo_ / _Motor vial desactivado_ (línea recta) / _El motor vial no responde_ (sin propuestas, no se usa la línea recta como reemplazo; pedidos y rutas guardadas intactos) con _Volver a comprobar_. |
| Aviso de distancias  | Con red vial: «Distancias y duraciones estimadas por calles… sin tráfico en vivo… no es una hora de llegada garantizada». Sin motor: el aviso de km geodésicos.                                                    |
| Resumen              | _Km sin optimizar_ y _Km propuestos_ dicen «(por calles)» o «(en línea recta)».                                                                                                                                    |
| Tarjeta de propuesta | _Distancia por calles_ y _En línea recta_, _Duración estimada_ (≈), km y minutos de cada tramo («desde el depósito» / «desde la parada anterior») y _Regreso al depósito_. Sin motor no aparecen.                  |
| Mapa                 | Con trazado dibuja el recorrido por calles completo; sin trazado conserva las rectas y la leyenda dice que **no** son el camino por las calles. Si solo algunas rutas lo traen, la leyenda lo distingue.           |
| Errores del cálculo  | Mensaje por código, cuántos pedidos afectados, _No se generó ninguna ruta: los pedidos siguen pendientes y las rutas guardadas no cambian_ y botón _Reintentar_.                                                   |
| Urgencias            | «X km por calles, estimados» o «X km estimados en línea recta»; motivos de bloqueo del motor traducidos.                                                                                                           |

La confirmación de propuestas, la asignación de choferes (incluida la ausencia, #36) y las correcciones no cambiaron.

## 3. Pruebas y resultados reales

### 3.1 Unitarias y de componentes

- `pnpm vitest run` con la API apuntando a un puerto vacío (como en CI, sin backend): **800/801 PASS**; la única
  diferencia es la prueba que lee justamente la URL de la API configurada.
- Nuevas: `RoadEngine.test.tsx` (10): formato de duración, cada error `ROAD_*` con pedidos afectados, motivo de urgencia,
  aviso con red vial, tarjeta con tramos y regreso, tarjeta sin motor, pantalla con motor activo (pide trazado y lo pasa
  al mapa), desactivado, sin respuesta con _Volver a comprobar_, y cálculo fallido sin rutas inventadas con _Reintentar_.
  `RoutesMap.test.tsx` (+2): recorrido por calles sin rectas ni regreso punteado, y leyenda mixta.
- Ajustadas: textos «en línea recta» en planificación y urgencias; `getProposals` envía `includeGeometry=true`.

### 3.2 Integración contra el backend real

`src/integration/roadEngine.int.test.ts` → **3/3 PASS** (motor apagado): estado del motor sin URL expuesta; propuestas
con `HAVERSINE_STRAIGHT_LINE`, sin `roadMetrics`, trazado ni duraciones aunque se pida el trazado; CLIENT → 403.
Junto con `planning.int.test.ts` (confirmación, correcciones, 403): **9/9 PASS**.

### 3.3 Verificación en el navegador

Con el motor apagado, como ADMIN en _Planificación_: aviso _Motor vial desactivado_; tras previsualizar, aviso de km
geodésicos, resumen «(en línea recta)», tarjetas con _Distancia en línea recta_ y leyenda del mapa «Son líneas rectas
entre puntos, no el camino por las calles». Sin errores en consola.

El modo con OSRM real no se verificó en el navegador: requiere descargar y procesar el mapa de Ecuador (126 MB) y
levantar el contenedor localmente. Está cubierto con pruebas de componentes que usan la respuesta del contrato.

### 3.4 Calidad

| Comando          | Resultado                                            |
| ---------------- | ---------------------------------------------------- |
| `pnpm lint`      | Sin errores ni avisos en los archivos de esta issue. |
| `pnpm typecheck` | Sin errores.                                         |
| `pnpm build`     | Compila.                                             |

## 4. Pendiente de la #37 y fuera de alcance

- **Pendiente (otra parte):** horas solicitadas con margen configurable de 30 minutos y su control ADMIN (backend #48);
  operar solo rutas del día y no generar ni asignar rutas futuras (backend #49).
- **Fuera de alcance:** navegación GPS del conductor, hora de llegada garantizada, tráfico en vivo y optimización
  duplicada en React.
