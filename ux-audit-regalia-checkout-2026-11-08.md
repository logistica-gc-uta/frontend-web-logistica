# REGALÍA checkout — scoped UX audit

## Scope and evidence

Audience: mainstream gift buyers. Platform: responsive React storefront. Scope: delivery, quoted purchase summary and payment, using approved artboards06–07 and the established cream/green and wine themes. Money, delivery details and card entry require sober feedback and server-authoritative amounts. This is a sampled audit, not an accessibility or payment-security certification.

Seen: the user's Image#6 (quoted summary), exact reported disabled-simulator message, current CheckoutPage/QuoteSummary/payment code, checkout CSS and approved delivery/payment HTML. Source exploration: mw7ww72p-13-mfor, followed by parent spot checks. Not yet seen: new checkout browser captures, real authenticated transaction, current runtime environment settings, complete test suite or any new successful payment. These are not inferred from screenshots or code.

## Summary

The product photo disappearing after calculation is a real presentation regression, not evidence that the photo service lost its assets. Delivery renders catalog photos before a quote, then switches to a component that always renders a gift emoji. Payment reuses that same component, so repairing only the delivery screen would leave the defect on the next step and on reload. The quote remains the sole authority for names, quantities and amounts; catalog information should supply display images only. The checkout also inherits a very wide shared container and cropped thumbnail styling, contrary to the bounded compositions already adopted for other purchase surfaces. The simulator message is an intentional backend environment guard: it must not be hidden, converted to success or bypassed to make the design look functional.

## Findings and quick wins

### DATA-01 — Product identity is lost after calculating
- Dimension: data display / state continuity.
- Severity: High. Confidence: Observed (user screenshot + code); live reproduction pending.
- Location: `CheckoutPage.tsx:323–325,353–368`; `QuoteSummary.tsx:15–19`; `PaymentPage.tsx:309`.
- Evidence: the unquoted summary uses `ProductImage` and `primaryImageUrl`; the quoted summary always contains 🎁. Quote response lines carry `productId`, not image URLs.
- Consequence: buyers can no longer visually verify that the calculated order contains the same gifts.
- Recommendation: match images by productId without changing quote fields; reuse delivery metadata, and independently load public product metadata on direct payment/reload. Preserve the existing explicit unavailable-image fallback when a lookup or image fails.
- Effort: S.

### VIS-05 — Purchase composition expands with the catalog
- Dimension: hierarchy / responsive design. Type: improvement.
- Severity: Medium. Confidence: Observed (code); rendered impact Inferred until viewport captures.
- Location: `checkout-presentation.css:79–84`; shared `.shop-main` desktop policy; approved06/07 layouts.
- Evidence: checkout has no own maximum width, while the shared container expands to2240px; its right column remains350px. This repeats the disproportionate expansion previously corrected on home/detail.
- Consequence: forms and their summary are separated by an unnecessarily large reading distance on wide displays.
- Recommendation: bounded checkout container, balanced form/summary columns, a grouped header and responsive one-column layout, without changing the map or validation.
- Effort: S.

### VIS-06 — Summary photos are cropped and the row is fragile on narrow displays
- Dimension: visual identity / data display.
- Severity: Medium. Confidence: Observed (code); rendered appearance Inferred beyond the supplied screenshot.
- Location: `checkout-presentation.css:182–210`.
- Evidence:48×54 thumbnail with `object-fit: cover`; row tracks use `48px 1fr auto`, without a zero-minimum text track.
- Consequence: a real photo may be cropped again after the identity bug is fixed, while long product names compete with the price.
- Recommendation: consistent square contained photos before/after calculation, shrinkable text tracks, preserved complete prices and readable unavailable-photo fallback. Verify at320/390 and desktop widths.
- Effort: S.

### ENV-01 — Payment cannot complete while simulation is disabled
- Dimension: system status / operational configuration.
- Severity: Blocker for the reported attempt, not an invitation to remove the guard.
- Confidence: Observed (user-reported message + source guard); effective runtime values uninspected.
- Location: backend `src/modules/shop/checkout/simulated-card.ts:83–99`; frontend `checkoutErrors.ts:82–84`.
- Evidence: `PAYMENT_SIMULATION_DISABLED` is emitted unless NODE_ENV is explicitly `test` or `demo` AND SIMULATED_PAYMENTS_ENABLED is explicitly `true`.
- Consequence: a buyer cannot finish this local demo attempt even with valid inputs. The existing message correctly says no charge occurred.
- Recommendation: preserve the guard/error; establish an explicitly authorized local demo runtime before enabling simulation. Do not edit secrets, seed cards, reset balances, confirm a purchase, restart an unknown owner's process or change production policy as a cosmetic fix.
- Effort: configuration scope to be established; no runtime change made.

## Prioritized work

1. Reproduce DATA-01 through the existing test public UI with isolated service doubles; observe RED before correcting source.
2. Restore product photos in delivery/payment, retaining server-authoritative quote amounts and existing fallbacks.
3. Apply VIS-05/06 with checkout-only styles, then inspect before/after desktop and mobile captures.
4. Prove disabled-simulator feedback remains honest and leaves cart/quote intact using a focused service-double case; no live payment.
5. Present the exact simulator configuration decision separately. Complete suite/build/integration/E2E still require final permission under S5.

## Preserved and not audited

Keep real map interaction, zone/schedule/stock validation, total-change consent, expiration checks, idempotency, uncertain-result verification, card-data handling, quote/draft ownership and server amounts. No replacement with prototype maps, synthetic production totals or scenario switches. Catalog metadata failures must not prevent viewing or paying a valid quote. Other storefront/admin/order screens are not covered by this scoped audit. No claim of a real successful purchase, WCAG conformance or full regression coverage is made.

## Results

The findings above record the pre-change state.

- **Observed before (isolated browser, API doubles):** at2551px checkout expanded to2240px; before calculation there were2loaded photos with cover styling, after calculation and on payment there were0photos. At390px the same state transition lost both photos. The parent opened the quoted desktop and mobile payment screenshots. No live quote or payment was sent.
- **Implementation:** quoted summaries now match public photo metadata by productId, reusing delivery metadata and loading it afresh when payment mounts or reloads. Product names, quantities and every amount still come from the quote, not the catalog. The existing unavailable-photo component remains the fallback.
- **Composition:** checkout-only1280px container, grouped heading, balanced desktop summary, square64px contained photos and a shrinkable product-name column. Mobile month/year fields remain together while CVV occupies its own row. The real map, input order and transaction handlers were not replaced.
- **Focused checks:** initial run5FAIL/1PASS;3failures reproduce missing image/fallback UI. The2CSS failures were an invalid source-test setup (Vitest returns an empty CSS module, even with raw query), not valid CSS RED. After repairing that reader to the project's existing node-fs pattern,8selected cases passed/33were omitted; application no-emit and diffcheck passed. The unchanged disabled-simulator behavior already passed before the fix; no artificial RED is claimed.
- **Observed after:**15presentation checks at2551/1440/768/390/320passed: two fully loaded contained photos before calculation, after calculation and on payment after reload; no page overflow; desktop checkout1280px rather than2240px. Replayed quote totals match the before captures. No unexpected API request escaped the isolated browser interception. Parent opened quoted2551, payment1440, quoted320 andpayment390 screenshots directly.
- **Still pending:** user visual acceptance and authorization to configure the existing local backend for simulation; effective runtime variables were not inspected and no backend process was restarted. Fullsuite/build/integration/E2E not run.

### Durable evidence
- [Before quoted desktop](docs/evidencias/regalia-checkout-evidence/before-quoted-2551.png)
- [Before mobile payment](docs/evidencias/regalia-checkout-evidence/before-payment-390.png)
- [Before measurements](docs/evidencias/regalia-checkout-evidence/before-measurements.json)
- [Capture procedure and explicit API isolation](docs/evidencias/regalia-checkout-evidence/capture.mjs)

These capture artifacts exercise the real React screens with isolated browser state and service responses. They are visual presentation evidence, **not** proof that real authentication, server quote calculation or payment completion works.

### After evidence
- [Quoted desktop](docs/evidencias/regalia-checkout-evidence/after-quoted-2551.png)
- [Payment desktop](docs/evidencias/regalia-checkout-evidence/after-payment-1440.png)
- [Quoted320px](docs/evidencias/regalia-checkout-evidence/after-quoted-320.png)
- [Payment390px](docs/evidencias/regalia-checkout-evidence/after-payment-390.png)
- [All15 measurements](docs/evidencias/regalia-checkout-evidence/after-measurements.json)

DATA-01 and VIS-05/06 are corrected within the observed presentation scope. ENV-01 remains intentionally blocked until the local runtime change is authorized. No proof of real backend payment completion is claimed. The plain checkout/purchase interfaces remain the only consumers of the shared metadata helper; no parser, API schema, generic image behavior, authentication, card handling, payment guard or unrequested admin/order interface was changed in this correction.
