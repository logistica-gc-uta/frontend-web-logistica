import { formatCents } from '../money'
import type { OrderAmounts as Amounts } from './customerOrdersService'

/** Desglose histórico de un pedido: importes y tasa al comprar, sin recalcular. */
export function OrderAmounts({ amounts }: { amounts: Amounts }) {
  const percent = amounts.taxRateBps / 100
  return (
    <dl className="order-amounts">
      <div>
        <dt>Subtotal</dt>
        <dd>{formatCents(amounts.subtotalCents)}</dd>
      </div>
      <div>
        <dt>{amounts.taxEnabled ? `IVA ${percent} %` : 'IVA no aplicado'}</dt>
        <dd>{formatCents(amounts.taxAmountCents)}</dd>
      </div>
      <div>
        <dt>Envío</dt>
        <dd>{formatCents(amounts.shippingAmountCents)}</dd>
      </div>
      <div className="cart-summary__total total">
        <dt>Total</dt>
        <dd>{formatCents(amounts.totalCents)}</dd>
      </div>
    </dl>
  )
}
