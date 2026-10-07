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

| Script               | Descripción                                              |
| :------------------- | :------------------------------------------------------- |
| `pnpm dev`           | Servidor de desarrollo                                   |
| `pnpm build`         | Verificación de tipos y build de producción              |
| `pnpm preview`       | Sirve el build de producción                             |
| `pnpm lint`          | Análisis estático con oxlint                             |
| `pnpm format`        | Formatea el código con Prettier                          |
| `pnpm format:check`  | Verifica el formato sin modificar archivos               |
| `pnpm typecheck`     | Verificación de tipos de TypeScript                      |
| `pnpm test`          | Pruebas de componentes (Vitest + Testing Library)        |
| `pnpm test:watch`    | Pruebas en modo observación                              |
| `pnpm test:coverage` | Pruebas con reporte de cobertura (`coverage/index.html`) |

## Estructura

```
src/
├── app/            # Componente raíz, rutas, constantes de paths y menú de navegación
├── components/
│   ├── layout/     # Estructura de páginas autenticadas (encabezado y menú)
│   └── ui/         # Button, TextField, Alert, DataTable, AsyncContent
├── config/         # Lectura centralizada de variables de entorno
├── features/
│   ├── auth/       # Login, sesión (AuthProvider / useAuth) y rutas protegidas
│   └── zones/      # Listado y creación de zonas de entrega
├── hooks/          # useForm (formularios) y useFetch (carga de datos)
├── lib/
│   ├── auth/       # Persistencia de la sesión (token JWT + usuario)
│   ├── errors/     # AppError: errores con mensaje para el usuario
│   ├── format/     # Formato de fechas
│   ├── http/       # Cliente axios compartido y manejo de errores de la API
│   └── validation/ # Validadores genéricos de formularios
├── pages/          # Pantallas generales (inicio, 404)
├── types/          # Tipos de dominio compartidos
└── test/           # Configuración, fixtures y utilidades compartidas de pruebas
```

### Autenticación

- El login (`POST /auth/login`) solo permite el ingreso de usuarios con rol `ADMIN`.
- La sesión se guarda en `localStorage` y se restaura al recargar la página.
- Si el backend responde `401` a una petición autenticada (token vencido), la sesión se cierra automáticamente.
- Las páginas privadas se declaran dentro de `<ProtectedRoute />` en `src/app/App.tsx`.

### Convenciones

- Cada funcionalidad vive en `src/features/<nombre>/` (servicio, componentes, validación y pruebas).
- Los formularios usan `useForm` y las listas usan `useFetch` + `AsyncContent` + `DataTable`.
- Para agregar un módulo: crear su carpeta en `features/`, su ruta en `paths.ts` y `App.tsx`, y su entrada en `navigation.ts`.
- Las pruebas viven junto al archivo que prueban (`Componente.test.tsx`) y usan `renderWithProviders`.
- Toda petición al backend usa `apiClient` (`src/lib/http/apiClient.ts`), que agrega el token automáticamente.
- Los mensajes de error de la API se obtienen con `getErrorMessage` (`src/lib/http/apiError.ts`).
- Las rutas se referencian con las constantes de `src/app/paths.ts`.
- Trabajo en ramas `feat/*` desde `main`, integradas mediante Pull Request.
