# Integración continua (GitHub Actions)

El workflow [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) verifica automáticamente la calidad del
frontend en cada Pull Request hacia `main` y en cada push a `main`.

## Qué verifica

| Paso                     | Comando                                        | Falla si…                                       |
| ------------------------ | ---------------------------------------------- | ----------------------------------------------- |
| Instalación reproducible | `pnpm install --frozen-lockfile`               | `package.json` y `pnpm-lock.yaml` no coinciden  |
| Análisis estático        | `pnpm lint`                                    | oxlint reporta errores                          |
| Verificación de tipos    | `pnpm typecheck`                               | TypeScript encuentra errores de tipos           |
| Pruebas de componentes   | `pnpm test:coverage` con umbral mínimo de 80 % | alguna prueba falla o la cobertura baja de 80 % |
| Build de producción      | `pnpm build`                                   | Vite no logra compilar la aplicación            |

Entorno: Ubuntu, Node.js 26 y pnpm 12 (las mismas versiones que el backend). El reporte de cobertura se publica
como artefacto **`cobertura-frontend`** durante 14 días.

El workflow **no usa secretos**: las pruebas de componentes funcionan con mocks y no necesitan el backend.

### Qué no se ejecuta en el CI

- **`pnpm test:integration`**: requiere el backend real con PostgreSQL y las credenciales del seed. Se ejecuta en
  local siguiendo [`docs/evidencias/4-integracion-real.md`](evidencias/4-integracion-real.md).
- **Formato con Prettier** (`pnpm format:check`): se incorporará al CI cuando la configuración de Prettier excluya
  la plantilla de Pull Request del equipo.

## Cómo interpretar una ejecución fallida

1. En el Pull Request, en la sección de checks, hacer clic en **Details** junto a **CI / Lint, typecheck, pruebas y
   build** (o abrir la pestaña **Actions** del repositorio).
2. Abrir el paso marcado con ❌: el registro muestra el comando que falló y su salida.
3. Reproducir el mismo comando en local desde la rama del PR:

   | Paso fallido          | Comando local                                                                                                     |
   | --------------------- | ----------------------------------------------------------------------------------------------------------------- |
   | Instalar dependencias | `pnpm install` y subir el `pnpm-lock.yaml` actualizado                                                            |
   | Análisis estático     | `pnpm lint`                                                                                                       |
   | Verificación de tipos | `pnpm typecheck`                                                                                                  |
   | Pruebas con cobertura | `pnpm test:coverage` (el resumen al final indica qué archivo baja la cobertura; detalle en `coverage/index.html`) |
   | Build de producción   | `pnpm build`                                                                                                      |

4. Corregir la causa, hacer commit y push a la misma rama: el CI se ejecuta de nuevo automáticamente.

> No se deben modificar ni eliminar pruebas solo para que el CI pase. Si una prueba falla por un cambio de
> comportamiento intencional, actualizarla y explicarlo en la descripción del PR.

## Proceso de revisión de un Pull Request

1. La autora o el autor abre el PR hacia `main` con `Closes #N` y la plantilla del equipo completa.
2. Se espera a que el check **CI** termine en ✅ y se agrega el enlace de la ejecución en la sección
   _Evidencias_ del PR.
3. Los revisores verifican el código, la evidencia y el resultado del CI. Un PR con el CI en ❌ no se aprueba hasta
   corregirlo.
4. Con las aprobaciones requeridas y el CI en ✅ se realiza el merge; el Issue vinculado se cierra
   automáticamente.
