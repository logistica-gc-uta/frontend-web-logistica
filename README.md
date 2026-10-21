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

| Script                  | Descripción                                               |
| :---------------------- | :-------------------------------------------------------- |
| `pnpm dev`              | Servidor de desarrollo                                    |
| `pnpm build`            | Verificación de tipos y build de producción               |
| `pnpm preview`          | Sirve el build de producción                              |
| `pnpm lint`             | Análisis estático con oxlint                              |
| `pnpm format`           | Formatea el código con Prettier                           |
| `pnpm format:check`     | Verifica el formato sin modificar archivos                |
| `pnpm typecheck`        | Verificación de tipos de TypeScript                       |
| `pnpm test`             | Pruebas de componentes (Vitest + Testing Library)         |
| `pnpm test:watch`       | Pruebas en modo observación                               |
| `pnpm test:coverage`    | Pruebas con reporte de cobertura (`coverage/index.html`)  |
| `pnpm test:integration` | Pruebas de integración contra el backend real (ver abajo) |

## Pruebas de integración

`pnpm test:integration` ejecuta `src/integration/**/*.int.test.ts` contra la API real (NestJS + PostgreSQL), **sin mocks**.
No forma parte de `pnpm test` ni del CI porque necesita el backend levantado.

1. Levantar el backend (`docker compose up -d`, `pnpm prisma db init`, `pnpm run seed`, `pnpm run start:dev`).
2. Copiar `.env.integration.example` a `.env.integration.local` y completar las contraseñas del seed (README del backend).
3. Ejecutar `pnpm test:integration`.

Cada ejecución crea zonas, productos y pedidos con prefijo `IT` y un sufijo único; los pedidos usan un producto propio de la ejecución, así que no consumen el stock del seed. Evidencia: [`docs/evidencias/4-integracion-real.md`](docs/evidencias/4-integracion-real.md) (login, zonas y productos), [`docs/evidencias/6-pedidos-leaflet.md`](docs/evidencias/6-pedidos-leaflet.md) (pedidos), [`docs/evidencias/7-panel-planificacion.md`](docs/evidencias/7-panel-planificacion.md) (planificación) y [`docs/evidencias/8-bandeja-urgencias.md`](docs/evidencias/8-bandeja-urgencias.md) (urgencias).

Las pruebas de planificación usan un día propio al azar (entre 2050 y 2079), porque las rutas confirmadas quedan guardadas y reservan sus pedidos. **Nunca asignan choferes**: una asignación real deja al chofer ocupado hasta recrear la base (`seed:reset-drivers` no lo libera).

Las pruebas de urgencias crean pedidos de **hoy** (la bandeja solo muestra el día actual) en una zona propia de la ejecución; cerca de la medianoche se omiten. Tampoco asignan choferes.

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
│   ├── orders/     # Registro de pedidos con mapa y listado paginado con filtros
│   ├── planning/   # Planificación: propuestas Clarke & Wright, mapa, confirmación, corrección de paradas y asignación de chofer
│   ├── products/   # Listado y creación de productos
│   └── zones/      # Listado y creación de zonas de entrega
├── hooks/          # useForm, useFetch (carga de datos), useAsyncAction y useKeyedActions (acciones por recurso)
├── integration/    # Pruebas de integración contra el backend real (pnpm test:integration)
├── lib/
│   ├── auth/       # Persistencia de la sesión (token JWT + usuario)
│   ├── errors/     # AppError: errores con mensaje para el usuario
│   ├── format/     # Formato de fechas, fecha y hora (Guayaquil), moneda, distancias y porcentajes
│   ├── http/       # Cliente axios compartido, manejo de errores de la API y de acciones administrativas
│   ├── planning/   # Motivos por los que un pedido no se puede planificar o despachar (compartidos)
│   ├── time/       # Huso horario operativo (Guayaquil) y conversión a ISO 8601
│   └── validation/ # Validadores genéricos de formularios
├── pages/          # Pantallas generales (inicio, 404)
├── styles/         # Estilos de pantallas específicas (planning.css)
├── types/          # Tipos de dominio compartidos
└── test/           # Configuración, fixtures y utilidades compartidas de pruebas
```

### Planificación de rutas (`/planificacion`)

- **Previsualizar** (`GET /route-proposals`) solo calcula: se puede repetir sin guardar nada.
- **Confirmar** (`POST /routes`) guarda una propuesta como ruta `DRAFT` (sin chofer); **Confirmar todas** lo hace una por una y, si una falla, las demás se guardan igual.
- En **Rutas guardadas** del día, una ruta `DRAFT` puede recibir un chofer disponible (`POST /routes/{id}/assign`) y pasa a `ASSIGNED`.
- Antes de iniciarse (`DRAFT` o `ASSIGNED`), **Corregir paradas** permite reordenarlas o mover un pedido a otra ruta del mismo día y zona con lugar (`POST /dispatch/interventions`, acciones `REORDER` y `MOVE`). Cada corrección pide un motivo, que el backend audita.
- Una ruta `ASSIGNED` todavía no iniciada puede **cambiar de chofer** (con motivo). Los choferes ocupados se muestran deshabilitados hasta que regresen al depósito.
- Las rutas `IN_PROGRESS` y `COMPLETED` se muestran sin acciones.

### Urgencias (`/urgencias`)

- La bandeja (`GET /dispatch/inbox`) muestra los pedidos de **hoy** por despachar con la propuesta del backend: insertar en una ruta sin iniciar con lugar, salida nueva o bloqueado con motivo.
- Decisiones auditadas (`POST /dispatch/interventions`): insertar o crear salida nueva (`CONFIRM`), rechazar (`REJECT`, el pedido sigue pendiente), priorizar (`PRIORITIZE`) y reprogramar (`CONTACT` + `RESCHEDULE`). Todas piden un motivo y solo se dan por hechas si el backend devuelve el resultado esperado.
- Las entregas fallidas se cuentan, pero se gestionan en otra bandeja. El historial del día (`GET /dispatch/audit`) muestra quién decidió qué, cuándo y por qué.
- Las distancias son en **línea recta** (Haversine), no por calles; el ahorro se compara con visitar cada pedido en un viaje aparte.

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
