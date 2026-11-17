# Disable legacy zones in the web workflow

Branch: `feat/disable-zones` (frontend and backend). Stage: frontend decoupling only.
Preserve backend contracts, schema, historical data, and route compatibility; no migrations or deployment.

## Specs

S1. "realicemos primero el desacoplamiento porque eliminar todo no es viable tocaria realizar una migracion. mas seria de desactivar las zonas por ahora. vamos a implementar eso."
S2. "primero vamos al main , has pull y crea una rama para este cambio que vamos hacer, cuando estes en la rama realiza una revision del sistema para poder quitar zonas sin dañar el sistema."
S3. "en esa rama acual ya estan todos los cambios en la nube?"

## Tasks

T1 [done] S2-S3 — route: parent Git preparation + read-only explorers; commit: n/a (branch preparation).
T2 [done] S1-S2 — route: inline test-first frontend decoupling, docs and compatibility tests; commit: pending.
T3 [in_progress] S1-S2 — route: focused/full unit checks, typecheck/build/lint and independent verification, reviewable commit; commit: pending.

## Log

L1. Original request verbatim:

> realicemos primero el desacoplamiento porque eliminar todo no es viable tocaria realizar una migracion. mas seria de desactivar las zonas por ahora. vamos a implementar eso.
> primero vamos al main , has pull y crea una rama para este cambio que vamos hacer, cuando estes en la rama realiza una revision del sistema para poder quitar zonas sin dañar el sistema.
>
> en esa rama acual ya estan todos los cambios en la nube?

L2. Git fetch confirmed old frontend and backend branch tips equal remote tips (0/0), with no commits absent from origin/main. Backend origin/main 99455fd; frontend origin/main 9c1bc00. Both main branches fast-forward pulled, then feat/disable-zones created locally. Backend untracked APE4 task and two tests preserved; never include them in this feature.
L3. Pre-implementation source review: backend already supports null zoneId with store coverage/origin. docs/orders-coverage-contract.md requires preservation of explicit legacy IDs and historical compatibility. Therefore this stage removes web menu/direct page access and operational zone selectors/requests, not backend APIs/models/history or proposal zone IDs.
L4. Preserve date/status filters, pagination, coverage validation, historic optional labels, proposal confirmation and compatible route movement. No live purchases/production mutations, integration fixtures, deployment, push or PR authorized. Normal mock-only unit tests are applicable.
L5. Risk: item 3 — existing shared navigation and order/planning consumers must retain unrelated behavior and historical route compatibility; independent verifier required.
L6. RED: job-5 exited 1, four expected behavior failures and two authentication passes. First GREEN job-6: six tests passed. Initial regressions job-7: 160 passed, three failed because DailyRoutes tests awaited removed zone options; full suite did not run. Updated those waits to the date field, preserving assertions. Initial build job-8: lint passed with six warnings in unchanged Shop files, TypeScript rejected two invalid testing-library exact options in the new test; corrected them. Build and regressions are being rerun. Added explicit null-zone confirmation regression while retaining existing historical-zone confirmation tests.

L7. Corrected job-9 exited 0: focused checks passed, full unit suite 91 files / 850 tests passed. Existing Shop render warning and jsdom scrollTo notices were emitted; no test failures. Job-10 build (TypeScript + Vite) and git diff --check passed, with >500 kB bundle warning. Lint passed with six warnings in unchanged Shop code. Independent verifier mwkt0ht9-7-gruw is active; no completion claim yet. Integration/E2E and live deployment checks intentionally excluded (persistent fixtures/production are outside this stage).

L8. Independent verifier mwkt0ht9-7-gruw: no findings; S1 PASS for frontend-only scope; local branches/base refs consistent for S2; remote publication of NEW changes explicitly not claimed for S3. Independently executed ZoneDecoupling, useRouteConfirmations and SavedRoutes: 3 files / 36 tests passed, exit 0, no warnings/errors. No blockers. Parent observed Git fetch/pull/branch creation events recorded in L2. No CLI commands/parsers/options changed, so CLI differential check is not applicable; historical UI behaviors are covered by unit regressions.
