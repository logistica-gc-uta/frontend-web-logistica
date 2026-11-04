import { formatCents } from '../money'
import type { OrderAmounts as Amounts } from './customerOrdersService'

/** Desglose histórico de un pedido: el IVA simulado y la tasa aplicados al comprar, sin recalcular. */
export function OrderAmounts({ amounts }: { amounts: Amounts }) {
  const percent = amounts.taxRateBps / 100
  return (
    <dl className="order-amounts">
      <div>
        <dt>Subtotal</dt>
        <dd>{formatCents(amounts.subtotalCents)}</dd>
      </div>
      <div>
        <dt>{amounts.taxEnabled ? `IVA simulado ${percent} %` : 'IVA simulado desactivado'}</dt>
        <dd>{formatCents(amounts.taxAmountCents)}</dd>
      </div>
      <div>
        <dt>Envío</dt>
        <dd>Envío gratis {formatCents(amounts.shippingAmountCents)}</dd>
      </div>
      <div className="cart-summary__total">
        <dt>Total (incluye IVA simulado)</dt>
        <dd>{formatCents(amounts.totalCents)}</dd>
      </div>
    </dl>
  )
}
