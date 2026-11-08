# REGALÍA — Corrección de Fidelidad Visual en Descubrimiento y Catálogo (T1)

**Referencia:** T1, S1–S2, S6–S8, S11–S12
**Bocetos aprobados de referencia:**
- `../backend/design/regalia-dual-theme/01-storefront.html`
- `../backend/design/regalia-dual-theme/02-catalog.html`
- `../backend/design/regalia-dual-theme/03-product-detail.html`
**Superficies de edición autorizadas:**
- `src/styles/shop.css`
- `src/features/shop/components/ShopLayout.tsx`
- `src/features/shop/components/ShopThemeToggle.tsx`
- `src/features/shop/components/ProductCard.tsx`
- `src/features/shop/components/CategoryCard.tsx`
- `src/features/shop/components/CatalogFiltersForm.tsx`
- `src/features/shop/components/AddToCart.tsx`
- `src/features/shop/pages/ShopHomePage.tsx`
- `src/features/shop/pages/CatalogPage.tsx`
- `src/features/shop/pages/ProductDetailPage.tsx`
- `src/features/shop/ShopPages.test.tsx`
- `src/features/shop/ShopTheme.test.tsx`
- `docs/evidencias/regalia-discovery-fidelity.md`

---

## 1. Diagnóstico del Defecto en Pantallas Anchas

La implementación previa fue rechazada debido a que en pantallas de escritorio anchas (ej. 2538×1313 px):
1. **Contenedor rígido estrecho:** El catálogo estaba encerrado en un ancho máximo de `1200px`, produciendo márgenes laterales gigantescos y desaprovechando el espacio disponible en monitores 1080p, 2K y 4K.
2. **Fotografías desproporcionadas:** Las imágenes de las tarjetas de producto no tenían contención de altura ni proporción adecuada (`aspect-ratio: 16/10`), creciendo verticalmente de forma desmedida y empujando el contenido esencial fuera de pantalla.
3. **Estructura superficial:** La cabecera, hero, filtros y tarjetas no seguían la jerarquía editorial, ritmo ni composición de los prototipos aprobados (`01-storefront.html`, `02-catalog.html`, `03-product-detail.html`).

---

## 2. Lista de Verificación Antes / Después

| Elemento / Superficie | Estado Anterior | Estado Corregido (Fidelidad Prototipos) | Boceto Aprobado |
|---|---|---|---|
| **Estrategia Responsiva y Lienzo Ancho** | `max-width: 1200px` fijo; 3 columnas fijas; fotos crecían sin límite. En 2538px generaba márgenes vacíos masivos (~1338px) y fotos descomunales. | Ancho fluido progresivo: `min(1440px)` en escritorio base, `min(1680px)` en 1440px+, `min(1920px)` en 1920px+, y `min(2240px, calc(100% - 120px))` en pantallas ultra-anchas (2400px+ / 2538px). Márgenes laterales reducidos a ~149px en 2538px. Cuadrícula de productos adaptativa: 3 columnas (base) → 4 columnas (1600px+; en 1440px se conservan 3, como en el boceto) → 5 columnas (1920px+). Contenedor de imagen contenido a `aspect-ratio: 16/10` con `max-height: 170px` y `object-fit: cover`. | `01-storefront.html`, `02-catalog.html` |
| **Cabecera de la Tienda (`ShopLayout.tsx`)** | Fila única apretada; enlaces genéricos; toggle de tema como botón simple; carrito en texto plano. | Estructura de dos filas inspirada en `01-storefront.html`: **Fila 1 (Principal):** Wordmark con serifa editorial, buscador con icono SVG integrado, herramientas (toggle de tema accesible con icono sol/luna, enlace «Mi cuenta» conciso con icono SVG de usuario, píldora de carrito con icono SVG de bolsa y contador de ítems). **Fila 2 (Navegación de ocasiones):** Tira horizontal de ocasiones (`useFetch(shopService.categories)`) que permite saltar a categorías directamente. En móvil la marca ocupa una fila, búsqueda y tema comparten otra, y cuenta/carrito se reagrupan; las ocasiones se desplazan dentro de su propia tira horizontal. Áreas táctiles de al menos 44px donde corresponde. | `01-storefront.html` (`.shop-header`) |
| **Hero de Portada (`ShopHomePage.tsx`)** | Título anticuado («Un detalle que dice mucho»); sección de pasos no aprobada («Así de simple»); orden invertido. | Jerarquía editorial exacta: Cintillo «Detalles con intención», H1 con serifa «Hay regalos que lo dicen todo.», copy «Para celebrar, agradecer o simplemente decir: pensé en ti.», botón CTA «Encuentra tu detalle ↗» y enlace secundario «Buscar por ocasión». Collage interactivo de 3 regalos con hover y foco accesible. Eliminación completa de la sección no aprobada de pasos «Así de simple». Reordenamiento editorial: Ocasiones antes de destacados. | `01-storefront.html` (`.shop-hero`, `.hero-collage`) |
| **Tarjetas de Ocasión (`CategoryCard.tsx`)** | Tarjetas con círculo inicial tosco y texto «X regalos». | Tarjetas compactas en tonos pastel aprobados (`.occasion.rose`, `.sage`, `.peach`, `.lilac`), con glifos decorativos simbólicos (`✷`, `♡`, `❀`, `✧`) y nombre real de categoría. | `01-storefront.html` (`.occasion`) |
| **Tarjetas de Producto (`ProductCard.tsx`)** | Tarjetas genéricas con ratio cuadrado distorsionado y precio plano o etiquetas ruidosas. | Composición aprobada sin ruido: `<figure>` con ratio 16:10 contenido (`max-height: 170px`), nombre del regalo (15px semibold), descripción resumida (12px, line-clamp 2), precio destacado con `tabular-nums`, insignia de stock silenciosa con fondo atenuado (`.badge--success/.danger` sutil), y nota de entrega discreta. Todo envuelto en enlace nativo navegable sin botones internos redundantes. | `01-storefront.html`, `02-catalog.html` (`.product-card`) |
| **Catálogo y Filtros (`CatalogPage.tsx`, `CatalogFiltersForm.tsx`)** | Filtros encasillados en cajas pesadas con bordes gruesos; sin migas de pan ni barra de resultados. | Estructura editorial: Migas de pan «Inicio / Catálogo», encabezado compacto «Catálogo de regalos» con intro «Encuentra un detalle por ocasión, categoría o precio.», barra lateral de filtros desmarcada (unboxed) en fieldsets limpios, barra de resultados con contador de regalos encontrados y orden seleccionado, y rejilla fluida de 3 a 5 columnas. | `02-catalog.html` (`.catalog-layout`, `.filters`) |
| **Detalle de Producto (`ProductDetailPage.tsx`, `AddToCart.tsx`)** | Bloque de compra encajonado en panel pesado; galería sin escenario ni miniaturas. | Diseño editorial `.product-layout`: Migas de pan con categoría real, escenario de galería de producto con ratio contenido 16:10, selector de miniaturas accesible, jerarquía de información (título, precio tabular, descripción, stock, categoría), selector de cantidad horizontal compacto y botón `.cta` sin panel tosco. Enlace al pie «← Volver al catálogo». | `03-product-detail.html` (`.product-layout`, `.product-stage`) |
| **Aislamiento de Tema y Accesibilidad (`ShopThemeToggle.tsx`, `shop.css`)** | Dependencia parcial de selectores globales o reglas cruzadas. | Tokens locales en `.shop` (`data-theme="light"` / `data-theme="dark"`), sin tocar `:root` global del admin. Paletas declaradas para ambos temas (sin afirmar certificación WCAG), compatibilidad con `prefers-reduced-motion: reduce`, reglas de impresión legibles con fondo blanco, y contornos visibles en teclado (`:focus-visible`). | `01-storefront.html` |

---

## 3. Disciplina de Pruebas (ODD / TDD)

### Verificación de Pruebas Unitarias y de Tema
Comando ejecutado en primer plano:
```bash
PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=error pnpm exec vitest run src/features/shop/ShopPages.test.tsx src/features/shop/ShopTheme.test.tsx
```
**Resultado:** Código de salida 0 (29 pruebas pasadas de 29):
- `ShopPages.test.tsx`: 25 pruebas pasadas.
- `ShopTheme.test.tsx`: 4 pruebas pasadas.

### Verificación de Tipos (TypeScript sin emisión)
Comando ejecutado en primer plano:
```bash
PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=error pnpm exec tsc -p tsconfig.app.json --noEmit --incremental false
```
**Resultado:** Código de salida 0 (0 errores de tipado).

---

## 4. Estado de Evidencia Visual y Límites

- **Verificación del escritor:** los 29 casos anteriores y TypeScript corresponden al estado entregado por el escritor; no prueban fidelidad visual ni equivalen a una suite completa. La revisión posterior encontró fallos de CSS y los corrigió.
- **Límites de alcance respetados:** No se modificaron esquemas de backend, rutas, servicios de autenticación, almacenamiento del carrito ni hojas de estilo ajenas (como `orders-presentation.css` o tokens del panel administrativo).
- **Inspección posterior observada por el padre:** Chromium del proyecto, páginas reales públicas y solo GET, a 2538/1440/768/390/320px. El catálogo mide 2240px en viewport2538, no desborda en ninguno de esos anchos y sus filtros permanecen contenidos. En 1440 hay tres columnas; en 2538 cinco. Se capturaron además home, acceso y detalle en 1440/390 y catálogo oscuro en1440/390. Capturas temporales: `/tmp/regalia-corrected-visual-ZJmXgj/`.
- **Fallos conservados:** la primera captura posterior detectó desbordamiento de547px en móvil y solapamiento de filtros. Se corrigieron reflujo de cabecera, tamaños mínimos y alineación del formulario. Tres comprobaciones estructurales fallaron antes; seis de tema/aislamiento pasaron después. El primer chequeo de hero por locator mostró desplazamiento por automatización; la comprobación posterior con puntero real sobre la zona visible confirmó hoverz6, sin navegación ni scroll.
- **Aislamiento administrativo:** todos los selectores de shop.css se acotan a `.shop`; comparación renderizada contra estilos de696920c, seis sondas (login administrativo real y controles aislados de filtros/migas/título) sin diferencias computadas. Esto no es E2E de administración autenticada.
- **Comprobaciones propias finales:** TypeScript app sin emisión pasó; diffcheck falló por una línea vacía final deCategoryCard, se corrigió y pasó; PostCSS confirmó cero selectores de tienda sin ámbito. No se ejecutaron build, suite global, integración real, compras, impresión física ni E2E completos.
