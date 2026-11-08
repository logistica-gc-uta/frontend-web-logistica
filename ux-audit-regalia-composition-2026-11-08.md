# Auditoría UX acotada — Composición e imágenes de REGALÍA

## Alcance y evidencia

Revisión de home, ocasiones, tarjetas y detalle de producto de la tienda web para compradores no especializados. Evidencia: capturas aportadas por el usuario, bocetos aprobados 01–03 y CSS actual de `src/styles/shop.css`. Se aplican `ui-ux-pro-max` (escalado de imágenes y adaptación) y `ux-audit` (jerarquía, densidad, ritmo e imagen). Esta auditoría no cubre pagos, autenticación ni accesibilidad exhaustiva y no certifica conformidad WCAG.

Las capturas anteriores y posteriores se conservan junto a este informe en `docs/evidencias/regalia-composition-evidence/`. Los hallazgos y referencias de línea iniciales son históricos; el resultado observado se documenta en la sección final. El informe inicial precedió a la corrección de código.

## Lo más importante

El ancho ampliado corrigió los márgenes excesivos del catálogo, pero esa misma política aplicada a todas las páginas desequilibró home y detalle. Las cinco ocasiones reales no caben en la cuadrícula fija de cuatro columnas sin crear una fila adicional. Las fotografías conservan su proporción interna, pero `cover` recorta el objeto para llenar cajas demasiado panorámicas. El boceto usaba ilustraciones SVG encuadradas con contenido controlado, por lo que no ejercitó esas condiciones. Se debe conservar la identidad aprobada y corregir las reglas de composición y fotografía, no volver a cambiar colores.

## Hallazgos antes de la corrección (histórico)

| ID | Hallazgo | Dimensión | Gravedad | Confianza | Esfuerzo |
|---|---|---|---|---|---|
| VIS-01 | Cinco ocasiones en una cuadrícula fija de cuatro columnas | Ritmo y distribución | Media | Observado en captura + código | S |
| VIS-02 | Fotografía de tarjeta recortada por caja panorámica | Representación del producto | Media | Observado en captura + código | S |
| VIS-03 | Galería del detalle excesivamente ancha y recortada | Jerarquía y fotografía | Media | Observado en captura + código | M |
| VIS-04 | Hero con gran vacío entre texto y collage | Densidad y composición | Media | Observado en captura + código | S |

### VIS-01 — Ocasiones

**Evidencia:** la captura presenta cuatro ocasiones y «Graduaciones» aislada debajo. `shop.css:676–684` define `repeat(4, 1fr)`. El boceto tenía cuatro elementos, mientras los datos reales ofrecen cinco.

**Consecuencia:** el bloque consume otra fila y desplaza productos hacia abajo sin aprovechar el ancho de escritorio.

**Corrección autorizada:** una sola fila para las ocasiones visibles en escritorio; en pantallas estrechas, una tira horizontal interna con controles/enlaces legibles y sin desbordar la página. No ocultar categorías ni inventarlas para completar una cantidad fija.

### VIS-02 — Tarjetas

**Evidencia:** `shop.css:1069–1076` combina ancho completo, proporción preferida 16:10, máximo de 170px y `object-fit: cover`. Al crecer el ancho sin crecer la altura, la caja se vuelve panorámica y recorta la fotografía.

**Consecuencia:** no se ve el encuadre completo del producto. El problema es recorte, no evidencia de estiramiento no uniforme.

**Corrección autorizada:** marco estable independiente de la orientación del archivo, imagen con `contain`, proporción natural y fondo neutro. La fotografía no debe perder partes para llenar el marco. El tamaño del catálogo no debe imponer el del detalle ni el del collage.

### VIS-03 — Detalle

**Evidencia:** `shop.css:1199–1224` usa la anchura compartida, columnas 1.15:1 y una foto con máximo de 380px y `cover`; el CTA llena toda la columna. La captura muestra un objeto cortado y una zona de compra demasiado extendida.

**Consecuencia:** se dificulta examinar el objeto y se pierde el equilibrio entre galería e información que tenía el boceto.

**Corrección autorizada:** contenedor de detalle propio y acotado, galería con imagen completa, título/importe/cantidad/acción agrupados, sin alterar la lógica de compra ni los datos reales. No inventar contenido comercial para rellenar espacio.

### VIS-04 — Home

**Evidencia:** el contenedor común llega a2240px; el texto y el collage conservan límites cercanos a520 y500px (`shop.css:128–152,376–399,480–485`). La captura muestra un gran vacío central.

**Consecuencia:** las dos mitades dejan de sentirse como una composición; aumentar la superficie no aumenta la calidad de la jerarquía.

**Corrección autorizada:** límite editorial propio para home y reglas adaptativas independientes del catálogo ancho. Conservar la interacción hover/foco de las tarjetas sin navegación ni salto de página.

## Prioridad de corrección

1. VIS-02 y VIS-03: producto completo y política de encuadre coherente.
2. VIS-01: ocasiones en una fila de escritorio.
3. VIS-04: restablecer equilibrio del hero con un límite editorial propio.

## Qué se conserva

Paleta clara verde/crema y alternativa vino, navegación real, datos/precios/stock del servidor, enlaces de tarjeta completa, separación del carrito y lógica de autenticación/cotización/pago. No se modifican datos de prueba ni se habilitan compras nuevas durante esta revisión.

## Límites y comprobación posterior

Se verificarán únicamente las reglas afectadas, con capturas antes/después en escritorio ancho y móvil, geometría de ocasiones y proporción/encuadre de imágenes. La batería completa sigue requiriendo autorización final. No se acepta el cambio por ausencia de scroll horizontal solamente. Ningún hallazgo de gusto se presenta como fallo de seguridad o bloqueo de compra.

## Resultado posterior observado

- **VIS-01:** cinco ocasiones en una fila real a2551 y1440px; en768/390/320px permanecen en una fila con desplazamiento dentro de la sección, sin ensanchar la página.
- **VIS-02:** imagen de tarjeta con `contain` en un marco propio4:3; el objeto completo se observa en la captura posterior. No se cambian fotografías ni datos.
- **VIS-03:** detalle de1280px máximo en escritorio y galería6:5 con imagen completa, no una banda de1120×380. En viewport2551 la caja de la foto mide aproximadamente623×514 y conserva el archivo800×800 sin recortarlo mediante `contain`.
- **VIS-04:** home limitado a1440px; el catálogo conserva2240px en escritorio ancho. La misma expansión ya no se aplica a todas las superficies.

Las15comprobaciones de navegador (home/detalle/catálogo en2551/1440/768/390/320) terminaron con exit0. Evidencia computada: [after-measurements.json](docs/evidencias/regalia-composition-evidence/after-measurements.json). El padre abrió e inspeccionó las capturas de home, tarjeta, detalle2551 y home390. No se infiere aceptación de otras pantallas o estados no observados.

| Antes | Después |
|---|---|
| [Home](docs/evidencias/regalia-composition-evidence/before-home-2551.png) | [Home](docs/evidencias/regalia-composition-evidence/after-home-2551.png) |
| [Ocasiones](docs/evidencias/regalia-composition-evidence/before-occasions-2551.png) | [Ocasiones](docs/evidencias/regalia-composition-evidence/after-occasions-2551.png) |
| [Tarjeta](docs/evidencias/regalia-composition-evidence/before-card-2551.png) | [Tarjeta](docs/evidencias/regalia-composition-evidence/after-card-2551.png) |
| [Detalle](docs/evidencias/regalia-composition-evidence/before-detail-2551.png) | [Detalle](docs/evidencias/regalia-composition-evidence/after-detail-2551.png) |

Comprobación puntual del padre:15casos seleccionados aprobados,21omitidos; TypeScript app sin emisión y diffcheck aprobaron. La revisión independiente acotada no encontró bloqueadores en VIS-01–04 mediante código y capturas; no ejecutó pruebas ni certificó flujos de compra. No se ejecutan suite global, integración real, compras, despliegue ni pruebas autenticadas completas.

### Legibilidad móvil adicional

La primera captura específica de ocasiones mostró cortes dentro de «Cumpleaños» y «Graduaciones». Se conservó como evidencia intermedia y se amplió el mínimo móvil a200px, sin cambiar la fila de escritorio. La recaptura en390/320px confirmó las cinco etiquetas en una línea de texto cada una, sin ensanchar la página y con la última ocasión accesible mediante foco. El padre abrió la captura final para observarlo, no solo el JSON.

Evidencia final: [inicio390](docs/evidencias/regalia-composition-evidence/after-occasions-390-readable-start.png), [última tarjeta320 con foco](docs/evidencias/regalia-composition-evidence/after-occasions-320-readable-end.png) y [mediciones](docs/evidencias/regalia-composition-evidence/mobile-occasions-readable.json). Después del ajuste, la selección puntual volvió a pasar15casos con21omitidos y diffcheck0; no se repitió una suite global. La revisión independiente previa no observó estas nuevas capturas: son verificación directa del padre.
