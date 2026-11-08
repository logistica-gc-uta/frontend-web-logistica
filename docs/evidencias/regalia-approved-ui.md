# REGALÍA — Evidencia T1: base visual y descubrimiento

Implementación de S1–S2 y S6–S8 sobre los datos reales existentes. Referencias visuales: `../backend/design/regalia-dual-theme/01-storefront.html`, `02-catalog.html` y `03-product-detail.html`. No se copiaron productos, precios, mapas ni límites del boceto.

## Cambios y fronteras

| Contrato | Implementación |
| --- | --- |
| S1–S2 | Tokens locales en `.shop`: crema/evergreen/blanco por defecto y vino oscuro explícito. Tipografía de sistema y Georgia; sin fuentes nuevas ni cambios al panel. |
| S6 | Hasta tres fotos reales, elevación por hover/foco, selección local al tocar. Sin navegación ni desplazamiento al seleccionar; imágenes fallidas se retiran y sin fotos el texto ocupa el hero. |
| S7 | Una sola `Link` nativa por tarjeta, envolviendo imagen y contenido; sin «Ver detalle» ni controles anidados. Conserva destino y estado de retorno del catálogo. |
| S8 | Alternador SVG de 44px entre búsqueda y cuenta, nombre accesible y `aria-pressed`. Estado React local, sin almacenamiento de autenticación. |
| Catálogo/detalle | Filtros móviles desplegables sin modificar el formulario/validación; orden, paginación y consultas siguen en servidor/URL. Galería y límite configurable del carrito conservados; carrito independiente. |

No se tocaron servicios, rutas, proveedores, dependencias, API ni backend en T1. No hubo commits, publicación, despliegue ni mutaciones de base de datos.

## Verificación enfocada

- RED: `PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=error pnpm exec vitest run src/features/shop/ShopTheme.test.tsx src/features/shop/ShopPages.test.tsx -t 'tema aislado|eleva fotos reales|muestra precio desde centavos'` → exit 1, cuatro fallos esperados y 22 casos excluidos: no existían tema local, collage seleccionable ni enlace de tarjeta completa.
- GREEN/TRIANGULACIÓN: `PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=error pnpm exec vitest run src/features/shop/ShopTheme.test.tsx src/features/shop/ShopPages.test.tsx -t 'tema aislado|eleva fotos reales|limita el collage|muestra precio desde centavos|es pública|combina filtros|no aplica precios inválidos|cambiar el orden|al volver desde el detalle|permite elegir|añade al carrito|el máximo es el límite|si la imagen falla|sin destacados'` → exit 0, 15 aprobados y 12 excluidos por selección, dos archivos, 2.26s. Aviso del entorno: jsdom no implementa `window.scrollTo` (paginación existente).
- `PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=error pnpm exec tsc -p tsconfig.app.json --noEmit --incremental false` → exit 0, sin emisión ni caché de compilación.
- Durante la adaptación del test estructural hubo dos fallos corregidos: tipos Node no incluidos por defecto en el proyecto app y CSS `?raw` omitido por Vitest. El test final lee CSS con tipos Node explícitos, sin cambiar configuración.

## Revisión pendiente

La prueba CSS es estructural, no evidencia visual de contraste, hover o reflow en navegador. No se ejecutó navegador ni batería completa, integración, E2E o build. El padre debe pedir autorización al final para la batería completa y revisar móviles/teclado/ambos temas, además de la integración con T2–T4.

**Riesgo:** los tokens compartidos cambian la presentación de todas las páginas de tienda; verificar su composición con las hojas aisladas de T2–T4. No se modificaron contratos de datos ni lógica comercial en T1. La preferencia de tema se conserva durante la navegación de tienda, pero se reinicia a claro al remontar el layout.
