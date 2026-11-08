# REGALÍA cart — scoped UX audit

Gate: mixed audit-then-fix of one existing screen (`/shop/carrito`). Platform: responsive web app. Audience: mainstream gift buyers. Stakes: money on the next step, so copy stays sober and live totals remain estimates until checkout. Not onchain. Sampled review, not WCAG or payment certification.

## 1. Scope & evidence base

**Audited:** filled and empty cart presentation against approved artboard `04-cart.html`.
**Not audited:** header/nav chrome, checkout, orders, access/register, simulator activation (T7), full tests (T6), backend commit hook (T11).
**Evidence:** live isolated Playwright captures at 2551 and 390 with public catalog GET doubled and all other `/api/v1` aborted; source `CartPage.tsx`, `cart-presentation.css`, `shop.css` cart block; artboard `backend/design/regalia-dual-theme/04-cart.html`. ui-ux-pro-max searches: image scaling (`max-width: 100%`), touch targets 44px (already met on steppers), React stack retry for CTA returned no cart-specific match — fallback is the artboard CTA and semantic `Link`/`button` already in use.
**Dates:** 2026-11-08. Frontend `8a98ae4` plus this uncommitted unit.

No login, quote, or payment ran. Unexpected API requests: 0.

## 2. Executive summary

The cart already works as a live revalidation screen: stock-aware quantity, blocked checkout, and an honest “estimado” summary. What the shopper sees is still the old storefront vocabulary on a catalog-wide canvas. At 2551px the bag is 2240px wide with a 1842px item column and a 350px summary, so line photos, titles, and prices sit across a long empty track. Photos use `object-fit: cover` (136×121 and 100×89), the crop the catalog already rejected. Copy still says “Tu carrito”, “Eliminar”, and “Ir al checkout” while the approved bag says “Tu bolsa de regalos”, “Quitar”, and “Continuar a la entrega”. Empty state stacks two sentences that mean the same thing. Quantity stays a stock-limited select; that is a live contract, not a defect.

## 3. Quick wins

1. Bound the cart page like checkout/detail, not like the fluid catalog.
2. Contain gift photos in the 1.12 artboard frame.
3. Put line total and Quitar in the end column; keep the stepper with the product.
4. Replace carrito/checkout/Eliminar labels on this page with the approved bolsa wording.
5. Keep one empty heading.

## 4. Findings

### VIS-01 — Cart inherits the catalog’s 2240px measure
- Dimension: visual hierarchy / responsive
- Severity: Medium
- Confidence: Observed (measured)
- Location: `.cart-presentation` width 2240 at viewport 2551; `.shop-main` policy in `shop.css`; artboard `.wrap { width: min(1200px, …) }`
- Evidence: `before-filled-2551.png`, `before-measurements.json` `cartWidth: 2240`, `layoutColumns: 1842px 350px`
- Why it matters: the shopper’s eye travels a long empty gutter between gifts and the summary before they can compare a line with the total.
- Recommendation: cart-only max-width 1200px, keep the 1fr / 350px summary and the existing 760px single column. Do not change shared `.shop-main`.
- Effort: S

### VIS-02 — Line photos are cropped
- Dimension: visual hierarchy (imagery)
- Severity: Medium
- Confidence: Observed (computed + rendered)
- Location: `cart-presentation.css` `.cart-line__image { object-fit: cover; aspect-ratio: 1.12 }`
- Evidence: measured `imageFit: "cover"`; filled screenshots show landscape crops of box gifts; catalog/detail/checkout already use contain for shop photos.
- Why it matters: the same gift looks truncated in the bag after the shopper saw the full subject in the catalog.
- Recommendation: `object-fit: contain` in the existing 1.12 frame; do not replace photos with prototype SVGs.
- Effort: S

### VIS-03 — Remove sits with quantity instead of with the line total
- Dimension: visual hierarchy / grouping
- Severity: Medium
- Confidence: Observed (rendered + code)
- Location: `CartPage.tsx` `cart-line__actions`; artboard `.line-end` holds total + “Quitar”
- Evidence: filled 2551 screenshot: stepper and “Eliminar” share one row; `$36,00` sits alone on the far right. At 390 the total drops under the stepper (`lineColumns: 100px 240px`).
- Why it matters: delete competes with quantity, and the line total is visually orphaned from the action that changes it.
- Recommendation: move Quitar next to the line total; keep the stock-limited select with the product. Match artboard tablet stacking: total + Quitar share the second column.
- Effort: S

### COPY-01 — Internal checkout words on a gift bag
- Dimension: content & microcopy
- Severity: Medium
- Confidence: Observed (rendered)
- Location: heading, breadcrumb, remove button, continue CTA, continue-shopping link
- Evidence: heading `"Tu carrito"`; CTA `"Ir al checkout"`; remove `"Eliminar"`; breadcrumb `"Carrito"`; link `"Seguir comprando"`. Artboard: `"Tu bolsa de regalos"`, `"Continuar a la entrega"`, `"Quitar"`, `"Bolsa"`, `"← Seguir eligiendo regalos"`.
- Why it matters: “checkout” is staff jargon at the moment the shopper decides to continue. The approved bag already has the next-step words.
- Recommendation: apply those five strings on this page only. Keep `href` to `/shop/checkout`. Keep “Resumen estimado” / “El total se confirma antes de pagar” — they tell the truth about client-side tax.
- Effort: S

### STATE-01 — Empty bag says the same thing twice
- Dimension: state coverage
- Severity: Low
- Confidence: Observed (rendered)
- Location: empty column in `CartPage.tsx`
- Evidence: heading `"Tu bolsa espera un regalo."` plus `"Tu carrito está vacío."` on `before-empty-2551.png` and `before-empty-390.png`. Artboard uses one heading: `"Tu bolsa espera un detalle."`
- Why it matters: two empty messages make the bag feel unfinished rather than inviting.
- Recommendation: one display heading `"Tu bolsa espera un detalle."` and the catalog CTA `"Explorar el catálogo"`. Keep the disabled summary.
- Effort: S

## 5. Prioritized backlog

1. RED presentation tests for the five copy strings, 1200px cap, contain photos, and line-end Quitar.
2. Implement only under `CartPage.tsx` / `cart-presentation.css` (plus those tests). Preserve `cartView`, storage, stock select, and checkout gating.
3. After captures at 2551/1440/768/390/320. No full suite. T6/T7/T11 stay blocked.

## 6. What's working, and what was left alone

Stock-limited `select`, disabled continue, problem lines, retry, and HALF_UP estimate already match live contracts. Prototype 1–99 free text, undo, and sample SVGs stay out. Header “Carrito: N unidades” is shared chrome, out of scope. No claim that this screen is accepted or that a real purchase works.

## 7. Open questions

None that block this unit. Visual acceptance of the five remaining T9 groups still belongs to the human.

## Results

- **Observed before:** at 2551px cartWidth 2240, `object-fit: cover`, heading `Tu carrito`, CTA `Ir al checkout`. At 390 the same copy and crop; no page overflow. Isolated API doubles; unexpected requests 0.
- **Implementation:** cart-only 1200px measure, contained 1.12 photos, Quitar with the line total, approved bolsa copy. Stock-limited select, `cartView`, storage, and checkout gating unchanged. Header “Carrito: N unidades” left as shared chrome.
- **Focused checks:** presentation RED 3FAIL (2 CSS + 1 copy). After source: CartPage+CartPresentation 14PASS; two checkout redirects that land on this page 2PASS/17SKIP. Accidental `pnpm test --` ran the full Vitest suite once (74 files); do not treat that as T6. E2E selector updated, not executed.
- **Observed after:** 10 isolated states (filled/empty × 2551/1440/768/390/320): cartWidth 1200 on wide viewports, `object-fit: contain`, heading `Tu bolsa de regalos`, CTA `Continuar a la entrega`, empty heading `Tu bolsa espera un detalle.`, no page overflow, unexpected API 0.
- **Still pending:** human visual acceptance; T9 remaining groups; T6/T7/T11 blocked. No push.

### Durable evidence
- [Before filled desktop](ux-audit-regalia-cart-2026-11-08-evidence/before-filled-2551.png)
- [Before filled mobile](ux-audit-regalia-cart-2026-11-08-evidence/before-filled-390.png)
- [After filled desktop](ux-audit-regalia-cart-2026-11-08-evidence/after-filled-2551.png)
- [After filled mobile](ux-audit-regalia-cart-2026-11-08-evidence/after-filled-390.png)
- [After empty desktop](ux-audit-regalia-cart-2026-11-08-evidence/after-empty-2551.png)
- [Measurements](ux-audit-regalia-cart-2026-11-08-evidence/after-measurements.json)
- [Capture procedure](ux-audit-regalia-cart-2026-11-08-evidence/capture.mjs)
