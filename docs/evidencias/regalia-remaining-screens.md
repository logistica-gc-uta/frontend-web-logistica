# REGALÍA — Remaining presentation review

All ten approved artboards have implementations. This list identifies remaining visual refinement and acceptance, not missing functionality. Source/prototype mapping: read-only explorer mw7xur5h-14-x8je; no new screenshots of these five groups were inspected.

| Priority | Screen | Route | Remaining review |
|---|---|---|---|
|1|Cart|`/shop/carrito`|Composition, summary, quantities and responsive/empty states.|
|2|Customer access|`/shop/login`, `/shop/registro`|Existing restored illustration/tabs, form composition and mobile acceptance. Public captures exist but are not human approval.|
|3|Purchase result|`/shop/confirmacion/:id`|Actual saved-order confirmation hierarchy and error/pending boundaries; no fabricated success.|
|4|My orders|`/shop/mis-pedidos`|Existing whole-row composition, real filters and responsive readability.|
|5|Order detail / receipt|`/shop/mis-pedidos/:id`|Delivery facts/banner/timeline, receipt and print presentation.|

References: approved backend artboards04/05/08/09/10 in `design/regalia-dual-theme/`; frontend `docs/evidencias/regalia-orders-fidelity.md`; feature task Log L21,L26,L28,L40. Discovery home/catalog/detail has received the latest human acceptance; checkout/payment recently received focused image/composition corrections and isolated presentation captures, not real payment integration approval. Recommend reviewing cart next to preserve the purchase-flow order. Full test suite/build/IT/E2E still require permission.
