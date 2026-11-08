# REGALÍA — Corrección de fidelidad visual en entrega y pago (06 y 07)

Documento de evidencia para la corrección de fidelidad visual autorizada por el usuario («listo continua con la implementacion y mejora», S11-S12) en las vistas de entrega (`CheckoutPage`) y pago (`PaymentPage`), según los prototipos aprobados `../backend/design/regalia-dual-theme/06-delivery.html` y `07-payment.html`.

## Lista de verificación de estructura y diseño (Antes vs. Después)

| Elemento / Sección | Estado Anterior | Estado Corregido (Aprobado) | Prototipo de Referencia |
| --- | --- | --- | --- |
| **Navegación de pasos (Stepper)** | Lista básica con círculos planos sin conectores visibles ni enlaces de retorno. | Barra `.checkout__steps.steps` con números circulares `.step-number`, separadores flecha `→` mediante `::before`, estado activo en vino/verde según tema, y enlace interactivo en paso 2 hacia el paso 1. | `06-delivery.html` / `07-payment.html` (`.steps`) |
| **Leyenda de horario de entrega** | Encabezado extenso: `Cuándo · Horario de Ecuador (Ambato)`. | Leyenda concisa y aprobada: `¿Cuándo entregamos?`, manteniendo en el texto secundario la precisión del horario de Ambato/Ecuador. | `06-delivery.html` (`legend: ¿Cuándo entregamos?`) |
| **Barra lateral previa a cotizar (Checkout)** | Colapso visual severo: 3 líneas de texto en un bloque vacío que desequilibraba toda la pantalla frente al formulario largo. | Resumen honesto no cotizado (`checkout__unquoted`): lista de regalos reales del carrito con miniaturas 48×54 (`ProductImage`), nombre, cantidad, precio unitario y total por línea, subtotal estimado y leyenda `Total al confirmar la entrega`, con enlace directo `← Ver bolsa`. | `06-delivery.html` (`aside.summary`) |
| **Resumen cotizado (`QuoteSummary`)** | Desglose sin miniaturas visuales ni jerarquía de cuadrícula alineada al boceto. | Cuadrícula estructural de 3 columnas (miniatura 48×54, información con nombre y cantidad, e importe monetario tabular a la derecha), seguida de desglose con subtotal, envío gratis, IVA, total destacado y vigencia temporal. | `06-delivery.html` y `07-payment.html` (`.item`, `dl`) |
| **Encabezado principal de pago** | Título genérico `<h1>Pago</h1>`. | Título conciso del boceto: `<h1>El último paso.</h1>` con subtítulo `Revisa tu entrega y completa los datos de pago.`. | `07-payment.html` (`h1: El último paso.`) |
| **Bloque de resumen de entrega en pago** | Presentación sin enlace inferior de retorno. | Estructura enmarcada con destinatario, teléfono, dirección, horario en Ecuador y doble enlace de retorno (`Volver a entrega` superior y `← Volver a entrega` inferior). | `07-payment.html` (`.delivery`, `.back`) |
| **Formulario de tarjeta y ayuda de pruebas** | Formulario funcional pero sin rejilla de 3 columnas para vencimiento/CVV ni detalles estilizados de tarjetas de prueba. | Campos alineados en cuadrícula responsiva (número y titular al 100%, mes/año/CVV en fila de 3), botón de confirmación de ancho completo, y desplegable `<details className="payment__demo-cards">` con advertencia de demostración y fixtures públicos. | `07-payment.html` (`.card-fields`, `details`) |

## Preservación de contratos e invariantes

1. **Datos reales y servicios:** No se inventaron importes finales ni se duplicó aritmética de negocio. El backend sigue siendo la única autoridad de cotización (`checkoutService.quote`) y cobro (`checkoutService.pay`).
2. **Idempotencia y seguridad:** Se conserva intacta la generación y persistencia previa de clave UUID en `sessionStorage` (`pendingKey`), impidiendo pagos duplicados ante recargas o caídas de red.
3. **Flujo de rechazo e incertidumbre:** El borrado de CVV ante rechazo (`07A`) y la verificación en bucle con estado incierto (`07B`) permanecen completamente funcionales sin alteraciones lógicas.
4. **Independencia de temas:** Los estilos son exclusivamente de ámbito local (`checkout-presentation.css`), compatibles con `--color-*` y `--shop-*` tanto en modo claro como vino.

## Verificación ejecutada

- **Pruebas unitarias y de integración de checkout:**
  - Comando: `PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=error pnpm test src/features/shop/checkout`
  - Resultado: 3 archivos de prueba pasados, 54 pruebas exitosas, 0 fallos (código de salida: 0).
  - Incluye casos enfocados para:
    - Despliegue del resumen no cotizado con ítems del carrito y leyenda aprobada `¿Cuándo entregamos?`.
    - Encabezado `El último paso.` y enlaces de retorno a entrega en pantalla de pago.
    - Cotización, expiración, rechazo, verificación de intento y persistencia de clave.
- **Verificación de tipos:**
  - Comando: `pnpm exec tsc --noEmit`
  - Resultado: 0 errores de TypeScript (código de salida: 0).
