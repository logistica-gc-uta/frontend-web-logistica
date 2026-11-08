import { useCallback, useMemo } from 'react'
import { useFetch } from '../../../hooks/useFetch'
import { ProductImage } from '../components/ProductImage'
import type { ShopProduct } from '../types'
import { loadCheckoutProducts } from './checkoutProducts'
import { formatDateTime } from '../../../lib/format/formatDateTime'
import { formatCents } from '../money'
import type { Quote } from './checkoutTypes'

/**
 * Desglose tal como lo calculó el servidor: no se suma ni se redondea nada en React.
 * El IVA es simulado (configurable por el ADMIN) y el envío ya está incluido en los precios.
 */
export function QuoteSummary({
  quote,
  title = 'Total a pagar',
  products,
}: {
  quote: Quote
  title?: string
  products?: ReadonlyMap<string, ShopProduct | null>
}) {
  const ids = useMemo(() => quote.items.map((line) => line.productId), [quote.items])
  const fetchProducts = useCallback(
    async () => products ?? loadCheckoutProducts(ids),
    [products, ids],
  )
  const metadata = useFetch(fetchProducts)
  const photos = products ?? metadata.data

  return (
    <section className="cart-summary quote-summary" aria-label={title}>
      <p className="checkout__eyebrow">Tu pedido</p>
      <h2>{title}</h2>
      <ul className="quote-summary__lines">
        {quote.items.map((line) => (
          <li key={line.productId} className="quote-summary__line">
            <ProductImage
              src={photos?.get(line.productId)?.primaryImageUrl ?? null}
              alt={line.name}
              className="quote-summary__thumb"
            />
            <div className="quote-summary__line-info">
              <strong>{line.name}</strong>
              <span className="text-muted">
                {line.quantity} × <small>({formatCents(line.unitPriceCents)} c/u)</small>
              </span>
              {!line.available && (
                <strong className="cart-line__problem">
                  {' '}
                  · Solo {line.availableStock} disponibles
                </strong>
              )}
            </div>
            <b className="money">{formatCents(line.lineTotalCents)}</b>
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
            {quote.tax.enabled ? `IVA ${quote.tax.ratePercent} %` : 'IVA no aplicado'}
          </dt>
          <dd>{formatCents(quote.tax.amountCents)}</dd>
        </div>
        <div className="cart-summary__total">
          <dt>Total</dt>
          <dd>{formatCents(quote.totalCents)}</dd>
        </div>
      </dl>
      <p className="text-muted">
        Total vigente hasta las {formatDateTime(quote.validUntil)}.
      </p>
    </section>
  )
}
