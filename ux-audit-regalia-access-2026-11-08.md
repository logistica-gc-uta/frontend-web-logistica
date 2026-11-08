# REGALÍA access — scoped UX audit

Gate: mixed audit-then-fix of `/shop/login` and `/shop/registro`. Platform: web app. Audience: mainstream gift buyers. Stakes: credentials — keep real login/register, no prototype “muestra” submit. Not onchain.

## 1. Scope & evidence base

**Audited:** login and register presentation vs artboard `05-access.html`.
**Not audited:** admin `/login`, password policy, API, T6/T7/T11.
**Evidence:** isolated Playwright at 2551 and 390 (GET settings/categories doubled, auth POST aborted); source ShopLoginPage/ShopRegisterPage/account-presentation.css; artboard 05. ui-ux-pro-max: password visibility toggle already present.
**Dates:** 2026-11-08.

## 2. Executive summary

The two-column bag, gift illustration, and route tabs are already there. What still diverges from the approved access screen is hierarchy and clipping. The form title repeats the tab (“Iniciar sesión” / “Crear una cuenta”) instead of the artboard lines “Qué bueno verte.” and “Tu primer detalle.” The left column should stay the same h1 on both routes. On register at 2551px the last info line is cut to “un solo luga” because the access card uses `overflow: hidden` without `min-width: 0` on the columns. Tabs do not share the row equally. Auth, validation, and password reveal stay.

## 3. Quick wins

1. Shared left h1 “Un detalle empieza contigo.”
2. Form titles from the artboard; keep live CTAs Ingresar / Crear cuenta.
3. Let info text wrap; stop clipping.
4. Equal-width tabs.

## 4. Findings

### VIS-01 — Register info is clipped on wide desktop
- Severity: Medium. Confidence: Observed (rendered)
- Evidence: `before-register-2551.png` last line “un solo luga”; `.account__access { overflow: hidden }`
- Why it matters: the shopper cannot read why the account exists.
- Recommendation: `min-width: 0` on columns and wrap info copy. Keep the radius.
- Effort: S

### COPY-01 — Form titles repeat the tabs
- Severity: Medium. Confidence: Observed (rendered + artboard)
- Evidence: login heading “Iniciar sesión”; register “Crear una cuenta”. Artboard form: “Qué bueno verte.” / “Tu primer detalle.” Left artboard h1 is always “Un detalle empieza contigo.”
- Why it matters: two identical labels compete; the approved greeting never appears.
- Recommendation: left h1 shared; form h2 those two lines. Do not rename admin login. Keep password 8–128 and CLIENT-only behavior.
- Effort: S

### VIS-02 — Tabs do not share the row
- Severity: Low. Confidence: Observed (rendered)
- Evidence: before-login-2551 selected chip shrinks to its label instead of half the tablist.
- Recommendation: `display: flex; flex: 1; justify-content: center` on tab links.
- Effort: S

## 5. Prioritized backlog

1. RED copy/CSS tests. 2. Presentation-only source. 3. After captures. No full suite.

## 6. Left alone

Real `login`/`register`, redirects, password reveal, “Crear una cuenta” on checkout. Duplicate footer “¿No tienes cuenta?” is extra vs the artboard; remove only if tabs remain the switch. Header chrome out of scope.

## Results

- **Before:** login/register already had art and tabs. Form titles repeated the tabs. Register 2551 clipped “un solo luga”. Isolated GET doubles; auth POST aborted.
- **Implementation:** shared left h1 “Un detalle empieza contigo.”; form “Qué bueno verte.” / “Tu primer detalle.”; wrap info; equal-width tabs; live Ingresar/Crear cuenta and password policy kept. Duplicate footer links removed (tabs are the switch).
- **Checks:** AccountPresentation + CustomerAccount 20PASS. Header “Ingresar a Mi cuenta” selectors pinned (pre-existing vs old “Ingresar”).
- **After:** 10 states 2551–320, headings match, info readable, no overflow, unexpected API 0.
- **Still pending:** human acceptance; T9 result/orders/detail; T6/T7/T11 blocked. No push.
