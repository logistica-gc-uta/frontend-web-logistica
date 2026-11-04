# frontend-web-logistica

Aplicación web administrativa del Sistema de Gestión de Entregas y Rutas (UTA).
Construida con **React 19 + Vite + TypeScript**.

## Requisitos

- Node.js >= 26
- pnpm >= 12
- Backend corriendo en `http://localhost:3000` (repositorio `backend`)

## Puesta en marcha

```bash
pnpm install
cp .env.example .env
pnpm dev
```

La aplicación queda disponible en `http://localhost:5173`.

## Variables de entorno

| Variable       | Descripción             | Valor por defecto              |
| :------------- | :---------------------- | :----------------------------- |
| `VITE_API_URL` | URL base de la API REST | `http://localhost:3000/api/v1` |

## Scripts

| Script                  | Descripción                                                                 |
| :---------------------- | :-------------------------------------------------------------------------- |
| `pnpm dev`              | Servidor de desarrollo                                                      |
| `pnpm build`            | Verificación de tipos y build de producción                                 |
| `pnpm preview`          | Sirve el build de producción                                                |
| `pnpm lint`             | Análisis estático con oxlint                                                |
| `pnpm format`           | Formatea el código con Prettier                                             |
| `pnpm format:check`     | Verifica el formato sin modificar archivos                                  |
| `pnpm typecheck`        | Verificación de tipos de TypeScript                                         |
| `pnpm test`             | Pruebas de componentes (Vitest + Testing Library)                           |
| `pnpm test:watch`       | Pruebas en modo observación                                                 |
| `pnpm test:coverage`    | Pruebas con reporte de cobertura (`coverage/index.html`)                    |
| `pnpm test:integration` | Pruebas de integración contra el backend real (ver abajo)                   |
| `pnpm test:e2e`         | Pruebas E2E en el navegador (Playwright) contra el backend real (ver abajo) |

## Pruebas de integración

`pnpm test:integration` ejecuta `src/integration/**/*.int.test.ts` contra la API real (NestJS + PostgreSQL), **sin mocks**.
No forma parte de `pnpm test` ni del CI porque necesita el backend levantado.

1. Levantar el backend (`docker compose up -d`, `pnpm prisma db init`, `pnpm run seed`, `pnpm run start:dev`).
2. Copiar `.env.integration.example` a `.env.integration.local` y completar las contraseñas del seed (README del backend).
3. Ejecutar `pnpm test:integration`.

Cada ejecución crea zonas, productos y pedidos con prefijo `IT` y un sufijo único; los pedidos usan un producto propio de la ejecución, así que no consumen el stock del seed. Evidencia: [`docs/evidencias/4-integracion-real.md`](docs/evidencias/4-integracion-real.md) (login, zonas y productos), [`docs/evidencias/6-pedidos-leaflet.md`](docs/evidencias/6-pedidos-leaflet.md) (pedidos), [`docs/evidencias/7-panel-planificacion.md`](docs/evidencias/7-panel-planificacion.md) (planificación), [`docs/evidencias/8-bandeja-urgencias.md`](docs/evidencias/8-bandeja-urgencias.md) (urgencias), [`docs/evidencias/9-seguimiento-tiempo-real.md`](docs/evidencias/9-seguimiento-tiempo-real.md) (tiempo real) , [`docs/evidencias/13-entregas-fallidas.md`](docs/evidencias/13-entregas-fallidas.md) (entregas fallidas) , [`docs/evidencias/19-shop-catalogo.md`](docs/evidencias/19-shop-catalogo.md) (Shop) y [`docs/evidencias/20-shop-checkout.md`](docs/evidencias/20-shop-checkout.md) (compra en el Shop).

Las pruebas de planificación usan un día propio al azar (entre 2050 y 2079), porque las rutas confirmadas quedan guardadas y reservan sus pedidos. **Nunca asignan choferes**: una asignación real deja al chofer ocupado hasta recrear la base (`seed:reset-drivers` no lo libera).

Las pruebas de urgencias crean pedidos de **hoy** (la bandeja solo muestra el día actual) en una zona propia de la ejecución; cerca de la medianoche se omiten. Tampoco asignan choferes.

Las pruebas de tiempo real se conectan al Socket.IO del backend (`/realtime`): comprueban la autenticación del handshake, los permisos de suscripción y que un cambio real en una ruta llegue como evento.

Entre las de integración, las de entregas fallidas son las **únicas que asignan al chofer del seed**: con sus credenciales (`src/integration/support/driver.ts`, los mismos endpoints que la app Flutter) inicia la ruta de hoy, registra una entrega y una visita fallida, la completa y confirma el regreso al depósito. Al terminar siempre cierra lo que quedó abierto, así el chofer vuelve a estar disponible. Necesitan que el chofer esté disponible al empezar y unas 3 horas libres en el día; si no, se omiten.

Las pruebas del Shop crean, como ADMIN, su propia categoría y regalos con una imagen PNG que el backend sube a **Cloudinary**: necesitan las claves de prueba (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` y `CLOUDINARY_API_SECRET`) en el `.env` del backend, nunca en este repositorio. Consultan la tienda sin sesión, como un visitante, y restauran el límite por SKU que cambian.

Las pruebas de compra (`shopCheckout.int.test.ts`) registran clientes nuevos y pagan con las **tarjetas de demostración** del backend. Requieren el simulador de pagos habilitado (`NODE_ENV=demo` y `SIMULATED_PAYMENTS_ENABLED=true` en el `.env` del backend) y las 3 tarjetas en la tabla `simulatedCard`. Fijan el IVA simulado en 15 % y al terminar restauran el valor anterior; los pagos son de $1, así que casi no consumen el saldo ficticio.

## Pruebas E2E (Playwright)

`pnpm test:e2e` abre el panel en **Chromium** y lo recorre como un ADMIN contra el backend real y PostgreSQL, **sin mocks de la API**. Usa el mismo `.env.integration.local` que las pruebas de integración y levanta `pnpm dev` si no está corriendo. No forma parte de `pnpm test` ni del CI porque necesita el backend.

1. Levantar el backend como para las pruebas de integración, con el chofer del seed disponible.
2. Instalar el navegador una sola vez: `pnpm exec playwright install chromium`.
3. Ejecutar `pnpm test:e2e` (o un archivo: `pnpm test:e2e e2e/02-pedido-a-ruta.spec.ts`).

| Archivo                  | Qué recorre                                                                                                                                                                                                                                           |
| :----------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01-login`               | Redirección sin sesión, login ADMIN, contraseña incorrecta y rol CLIENT rechazado                                                                                                                                                                     |
| `02-pedido-a-ruta`       | **Flujo completo:** alta con ubicación confirmada en el mapa → previsualizar dos veces sin guardar → ruta DRAFT confirmada una sola vez (doble clic) → corrección de paradas                                                                          |
| `03-validaciones-pedido` | Errores del formulario sin enviar nada y rechazo real del backend cuando otro pedido se lleva el stock                                                                                                                                                |
| `04-operacion-del-dia`   | Con el chofer del seed: ruta en curso sin acciones (y 409 en la API), urgencia sin cupo, seguimiento en vivo hasta el regreso del chofer, entrega fallida → contacto → reprogramación → segunda ruta entregada sin perder la visita fallida           |
| `05-fallas-simuladas`    | **Simuladas** (la falla se inyecta en la red del navegador): 409, 403, tiempo de espera agotado, sin conexión y pérdida del tiempo real, siempre sin éxito falso y con reintento                                                                      |
| `06-compra-shop`         | Compra CLIENT en el Shop: carrito de visitante → registro → checkout con mapa y horario → pago rechazado y aprobado → comprobante e historial; [simulada] respuesta del pago perdida que se verifica sin cobrar dos veces; CLIENT sin acceso al panel |

Cada ejecución crea su propia zona, producto y pedidos con prefijo `E2E`. Las rutas de planificación usan un día al azar entre 2050 y 2079. `04-operacion-del-dia` asigna al chofer del seed y siempre lo deja disponible al terminar; necesita unas 3 horas libres en el día y, si no, se omite.

Si una prueba falla, en `test-results/` quedan la captura, el video, la traza (`pnpm exec playwright show-trace <ruta>/trace.zip`) y el contexto del error; el reporte HTML queda en `playwright-report/`. Para reportarla se usa la plantilla de issue **Fallo de prueba E2E**. Con `E2E_CAPTURAS=1` las pruebas guardan además las capturas de evidencia en `docs/evidencias/capturas/10-e2e-playwright/`.

Estas pruebas cubren solo el **panel web**: la app Flutter no se prueba con Playwright. Las acciones del chofer se hacen con la API, con los mismos endpoints que la app. Evidencia: [`docs/evidencias/10-e2e-playwright.md`](docs/evidencias/10-e2e-playwright.md).

## Estructura

```
src/
├── app/            # Componente raíz, rutas, constantes de paths y menú de navegación
├── components/
│   ├── layout/     # AppLayout (encabezado y menú) y ResourcePage (formulario + listado)
│   ├── map/        # LocationPicker (elegir y confirmar una ubicación), RoutesMap (dibujar rutas) e iconos
│   └── ui/         # Button, Field, TextField, SelectField, Alert, DataTable, AsyncContent, Pagination
├── config/         # Lectura centralizada de variables de entorno
├── features/
│   ├── auth/       # Login, sesión (AuthProvider / useAuth) y rutas protegidas
│   ├── dispatch/   # Urgencias: bandeja del día, decisiones auditadas e historial
│   ├── incidents/  # Entregas fallidas: intento, historial de visitas, contacto y reprogramación acordada
│   ├── monitor/    # Seguimiento en tiempo real: progreso de rutas, incidencias y estado del chofer
│   ├── orders/     # Registro de pedidos con mapa y listado paginado con filtros
│   ├── planning/   # Planificación: propuestas Clarke & Wright, mapa, confirmación, corrección de paradas y asignación de chofer
│   ├── shop/       # Tienda pública REGALÍA: inicio, catálogo con filtros en la URL, detalle y carrito compartido
│   ├── products/   # Listado y creación de productos
│   └── zones/      # Listado y creación de zonas de entrega
├── hooks/          # useForm, useFetch, useAsyncAction, useKeyedActions y useRealtimeUpdates (tiempo real)
├── integration/    # Pruebas de integración contra el backend real (pnpm test:integration)
├── lib/
│   ├── auth/       # Persistencia de la sesión (token JWT + usuario)
│   ├── errors/     # AppError: errores con mensaje para el usuario
│   ├── format/     # Formato de fechas, fecha y hora (Guayaquil), moneda, distancias y porcentajes
│   ├── http/       # Cliente axios compartido, manejo de errores de la API y de acciones administrativas
│   ├── planning/   # Motivos por los que un pedido no se puede planificar o despachar (compartidos)
│   ├── realtime/   # Cliente Socket.IO (token en el handshake, suscripciones y eventos)
│   ├── time/       # Huso horario operativo (Guayaquil) y conversión a ISO 8601
│   └── validation/ # Validadores genéricos de formularios
├── pages/          # Pantallas generales (inicio, 404)
├── styles/         # Estilos de pantallas específicas (planificación, urgencias, entregas fallidas, seguimiento y Shop)
├── types/          # Tipos de dominio compartidos
└── test/           # Configuración, fixtures y utilidades compartidas de pruebas
```

Fuera de `src/`, `e2e/` contiene las pruebas de Playwright: un archivo por flujo y `support/` (cliente de la API real, datos de prueba, acciones del chofer y capturas de evidencia).

### Planificación de rutas (`/planificacion`)

- **Previsualizar** (`GET /route-proposals`) solo calcula: se puede repetir sin guardar nada.
- **Confirmar** (`POST /routes`) guarda una propuesta como ruta `DRAFT` (sin chofer); **Confirmar todas** lo hace una por una y, si una falla, las demás se guardan igual.
- En **Rutas guardadas** del día, una ruta `DRAFT` puede recibir un chofer disponible (`POST /routes/{id}/assign`) y pasa a `ASSIGNED`.
- Antes de iniciarse (`DRAFT` o `ASSIGNED`), **Corregir paradas** permite reordenarlas o mover un pedido a otra ruta del mismo día y zona con lugar (`POST /dispatch/interventions`, acciones `REORDER` y `MOVE`). Cada corrección pide un motivo, que el backend audita.
- Una ruta `ASSIGNED` todavía no iniciada puede **cambiar de chofer** (con motivo). Los choferes ocupados se muestran deshabilitados hasta que regresen al depósito.
- Las rutas `IN_PROGRESS` y `COMPLETED` se muestran sin acciones.
- Las distancias son en **línea recta** (Haversine), no por calles; el ahorro se compara con visitar cada pedido en un viaje aparte.

### Urgencias (`/urgencias`)

- La bandeja (`GET /dispatch/inbox`) muestra los pedidos de **hoy** por despachar con la propuesta del backend: insertar en una ruta sin iniciar con lugar, salida nueva o bloqueado con motivo.
- Decisiones auditadas (`POST /dispatch/interventions`): insertar o crear salida nueva (`CONFIRM`), rechazar (`REJECT`, el pedido sigue pendiente), priorizar (`PRIORITIZE`) y reprogramar (`CONTACT` + `RESCHEDULE`). Todas piden un motivo y solo se dan por hechas si el backend devuelve el resultado esperado.
- Las entregas fallidas se cuentan, pero se gestionan en [Entregas fallidas](#entregas-fallidas-entregas-fallidas). El historial del día (`GET /dispatch/audit`) muestra quién decidió qué, cuándo y por qué.

### Entregas fallidas (`/entregas-fallidas`)

- Muestra los pedidos cuyo último intento falló (`GET /dispatch/inbox`): motivo tipificado, fecha y hora, ruta original, chofer, historial de visitas (`GET /routes`) y gestiones registradas (`GET /dispatch/audit`). Un intento fallido **no** cancela ni entrega el pedido: queda en revisión con su estado actual.
- **Registrar contacto** (`CONTACT`): _se acordó una nueva entrega_ (con día y franja futura en hora de Guayaquil) o _no se logró acordar_, siempre con un motivo.
- **Reprogramar con este acuerdo** (`RESCHEDULE`) solo se habilita con un acuerdo registrado y la ruta original completada. El pedido vuelve a `PENDING` para planificarse ese día; sus visitas anteriores se conservan.
- El backend no permite consultar después el día y la franja de un contacto: el acuerdo se recuerda mientras la pantalla está abierta. Si se recarga antes de reprogramar, hay que registrar el contacto de nuevo.

### Shop público REGALÍA (`/shop`)

- Zona pública, **sin sesión** y separada del panel: `ShopLayout` con su propia cabecera (marca, Inicio, Catálogo, buscador y contador del carrito), sin accesos ADMIN.
- **Inicio** (`/shop`): categorías con regalos publicados (`GET /shop/categories`) y destacados (`GET /shop/products`).
- **Catálogo** (`/shop/catalogo`): paginado en el servidor, con búsqueda, categoría, precio mínimo/máximo, «Solo disponibles» y orden. Todo queda en la URL (`?q=…&categoria=…&min=…&max=…&disponibles=1&orden=…&pagina=…`), así que volver desde el detalle conserva la vista. Los precios en dólares se convierten a centavos con enteros.
- **Detalle** (`/shop/productos/:id`): galería, stock y cantidad hasta min(stock, límite por SKU de `GET /shop/settings`) menos lo que ya está en el carrito.
- **Carrito compartido** (`features/shop/cart`): `useCart()` con `addItem(productId, quantity)` y el contador; guarda solo productos y cantidades en el navegador. El checkout (#20) parte de él.
- Un regalo solo aparece si el backend lo publica con una imagen principal de Cloudinary.

### Compra en el Shop (cliente CLIENT)

- **Cuenta** (`/shop/registro`, `/shop/login`): sesión CLIENT propia del Shop (`regalia.session`), separada de la del panel. El registro envía solo nombre, correo y contraseña; el backend asigna el rol. Las rutas de compra y pedidos (`RequireCustomer`) llevan al login y vuelven al paso exacto.
- **Carrito** (`/shop/carrito`): guarda solo productos y cantidades, por cuenta. Al abrirlo revalida precio, stock y límite por SKU con la API; marca las líneas agotadas o inválidas y bloquea el checkout. El resumen es una **estimación** rotulada.
- **Checkout** (`/shop/checkout`): entrega con mapa y horario de Ecuador (ventana de `/shop/settings`), cotización del servidor (`POST /shop/checkout/quote`) y aceptación explícita si el total cambia.
- **Pago** (`/shop/pago`): tarjetas ficticias con `Idempotency-Key` por intento. Un rechazo conserva el carrito; un resultado incierto se verifica con `GET /shop/checkout-attempts/{clave}` sin volver a cobrar. La tarjeta nunca se guarda.
- **Pedidos** (`/shop/mis-pedidos`): confirmación (vacía el carrito cuando el servidor confirma), historial, detalle con la línea de tiempo del backend y comprobante simulado imprimible, sin validez tributaria.

### Seguimiento en tiempo real (`/seguimiento`)

- Muestra las rutas de hoy con chofer: estado de la ruta, **entregas exitosas** (por ejemplo, 3 de 4 = 75 %) separadas de las **visitas resueltas** (4 de 4 con 1 fallida), el resultado de cada parada con su motivo tipificado y el estado del chofer (ocupado, retornando al depósito o disponible tras el regreso confirmado).
- Se conecta al Socket.IO del backend (`/realtime`) con el token solo en el handshake y se suscribe a cada ruta, sus pedidos, su chofer y las incidencias (`src/lib/realtime/realtimeClient.ts`).
- Los eventos solo **avisan** que algo cambió: la pantalla vuelve a consultar `GET /routes` y `GET /drivers`, así que un evento repetido o fuera de orden no deshace un estado más reciente. Al reconectar se suscribe de nuevo y vuelve a consultar (`src/hooks/useRealtimeUpdates.ts`).
- Muestra si está _En vivo_, si se perdió o recuperó la conexión y la hora de la última actualización. No incluye GPS ni tiempos estimados de llegada.

### Autenticación

- El login (`POST /auth/login`) solo permite el ingreso de usuarios con rol `ADMIN`.
- La sesión se guarda en `localStorage` y se restaura al recargar la página.
- Si el backend responde `401` a una petición autenticada (token vencido), la sesión se cierra automáticamente.
- Las páginas privadas se declaran dentro de `<ProtectedRoute />` en `src/app/App.tsx`.

### Convenciones

- Cada funcionalidad vive en `src/features/<nombre>/` (servicio, componentes, validación y pruebas).
- Las páginas administrativas usan `ResourcePage`; los formularios, `useForm`; y las listas, `useFetch` + `AsyncContent` + `DataTable`.
- Las fechas de entrega se capturan y muestran en **hora de Guayaquil (UTC-5)** y se envían al backend como ISO 8601 con desfase explícito (`lib/time/guayaquil.ts`).
- El mapa usa Leaflet con teselas de OpenStreetMap (requiere internet); en las pruebas de componentes se simula, porque Leaflet no se dibuja en jsdom.
- Para agregar un módulo: crear su carpeta en `features/`, su ruta en `paths.ts` y `App.tsx`, y su entrada en `navigation.ts`.
- Las pruebas viven junto al archivo que prueban (`Componente.test.tsx`) y usan `renderWithProviders`.
- Toda petición al backend usa `apiClient` (`src/lib/http/apiClient.ts`), que agrega el token automáticamente.
- Los mensajes de error de la API se obtienen con `getErrorMessage` (`src/lib/http/apiError.ts`).
- Las rutas se referencian con las constantes de `src/app/paths.ts`.
- Los servicios copian solo los campos que usa la interfaz: así no entran al estado datos sensibles que el backend envía de más (por ejemplo, el hash de contraseña en `GET /routes` y `GET /drivers`).
- Trabajo en ramas `feat/*` desde `main`, integradas mediante Pull Request.
