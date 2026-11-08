# REGALÍA orders — scoped UX audit

Gate: mixed audit-then-fix of confirmation, history, detail, and receipt. Platform: responsive web app. Audience: gift buyers after paying. Stakes: money already moved; copy must not invent success, tax legends, or GPS. Sampled review, not WCAG or payment certification.

Authorization: improve past the artboard when the prototype is weaker than the live contract.

## 1. Scope & evidence base

**Audited:** `/shop/confirmacion/:id`, `/shop/mis-pedidos`, `/shop/mis-pedidos/:id`, `/shop/mis-pedidos/:id/comprobante` vs artboards `08-result.html`, `09-orders.html`, `10-order-detail.html`.
**Not audited:** cart, access, checkout payment simulator (T7), full tests (T6), backend hook (T11).
**Evidence:** source `OrderPages.tsx`, `orders-presentation.css`; cart/checkout already bound to ~1200px; catalog photos use `contain`.
**Dates:** 2026-11-08.

No live payment. Isolated captures use doubled customer GETs and a seeded CLIENT session; unexpected API 0.

## 2. Executive summary

These screens already tell the truth: confirmation only after a real owned order, row-as-link history, delivery facts without lat/lng in the open, receipt without the tax disclaimer. What still fails the gift-storefront standard is the same trio the cart had: unbounded width on a 2551px canvas, cropped product photos (`object-fit: cover`), and payment-desk copy (“¡Compra confirmada!”, “Aprobada”). The artboard’s inline sample receipt and “Dos formas de decirlo.” are weaker than the live receipt route — keep the live contract, improve the presentation.

## 3. Quick wins

1. Bound order pages to 1200px like the bag.
2. Contain gift photos in list, confirmation, and detail.
3. Warm confirmation heading; keep rejected/pending off this route.
4. Center primary CTAs; drop the payment checkmark emoji.
5. Print label “Imprimir comprobante”. Do not render the API disclaimer.

## 4. Findings

### VIS-01 — Order pages inherit the catalog canvas
- Severity: Medium · Observed (source + prior 2240px shop-main)
- Location: `.shop-page` has no max-width; cart/checkout already cap themselves
- Recommendation: `.shop .shop-page.order-page { max-width: 1200px; margin-inline: auto }` only

### VIS-02 — Order photos crop the gift
- Severity: Medium · Observed (`object-fit: cover` on `.order-card__image` and `.order-items__image`)
- Recommendation: `contain` on the existing frames; peach letterboxing; do not swap live photos for prototype SVGs

### COPY-01 — Confirmation sounds like a POS, not a gift desk
- Severity: Medium · Observed (`¡Compra confirmada!` vs artboard `Aprobada`)
- Why improve past the artboard: “Aprobada” is a payment adjective. Live confirmation only exists after an owned persisted order, so the heading can be the gift outcome.
- Recommendation: h1 `Ya es un detalle nuestro.` Keep refs, totals, and the dedicated receipt link. Do not add rejected/pending panels here (payment already owns those).

### COPY-02 — Payment uses a text checkmark
- Severity: Low · Observed (`✓ Pago aprobado`)
- Recommendation: reuse `CheckIcon`; keep “Pago aprobado”

### A11Y-01 — Catalog `a.btn { display:inline-block }` can un-center order CTAs
- Severity: Low · Observed on cart; same class on empty/detail/receipt links
- Recommendation: order-scoped flex + center on `.btn` / `.button`

## 5. Prioritized backlog

1. RED: heading, contain, 1200px, no disclaimer, owned-order-only success
2. Implement presentation only
3. GREEN focused OrderPages + OrderPresentation
4. Isolated after captures
5. Human visual acceptance

## 6. Out of scope

Auth, list/detail/receipt APIs, cart-clear-on-justPaid, tax snapshot, T6/T7/T11, push.

## Results

- **Implementation:** 1200px order pages; contain photos; confirmation heading “Ya es un detalle nuestro.” (better than artboard “Aprobada”); steps without back-links to payment; CheckIcon on payment; print “Imprimir comprobante”; no disclaimer. Rejected/pending stay on payment. Auth/list/detail/receipt/justPaid unchanged.
- **Checks:** OrderPages + OrderPresentation 16PASS.
- **After:** 25 isolated states 2551–320, unexpected API 0, width ≤1200 at ≥1440, heading and contain asserted.
- **Still pending:** human visual acceptance. T6/T7/T11 blocked. No push.
