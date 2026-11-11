# Evidencia · Issue #32 — Configurar tienda y cobertura en mapa

El panel ADMIN suma la pantalla **Tienda y cobertura** (`/admin/cobertura`, menú _Territorio_). Ahí se ubica la tienda única
de REGALÍA y se dibuja el área general de entrega sobre un mapa Leaflet, conectada al contrato real del backend #41.

- **Issue:** [#32](https://github.com/logistica-gc-uta/frontend-web-logistica/issues/32)
- **Fecha de ejecución:** 10/11/2026
- **Backend:** `logistica-gc-uta/backend` en `main` @ `83ade19` (merge de #41, `docs/store-coverage-contract.md`)
- **Frontend:** rama `feat/32-tienda-cobertura` (desde `main` @ `0c64862`)
- **Entorno:** Node 26.7.0, pnpm 12.4.2, Vitest 5.0.3, PostgreSQL 16 local (Docker), base aislada de desarrollo

## 1. Contrato usado (backend #41)

| Método | Ruta                              | Uso en la web                                                                  |
| ------ | --------------------------------- | ------------------------------------------------------------------------------ |
| `GET`  | `/api/v1/store-coverage`          | Carga inicial. `{ configured: false }` muestra el editor vacío, sin pin falso. |
| `PUT`  | `/api/v1/admin/store-coverage`    | Guardar (solo ADMIN). Reemplaza tienda y polígono a la vez.                    |
| `POST` | `/api/v1/store-coverage/evaluate` | «Probar un punto»: interior y borde aceptados, exterior rechazado.             |

- Puntos en `{ lat, lng }`; polígono GeoJSON `Polygon` con un anillo cerrado de `[lng, lat]`. La conversión y el cierre del
  anillo están en `coverageDraft.ts` y tienen pruebas.
- Errores leídos **por código**: `STORE_COVERAGE_INVALID`, `STORE_LOCATION_INVALID`, `VALIDATION_ERROR`,
  `STORE_NOT_CONFIGURED`, además de 401, 403 y red caída.
- No se inventó ningún endpoint, coordenada de tienda ni área por defecto. La vista inicial del mapa (centro de Ambato)
  es solo el encuadre cuando no hay nada guardado.

## 2. Qué se implementó

| Parte                          | Detalle                                                                                                                                                                                                                                                                                 |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Editor de mapa (`CoverageMap`) | react-leaflet ya instalado, **sin bibliotecas nuevas**. Tres modos: _Ubicar tienda_ (clic y arrastre), _Dibujar área_ (cada clic agrega un vértice numerado; los vértices se arrastran) y _Probar un punto_. El área guardada se dibuja **punteada** debajo del borrador para comparar. |
| Lista de vértices              | Coordenadas de cada punto en orden, con _Quitar_, _Deshacer último punto_ y _Borrar área_: el área se puede revisar y corregir con teclado, no solo con el mouse. Contador `N de 256`.                                                                                                  |
| Estado de guardado             | Siempre visible: sin configurar, _Cambios sin guardar_ (aclarando que la activa sigue siendo la última guardada), _Guardando…_ y _Cobertura activa guardada el …_ con el `updatedAt` del servidor. Solo una respuesta 200 cambia la cobertura activa en pantalla.                       |
| Errores                        | Un rechazo **conserva el dibujo** para corregirlo y dice _No se guardó nada: la cobertura activa sigue siendo la anterior_. El botón se deshabilita mientras guarda (sin doble envío).                                                                                                  |
| Revisión previa                | Antes de enviar solo se revisa lo mínimo (tienda ubicada, 3 a 256 puntos). Cruces, área cero y puntos repetidos los valida **el servidor**.                                                                                                                                             |
| Reglas visibles                | Dentro o sobre el borde se acepta, fuera se rechaza, y _lo decide el servidor, no el mapa_. Cambiar el área **no cancela ni modifica pedidos ya aceptados**.                                                                                                                            |
| Fuente del mapa                | Teselas de OpenStreetMap con su atribución, las mismas que ya usaban los mapas de pedidos y rutas. Leaflet solo dibuja: no calcula rutas ni decide la cobertura.                                                                                                                        |
| Permisos                       | La ruta está dentro del panel ADMIN protegido. El backend también protege la escritura (403 para CLIENT, 401 sin sesión válida).                                                                                                                                                        |
| Zonas                          | La pantalla _Zonas_ se mantiene: el backend sigue usando `zoneId` hasta que se cierren las issues backend #42 y #48.                                                                                                                                                                    |

## 3. Pruebas y resultados reales

### 3.1 Unitarias y de componentes (`pnpm vitest run src/features/store-coverage`)

**3 archivos, 23 pruebas: PASS.**

- `coverageLogic.test.ts` (10): conversión GeoJSON y cierre del anillo, borrador vacío sin configuración, detección de
  cambios, revisión previa (tienda, mínimo 3, máximo 256), cuerpo del `PUT`, rutas del servicio y mensajes por código
  de error (400, 401, 403, 409 y red).
- `CoverageMap.test.tsx` (3): área guardada punteada y borrador encima, línea con 2 puntos, arrastre de vértices solo en
  _Dibujar área_ y de la tienda solo en _Ubicar tienda_, redondeo del clic y resultado de la prueba.
- `StoreCoveragePage.test.tsx` (10): sin configuración, flujo completo (ubicar → dibujar → guardar → activa), menos de 3
  puntos sin llamar al servidor, **rechazo `STORE_COVERAGE_INVALID` que conserva el dibujo y no presenta el área como
  activa**, 403, deshacer/borrar/descartar, prueba de punto (borde y exterior), error al probar sin inventar resultado,
  error de carga con reintento y la opción en el menú.

### 3.2 Integración contra el backend real (`pnpm vitest run --config vitest.integration.config.ts src/integration/storeCoverage.int.test.ts`)

**6 pruebas: PASS.**

| Ejemplo de la issue / caso                    | Resultado real                                                                           |
| --------------------------------------------- | ---------------------------------------------------------------------------------------- |
| ADMIN guarda el área A y vuelve a leer        | `PUT` 200 y `GET` devuelve exactamente lo persistido.                                    |
| Interior, borde y exterior                    | `INTERIOR` y `BOUNDARY` con `accepted: true`; `EXTERIOR` con `accepted: false`.          |
| Falla el guardado del área B (lados cruzados) | 400 `STORE_COVERAGE_INVALID`; `GET` sigue devolviendo el área A (sin cambios parciales). |
| Ubicación fuera de rango                      | 400 y la tienda guardada no cambia.                                                      |
| Un CLIENT intenta guardar                     | 403, mensaje _Solo un ADMIN…_, y la configuración no cambia.                             |
| Token inválido                                | 401.                                                                                     |

La configuración es única: la prueba guarda la que había antes y la restaura al terminar. Como la base local no tenía
configuración, quedó guardada el área de prueba A (no existe un endpoint para dejarla sin configurar).

### 3.3 Verificación en el navegador (backend y frontend locales)

- `/admin/cobertura` carga la configuración guardada y muestra _Cobertura activa guardada el 10/11/2026, 22:45_.
- _Probar un punto_: clic fuera → `POST /evaluate` 200 y _Fuera de la cobertura_; clic dentro → _Dentro de la cobertura_.
- **Defecto encontrado y corregido:** el marcador de la tienda capturaba el clic en _Probar un punto_. Ahora solo es
  interactivo en _Ubicar tienda_.
- _Dibujar área_: un clic agrega el punto 5 y aparece _Cambios sin guardar_; _Descartar cambios_ vuelve a los 4 puntos guardados.
- En móvil (375 px) no hay desplazamiento horizontal; sin errores en la consola.

### 3.4 Calidad

| Comando          | Resultado                                                                        |
| ---------------- | -------------------------------------------------------------------------------- |
| `pnpm lint`      | Sin errores; solo avisos previos en archivos del Shop que esta issue no toca.    |
| `pnpm typecheck` | Sin errores.                                                                     |
| `pnpm build`     | Compila.                                                                         |
| `pnpm test`      | 79 archivos, **733 de 734 PASS**. Falla 1 prueba ajena a esta issue (ver abajo). |

**Prueba ajena que falla:** `OrdersPage.test.tsx › lista los pedidos persistidos…` espera que el primer `status` diga
_Cargando_. **Ya falla en `main` @ `0c64862`**: el CI de `main` está en rojo desde el merge del PR #40 (modo oscuro),
en el paso de pruebas ([run 42925982589](https://github.com/logistica-gc-uta/frontend-web-logistica/actions/runs/42925982589)).
Esta issue no toca pedidos; se reporta al equipo en lugar de corregirla aquí.

## 4. Fuera de alcance y pendientes

- Sin generación ni optimización de rutas, GPS ni cambios automáticos de pedidos existentes.
- El checkout todavía pide zona: lo adapta la issue #33 cuando exista backend #42.
- No hay forma de dejar la configuración vacía (el contrato no tiene `DELETE`), así que no se ofrece.
