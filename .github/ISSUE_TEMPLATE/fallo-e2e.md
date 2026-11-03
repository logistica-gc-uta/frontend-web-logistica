---
name: Fallo de prueba E2E
about: Reportar una prueba de Playwright que falló, con su traza y captura
title: 'fix(e2e): <prueba que falló>'
labels: bug
---

## Prueba que falló

- **Archivo y título:** `e2e/<archivo>.spec.ts` › <título de la prueba>
- **Tipo:** real contra la API / simulada (falla inyectada en la red)
- **Commit evaluado:** <SHA>
- **Backend usado:** `logistica-gc-uta/backend` @ <SHA>

## Qué pasó

<Mensaje de error de Playwright (bloque "Error:" y "Call log").>

## Artefactos

Adjuntar desde `test-results/<carpeta-de-la-prueba>/`:

- [ ] `test-failed-1.png` (captura del momento del fallo)
- [ ] `trace.zip` (se abre con `pnpm exec playwright show-trace <ruta>/trace.zip`)
- [ ] `video.webm`
- [ ] `error-context.md`

No adjuntar `e2e/.auth/` ni `.env.integration.local`: contienen la sesión y las contraseñas del seed.

## Cómo reproducirlo

```bash
pnpm test:e2e e2e/<archivo>.spec.ts -g "<título>"
```

## Resultado esperado

<Qué debía mostrar la pantalla o responder la API.>
