# REGALÍA — Presentación cliente aprobada

La implementación sigue los diez bocetos aprobados de `../backend/design/regalia-dual-theme/` y la decisión de presentación documentada en `../backend/docs/REGALIA-UI-PRESENTATION.md`.

## Decisión de textos

Aprobación literal: «le quitamos pero si tiene que estar documentado.»

- La vista cliente utiliza «Pago», «IVA» y «Comprobante de compra», sin repetir explicaciones técnicas del simulador, redondeo, backend ni validez tributaria.
- El sistema sigue siendo una demostración académica: no tiene pasarela bancaria real ni emite documentos tributarios oficiales. Solo acepta las tarjetas sintéticas definidas en el proyecto; no deben utilizarse tarjetas reales. La ayuda desplegable conserva las instrucciones de prueba, fuera del formulario principal.
- Los cálculos continúan en centavos y los importes definitivos proceden de la cotización del backend. Los pedidos y comprobantes conservan sus importes históricos.
- El campo `disclaimer` permanece en la API y en el snapshot; la decisión solo elimina su presentación al cliente y su impresión.
- No se introducen datos, escenarios de pago, límites experimentales ni mapas ilustrativos del boceto en los flujos reales. Se conservan Leaflet, autenticación, validaciones, clave idempotente, consulta de intentos y recuperación pendiente.
- No se habilita el simulador en nuevos entornos ni se autoriza publicación o despliegue. Cualquier exposición pública requiere revisión humana separada de los requisitos de comunicación aplicables.

## Evidencia de implementación disponible

| Unidad | Comprobación puntual observada |
| --- | --- |
| Base visual y descubrimiento | 15 casos seleccionados aprobados, 12 excluidos; TypeScript app sin emisión aprobado |
| Carrito y acceso | 23 casos seleccionados aprobados, 5 excluidos |
| Entrega y pago | 33 casos enfocados aprobados |
| Pedidos y comprobante | 13 casos enfocados aprobados |
| Parámetro de filtro de pedidos | RED: 1 fallo/1 aprobado; GREEN: 2 aprobados, conserva consulta anterior |
| Correcciones móvil/impresión | RED: 2 fallos estructurales; GREEN: 4 aprobados, incluyendo regresiones de tema |

Estos resultados no constituyen una batería completa ni evidencia visual. Se preservan en `odd/tasks/regalia-approved-ui.md` los fallos de preparación y aserciones corregidas; no se contabilizan como pruebas aprobadas. Una revisión independiente de fuente detectó dos problemas de CSS; ambos quedaron corregidos y revisados de forma acotada en fuente. No se comprobó impresión física ni renderizado móvil.

## Pendiente de autorización

La persona responsable priorizó implementar y solicitó autorización al final antes de la batería completa. No se ejecutaron build completo, suite global, integración, E2E ni revisión visual en navegador. Las pruebas contra APIs reales deben usar estado aislado y no la base compartida de revisión. Ninguna prueba puntual, revisión de fuente o aprobación visual autoriza despliegue, merge, push o PR.
