# Guía de diseño — REGALÍA

Estilo: **minimalista, sobrio y cálido**. Verde profundo sobre beige, esquinas casi rectas, tipografía editorial para los títulos y texto limpio para leer. Esta guía resume lo que hemos venido aplicando en la tienda y en el panel de administración.

Fuentes de verdad en el código:

- Tienda: [src/styles/shop.css](src/styles/shop.css) (tokens bajo `.shop`) y los `*-presentation.css` de cada vista.
- Panel admin: [src/index.css](src/index.css) (tokens en `:root`).

---

## 1. Principios

1. **Esquinas mínimas.** Nada de bordes muy redondeados: 2–6 px. Solo se permite el redondeo total (999 px) en chips y puntos.
2. **Poco ruido.** Sin líneas divisorias decorativas, sin descripciones largas, sin íconos donde la letra basta (p. ej. el menú del panel).
3. **Jerarquía editorial.** Títulos en serif (Georgia / Young Serif), cuerpo en sans.
4. **Un solo tema claro.** No hay modo oscuro: se quitó el botón de invertir color en tienda y panel.
5. **Cambios de uno en uno.** Cada vista se ajusta por separado y se valida visualmente antes de seguir.

---

## 2. Paleta

| Token | Valor | Uso |
| --- | --- | --- |
| `--color-text` / `--color-heading` / `--color-accent` | `#234D3E` | Texto, títulos, botones primarios, menú lateral |
| `--color-accent-strong` | `#15382B` | Hover de botones primarios |
| `--color-accent-soft` | `#E4EBDF` | Fondos suaves verdes |
| `--color-muted` | `#4F6257` | Texto secundario |
| `--color-bg` | `#F8F6F1` | Fondo de página (beige) e inputs |
| `--color-surface` | `#FFFFFF` | Tarjetas y paneles |
| `--color-surface-sunken` | `#E9EEE5` | Zonas hundidas |
| `--color-border` | `#D7DDD7` | Bordes y separadores |
| `--color-sand` | `#B98A54` | Acento arena: ítem activo, detalles |
| `--color-sand-strong` | `#79562E` | Arena oscuro |
| `--color-sand-soft` | `#F5E8D9` | Fondo arena suave |
| `--color-signal` / `-soft` | `#96320D` / `#FCEBE1` | Avisos |
| `--color-danger` / `-soft` | `#B42318` / `#FDECEA` | Errores |
| `--color-success` / `-soft` | `#2F6B4F` / `#E5F0EA` | Éxito |

Acentos pastel de las tarjetas de ocasión (tienda): `--shop-rose #F3E4E2`, `--shop-sage #E4EBDF`, `--shop-peach #F5E8D9`, `--shop-lilac #EAE5F0`.

Menú lateral (admin): fondo `#234D3E`, texto `#FFFFFF`, texto atenuado `#D7DDD7`, líneas `#4F6257`.

---

## 3. Tipografía

| Rol | Fuente | Notas |
| --- | --- | --- |
| Marca / títulos | `Georgia, 'Times New Roman', serif` (tienda); `Young Serif` (logo del panel) | Interletrado negativo en títulos grandes (`-0.025em` a `-0.035em`) |
| Cuerpo (tienda) | `system-ui, -apple-system, 'Segoe UI', sans-serif` | |
| Cuerpo (admin) | `IBM Plex Sans` | |

Tamaños de referencia:

- Título de página: `clamp(30px, 3.2vw, 42px)` a `clamp(38px, 4.2vw, 56px)` según la vista (hero el mayor).
- Subtítulos y etiquetas en mayúsculas: `0.6875rem`–`0.75rem`, peso 600–650, `letter-spacing` `0.12em`–`0.17em`.
- Texto de navegación del panel: `0.9375rem`, peso 400 (activo 600).

---

## 4. Forma y espacio

| Token | Valor |
| --- | --- |
| `--radius-sm` | `4px` |
| `--radius-md` | `6px` |
| `--radius-lg` | `6px` (tienda y admin) |
| Chips / puntos | `999px` |
| Foco | `0 0 0 3px` del acento al 30–35 % de opacidad |

Alturas táctiles: controles de 44 px (botón de menú, cerrar sesión en rail, filas del menú).

---

## 5. Componentes

### Inputs y formularios
- Fondo **beige** (`--color-bg`), borde suave (`--color-border`), esquinas 4–6 px.
- Foco con borde/acento verde y `--focus-ring`; también cubre el autofill del navegador.
- Mismo criterio en login de cliente y login de admin (`.auth-card .field__input`, tarjeta blanca estirada).
- Selects con `appearance: base-select` y panel `::picker(select)` cuando el navegador lo soporta, con alternativa normal.

### Botones
- Primario: fondo verde `#234D3E`, texto blanco, hover `#15382B`.
- Secundario: contorno, esquinas 4 px.
- Enlaces de acción ("Quitar filtros"): texto plano, sin caja.

### Tarjetas de producto y categoría
- Categoría arriba, título y precio **centrados**, precio más grande.
- Altura uniforme entre tarjetas; descripción corta.
- Sin precios en USD en placeholders.

### Cabecera de la tienda
- Menú centrado (Inicio, Catálogo) con desplegable tipo combo: translúcido, poco redondeado.
- Sin toggle de tema y sin buscador en la cabecera: la búsqueda vive dentro del recuadro verde del hero.

### Hero y portada
- Recuadro verde con el buscador dentro; subtítulo en una sola línea.
- Carrusel "Cada ocasión" con desplazamiento ligado al scroll (`--occasion-shift`).

### Catálogo
- Sin breadcrumb ni descripción en la lista; título grande centrado.
- Filtros en una sola barra estilo Airbnb: angosta, baja y redondeada; chips de filtros activos + "Quitar filtros".
- Solo se muestra el total de resultados.

### Carrito, cuenta y pedidos
- Carrito: resumen fijo (sticky) a un lado.
- Login/registro sin scroll; "Mi cuenta" y "Mis pedidos" con la misma sobriedad.
- Footer solo en las páginas de exploración (no en carrito, cuenta ni login).

### Footer
- Más alto, íconos de redes, copyright centrado, sin línea divisoria; el logo no es un enlace.

---

## 6. Panel de administración

### Menú lateral
- Fondo verde, ancho completo con botón de **contraer/expandir** (`«` / `»`, 32×32, radio 4) alineado con las flechas de los grupos; la preferencia se guarda en `regalia.admin-menu-collapsed`.
- **Grupos desplegables** (acordeón): Operación, Territorio, Tienda. Títulos en mayúsculas pequeñas con chevrón; se abre solo el grupo de la página actual y la elección se recuerda en `regalia.admin-menu-groups`.
- **Línea de ruta con paradas circulares:** una línea vertical de 2 px por grupo y un círculo de 10 px por opción; el activo va relleno en arena con fondo arena al 16 %.
- **Sin íconos** en las opciones: solo texto.
- Modo contraído (≥ 901 px): rail de 72 px con las paradas centradas, etiquetas solo para lectores de pantalla y cerrar sesión como botón de ícono.
- En pantallas angostas: barra superior con botón "Menú".

### Inicio del panel
- Encabezado mínimo: título y fecha de la operación. Sin etiqueta "REGALÍA · Logística" ni saludo (la marca y el nombre ya están en el menú lateral).
- Tarjetas con radio `--radius-lg` (6 px).

### Pedidos (formulario de venta)
- Cuadros con una **línea fina bajo el título** que lo separa del contenido.
- Formulario en dos columnas: a la izquierda los grupos (Comprador, Quién recibe, Pago, Entrega, Productos) con título en mayúsculas pequeñas; a la derecha el mapa y el **resumen de la venta** (comprador, pago, entrega, productos, subtotal y botón), que acompaña al desplazarse.
- Controles compactos: **38 px** de alto (no 44 px).
- Radios y casillas como opciones: la elegida se pinta de verde con borde y círculo/visto marcados.
- Nombres solo con letras; teléfonos con prefijo fijo **+593** y 9 dígitos que empiezan con 9; notas y dirección admiten cualquier carácter.
- Fecha con calendario y hora en una lista cada 30 min dentro del horario, escrita con a. m. / p. m.
- Cantidad con − / +, tope en el stock y aviso al lado del campo con el problema.

### Login de admin
- Tarjeta blanca, inputs beige igual que el de cliente, sin selector de tema.

---

## 7. Accesibilidad

- `aria-expanded` / `aria-controls` en el botón de contraer y en cada grupo del menú.
- Etiquetas ocultas visualmente (no eliminadas) en el rail contraído; `title` en cada opción.
- Elementos decorativos con `aria-hidden`.
- Contraste: texto `#234D3E` sobre `#F8F6F1` y blanco sobre `#234D3E`.
- Preferencias de usuario guardadas en `localStorage` siempre dentro de `try/catch`.

---

## 8. Convenciones de CSS

- Estilos de la tienda con alcance bajo `.shop`; los del panel en `src/index.css`.
- Colores siempre por token; mezclas con `color-mix(in srgb, …)`.
- Los tests (vitest/jsdom) no cargan CSS: la presentación se valida con capturas.
