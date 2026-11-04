import { formatDateTime } from '../../../lib/format/formatDateTime'
import { formatCents } from '../money'
import type { Quote } from './checkoutTypes'

/**
 * Desglose tal como lo calculó el servidor: no se suma ni se redondea nada en React.
 * El IVA es simulado (configurable por el ADMIN) y el envío ya está incluido en los precios.
 */
export function QuoteSummary({ quote, title = 'Total a pagar' }: { quote: Quote; title?: string }) {
  return (
    <section className="cart-summary quote-summary" aria-label={title}>
      <h2>{title}</h2>
      <ul className="quote-summary__lines">
        {quote.items.map((line) => (
          <li key={line.productId}>
            <span>
              {line.quantity} × {line.name}
              <small> ({formatCents(line.unitPriceCents)} c/u)</small>
              {!line.available && (
                <strong className="cart-line__problem">
                  {' '}
                  · Solo {line.availableStock} disponibles
                </strong>
              )}
            </span>
            <span>{formatCents(line.lineTotalCents)}</span>
          </li>
        ))}
      </ul>
      <dl>
        <div>
          <dt>Subtotal</dt>
          <dd>{formatCents(quote.subtotalCents)}</dd>
        </div>
        <div>
          <dt>Envío</dt>
          <dd>Envío gratis {formatCents(quote.shipping.amountCents)}</dd>
        </div>
        <div>
          <dt>
            {quote.tax.enabled
              ? `IVA simulado ${quote.tax.ratePercent} %`
              : 'IVA simulado desactivado'}
          </dt>
          <dd>{formatCents(quote.tax.amountCents)}</dd>
        </div>
        <div className="cart-summary__total">
          <dt>Total</dt>
          <dd>{formatCents(quote.totalCents)}</dd>
        </div>
      </dl>
      <p className="text-muted">
        Cotización vigente hasta las {formatDateTime(quote.validUntil)} · configuración v
        {quote.settingsVersion}. El IVA es ficticio, no es un impuesto oficial. No se reserva stock
        hasta pagar.
      </p>
    </section>
  )
}
