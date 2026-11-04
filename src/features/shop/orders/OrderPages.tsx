import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { paths, shopOrderPath, shopReceiptPath } from '../../../app/paths'
import { AsyncContent } from '../../../components/ui/AsyncContent'
import { Button } from '../../../components/ui/Button'
import { Pagination } from '../../../components/ui/Pagination'
import { useFetch } from '../../../hooks/useFetch'
import { formatDateTime } from '../../../lib/format/formatDateTime'
import { useCart } from '../cart/cartContext'
import { ProductImage } from '../components/ProductImage'
import { formatCents } from '../money'
import { customerOrdersService, type CustomerOrderDetail } from './customerOrdersService'
import { OrderAmounts } from './OrderAmounts'
import { CUSTOMER_ORDER_STATUS, statusBadgeClass } from './orderStatus'

const useOrder = (id: string) => {
  const load = useCallback(() => customerOrdersService.detail(id), [id])
  return useFetch(load, 'No se pudo cargar el pedido')
}

function OrderItems({ order }: { order: CustomerOrderDetail }) {
  return (
    <ul className="order-items">
      {order.items.map((item) => (
        <li key={item.productId}>
          <ProductImage src={item.imageUrl} alt={item.name} className="order-items__image" />
          <span>
            {item.quantity} × {item.name}
            <small className="text-muted">
              {' '}
              ({formatCents(item.unitPriceCents)} c/u al comprar)
            </small>
          </span>
          <strong>{formatCents(item.lineTotalCents)}</strong>
        </li>
      ))}
    </ul>
  )
}

function DeliveryFacts({ order }: { order: CustomerOrderDetail }) {
  return (
    <dl className="order-facts">
      <div>
        <dt>Entrega programada</dt>
        <dd>{formatDateTime(order.delivery.scheduledDeliveryDate)} (hora de Ecuador)</dd>
      </div>
      <div>
        <dt>Recibe</dt>
        <dd>
          {order.recipient.name} · {order.recipient.phone}
        </dd>
      </div>
      <div>
        <dt>Dirección</dt>
        <dd>
          {order.delivery.address} · {order.delivery.zoneName}
        </dd>
      </div>
      <div>
        <dt>Ubicación confirmada</dt>
        <dd>
          {order.delivery.location.lat.toFixed(5)}, {order.delivery.location.lng.toFixed(5)}
        </dd>
      </div>
      {order.delivery.notes && (
        <div>
          <dt>Indicaciones</dt>
          <dd>{order.delivery.notes}</dd>
        </div>
      )}
    </dl>
  )
}

/** Llega desde el pago aprobado: es la única vía que vacía el carrito. */
export interface ConfirmationLocationState {
  justPaid?: boolean
}

/**
 * 12 · Compra confirmada. Solo muestra éxito con el pedido que devuelve el servidor para esta
 * cuenta: abrir la ruta a mano con un ID ajeno o inventado no muestra ninguna confirmación.
 */
export function ConfirmationPage() {
  const { id = '' } = useParams()
  const order = useOrder(id)
  const { pathname, state } = useLocation()
  const navigate = useNavigate()
  const justPaid = (state as ConfirmationLocationState | null)?.justPaid === true
  const { clear: clearCart } = useCart()
  const confirmed = order.data !== undefined

  // El carrito se vacía solo con la compra persistida que devuelve el servidor, y una sola vez:
  // se quita la marca del historial para que recargar no vacíe un carrito nuevo.
  useEffect(() => {
    if (!justPaid || !confirmed) return
    clearCart()
    navigate(pathname, { replace: true, state: null })
  }, [justPaid, confirmed, clearCart, navigate, pathname])

  return (
    <div className="shop-page order-page">
      <AsyncContent {...order} onRetry={order.reload} loadingText="Confirmando tu compra...">
        {(data) => (
          <>
            <section className="confirmation" aria-labelledby="confirmation-title">
              <h1 id="confirmation-title">¡Compra confirmada!</h1>
              <p>
                Pedido <strong>{data.number}</strong> · pago ficticio{' '}
                <strong>
                  {data.paymentStatus === 'APPROVED' ? 'aprobado' : data.paymentStatus}
                </strong>
              </p>
              <p className="confirmation__total">
                Total pagado (incluye IVA simulado): {formatCents(data.totalCents)}
              </p>
            </section>
            <DeliveryFacts order={data} />
            <h2>Productos</h2>
            <OrderItems order={data} />
            <OrderAmounts amounts={data} />
            <p className="order-page__links">
              <Link to={shopReceiptPath(data.id)} className="btn btn--primary">
                Ver comprobante
              </Link>
              <Link to={paths.shopOrders} className="btn btn--secondary">
                Ir a mis pedidos
              </Link>
            </p>
          </>
        )}
      </AsyncContent>
      {order.error && <Link to={paths.shopOrders}>Ver mis pedidos</Link>}
    </div>
  )
}

/** 08 · Historial de pedidos del cliente, paginado en el servidor. */
export function MyOrdersPage() {
  const [page, setPage] = useState(1)
  const load = useCallback(() => customerOrdersService.list(page), [page])
  const orders = useFetch(load, 'No se pudieron cargar tus pedidos')

  return (
    <div className="shop-page order-page">
      <h1>Mis pedidos</h1>
      <AsyncContent {...orders} onRetry={orders.reload} loadingText="Cargando tus pedidos...">
        {(data) =>
          data.items.length === 0 ? (
            <div className="cart-empty card">
              <p className="empty-state">Todavía no tienes pedidos.</p>
              <Link to={paths.shopCatalog} className="btn btn--primary">
                Explorar regalos
              </Link>
            </div>
          ) : (
            <>
              <ul className="orders-list">
                {data.items.map((order) => (
                  <li
                    key={order.id}
                    className="card order-card"
                    aria-label={`Pedido ${order.number}`}
                  >
                    <ProductImage
                      src={order.primaryImageUrl}
                      alt=""
                      className="order-card__image"
                    />
                    <div className="order-card__body">
                      <p className="order-card__number">{order.number}</p>
                      <span className={statusBadgeClass(order.status)}>
                        {CUSTOMER_ORDER_STATUS[order.status]}
                      </span>
                      <p className="text-muted">
                        Comprado el {formatDateTime(order.createdAt)} · entrega prevista{' '}
                        {formatDateTime(order.scheduledDeliveryDate)}
                      </p>
                      <p>
                        {order.itemsCount} {order.itemsCount === 1 ? 'producto' : 'productos'} ·{' '}
                        <strong>{formatCents(order.totalCents)}</strong>
                      </p>
                      <p className="order-page__links">
                        <Link to={shopOrderPath(order.id)}>Ver detalle y seguimiento</Link>
                        <Link to={shopReceiptPath(order.id)}>Comprobante</Link>
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              <Pagination
                page={page}
                pageSize={data.pageSize}
                total={data.total}
                onPageChange={setPage}
              />
            </>
          )
        }
      </AsyncContent>
    </div>
  )
}

/** 14 · Detalle y seguimiento: solo estados y fechas registrados por el backend, sin GPS. */
export function OrderDetailPage() {
  const { id = '' } = useParams()
  const order = useOrder(id)

  return (
    <div className="shop-page order-page">
      <nav aria-label="Ruta de navegación" className="breadcrumb">
        <ol>
          <li>
            <Link to={paths.shopOrders}>Mis pedidos</Link>
          </li>
          {order.data && <li aria-current="page">{order.data.number}</li>}
        </ol>
      </nav>
      <AsyncContent {...order} onRetry={order.reload} loadingText="Cargando el pedido...">
        {(data) => (
          <>
            <h1>Pedido {data.number}</h1>
            <span className={statusBadgeClass(data.status)}>
              {CUSTOMER_ORDER_STATUS[data.status]}
            </span>
            <section aria-labelledby="timeline-title">
              <h2 id="timeline-title">Seguimiento</h2>
              <ol className="timeline">
                {data.timeline.map((entry) => (
                  <li key={`${entry.code}-${entry.at}`}>
                    <strong>{entry.label}</strong>
                    <span className="text-muted"> · {formatDateTime(entry.at)}</span>
                  </li>
                ))}
              </ol>
              <p className="text-muted">
                Muestra los cambios registrados por la tienda y el repartidor. No incluye ubicación
                en tiempo real.
              </p>
            </section>
            <DeliveryFacts order={data} />
            <h2>Productos</h2>
            <OrderItems order={data} />
            <OrderAmounts amounts={data} />
            <p className="order-page__links">
              <Link to={shopReceiptPath(data.id)} className="btn btn--primary">
                Ver comprobante
              </Link>
              <Link to={paths.shopOrders} className="btn btn--secondary">
                Volver a mis pedidos
              </Link>
            </p>
          </>
        )}
      </AsyncContent>
    </div>
  )
}

/** 13 · Comprobante de demostración, sin validez tributaria; se imprime desde el navegador. */
export function ReceiptPage() {
  const { id = '' } = useParams()
  const loadReceipt = useCallback(() => customerOrdersService.receipt(id), [id])
  const receipt = useFetch(loadReceipt, 'No se pudo cargar el comprobante')
  const order = useOrder(id)

  return (
    <div className="shop-page order-page">
      <AsyncContent {...receipt} onRetry={receipt.reload} loadingText="Cargando el comprobante...">
        {(data) => (
          <article className="receipt" aria-labelledby="receipt-title">
            <p className="receipt__disclaimer" role="note">
              {data.disclaimer}
            </p>
            <h1 id="receipt-title">Comprobante {data.number}</h1>
            <dl className="order-facts">
              <div>
                <dt>Emitido</dt>
                <dd>{formatDateTime(data.issuedAt)}</dd>
              </div>
              <div>
                <dt>Comercio</dt>
                <dd>{data.merchantName}</dd>
              </div>
              <div>
                <dt>Comprador</dt>
                <dd>
                  {data.buyer.name} · {data.buyer.email}
                </dd>
              </div>
              <div>
                <dt>Destinatario</dt>
                <dd>{data.recipient.name}</dd>
              </div>
              {order.data && (
                <div>
                  <dt>Entrega</dt>
                  <dd>
                    {formatDateTime(order.data.delivery.scheduledDeliveryDate)} ·{' '}
                    {order.data.delivery.address}
                  </dd>
                </div>
              )}
              <div>
                <dt>Pago simulado</dt>
                <dd>
                  {data.payment.reference} · tarjeta terminada en {data.payment.cardLast4}
                </dd>
              </div>
            </dl>
            <table className="table receipt__items">
              <caption className="visually-hidden">Productos comprados</caption>
              <thead>
                <tr>
                  <th scope="col">Producto</th>
                  <th scope="col">Cantidad</th>
                  <th scope="col">Precio unitario</th>
                  <th scope="col">Importe</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.sku}>
                    <td>{item.name}</td>
                    <td>{item.quantity}</td>
                    <td>{formatCents(item.unitPriceCents)}</td>
                    <td>{formatCents(item.lineTotalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="order-amounts">
              <div>
                <dt>Subtotal</dt>
                <dd>{formatCents(data.subtotalCents)}</dd>
              </div>
              <div>
                <dt>
                  {data.tax.enabled
                    ? `IVA simulado ${data.tax.ratePercent} % (tasa al comprar)`
                    : 'IVA simulado desactivado'}
                </dt>
                <dd>{formatCents(data.tax.amountCents)}</dd>
              </div>
              <div>
                <dt>Envío</dt>
                <dd>{formatCents(data.shipping.amountCents)}</dd>
              </div>
              <div className="cart-summary__total">
                <dt>Total</dt>
                <dd>{formatCents(data.totalCents)}</dd>
              </div>
            </dl>
            <p className="order-page__links receipt__actions">
              <Button onClick={() => window.print()}>Imprimir</Button>
              <Link to={shopOrderPath(data.orderId)} className="btn btn--secondary">
                Volver al pedido
              </Link>
            </p>
          </article>
        )}
      </AsyncContent>
      {receipt.error && <Link to={paths.shopOrders}>Ver mis pedidos</Link>}
    </div>
  )
}
