import type { ReactNode } from 'react'
import { formatCurrency } from '../../lib/format/formatCurrency'
import type { Product } from '../products/types'
import { formatPhone, formatTimeLabel, splitScheduledAt } from './orderInput'
import { estimateOrderTotal } from './orderValidation'
import type { OrderFormValues } from './types'

const PAYMENT_LABELS = { CASH: 'Efectivo', TRANSFER: 'Transferencia' } as const

const dayFormatter = new Intl.DateTimeFormat('es-EC', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

/** «2030-01-02» → «miércoles, 2 de enero de 2030» (se lee como fecha civil, sin huso horario). */
function formatDay(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) ? '' : dayFormatter.format(parsed)
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="order-summary__row">
      <dt>{label}</dt>
      <dd>{children || <span className="order-summary__empty">—</span>}</dd>
    </div>
  )
}

interface OrderSummaryProps {
  values: OrderFormValues
  products: Product[]
  /** El botón de registrar va al pie del resumen. */
  children: ReactNode
}

/** Lo que se va registrando, a la vista mientras se llena el formulario. */
export function OrderSummary({ values, products, children }: OrderSummaryProps) {
  const buyer =
    values.buyerType === 'REGISTERED_CLIENT' ? (values.client?.name ?? '') : values.buyerName.trim()
  const { date, time } = splitScheduledAt(values.scheduledAt)
  const when = [formatDay(date), time ? formatTimeLabel(time) : ''].filter(Boolean).join(', ')
  const lines = values.items.flatMap(({ productId, quantity }) => {
    const product = products.find((candidate) => candidate.id === productId)
    return product ? [{ product, quantity: Number.parseInt(quantity, 10) || 0 }] : []
  })

  return (
    <section className="order-summary" aria-labelledby="order-summary-title">
      <h3 id="order-summary-title">Resumen de la venta</h3>
      <dl>
        <Row label="Comprador">
          {[buyer, formatPhone(values.buyerPhone)].filter(Boolean).join(' · ')}
        </Row>
        {values.giftToOther && (
          <Row label="Recibe">
            {[values.recipientName.trim(), formatPhone(values.recipientPhone)]
              .filter(Boolean)
              .join(' · ')}
          </Row>
        )}
        <Row label="Pago">{values.paymentMethod ? PAYMENT_LABELS[values.paymentMethod] : ''}</Row>
        <Row label="Entrega">{when}</Row>
        <Row label="Dirección">{values.deliveryAddress.trim()}</Row>
      </dl>

      {lines.length > 0 && (
        <ul className="order-summary__items" aria-label="Productos de la venta">
          {lines.map(({ product, quantity }, index) => (
            <li key={`${product.id}-${index}`}>
              <span>
                {quantity} × {product.name}
              </span>
              <span>{formatCurrency(product.price * quantity)}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="order-summary__total">
        <span>Subtotal</span>
        <strong>{formatCurrency(estimateOrderTotal(values.items, products))}</strong>
      </p>
      <p className="order-summary__note text-muted">
        Sin IVA: el total final sale en el comprobante.
      </p>
      {children}
    </section>
  )
}
