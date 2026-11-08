# Issue 29 remaining

Objective: implement the leftover shop routes, bugs, and UX from frontend issue #29, then close the issue with an honest comment.
Branch: feat/rediseno-ui
Delivery: ask-on-risk
Runner: vitest (`npm test` in frontend-web-logistica)

## Specs

S1: Shop lives at `/`; admin lives at `/admin/*`; `/shop/*` redirects to the new shop URLs.
S2: Bugs: cart is kept on logout; shop HTTP goes without the ADMIN client; shop login uses `?next=`; unknown shop URLs show a shop 404.
S3: UX: Comprar ahora; toast with link to cart; related products; `best_selling` sort; hamburger; Mi cuenta page; tab titles; skeletons; filter chips; auto-login after register; empty cart without $0.

## Tasks

- T1 S1 routes — inline — done — vitest 711 passed
- T2 S2 bugs — inline — done — vitest 711 passed
- T3 S3 UX — inline — done — vitest 711 passed

## Log

L1: mejor implementemos lo faltante los 3 puntos y luego cerramos al issue
