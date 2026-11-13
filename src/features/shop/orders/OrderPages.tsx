import { useCallback, useEffect, useMemo, useState } from 'react'
import './orders-presentation.css'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { paths, shopOrderPath, shopProductPath, shopReceiptPath } from '../../../app/paths'
import { AsyncContent } from '../../../components/ui/AsyncContent'
import { Button } from '../../../components/ui/Button'
import { Pagination } from '../../../components/ui/Pagination'
import { useFetch } from '../../../hooks/useFetch'
import { formatDateTime } from '../../../lib/format/formatDateTime'
import { useCart } from '../cart/cartContext'
import { loadCheckoutProducts } from '../checkout/checkoutProducts'
import { checkoutStorage } from '../checkout/checkoutStorage'
import { ProductImage } from '../components/ProductImage'
import { formatCents } from '../money'
import {
  amountsOf,
  customerOrdersService,
  RECEIPT_UNAVAILABLE_MESSAGE,
  type CustomerOrderDetail,
  type OrderSource,
  type ReceiptPayment,
} from './customerOrdersService'
import { OrderAmounts } from './OrderAmounts'
import { CUSTOMER_ORDER_STATUS, trackingBadgeClass, trackingLabel } from './orderStatus'

const useOrder = (id: string) => {
  const load = useCallback(() => customerOrdersService.detail(id), [id])
  return useFetch(load, 'No se pudo cargar el pedido')
}

/** Origen comprensible para el cliente, sin hablar de cómo funciona el sistema por dentro. */
const SOURCE_LABELS: Record<OrderSource, string> = {
  SHOP: 'Compra en la web',
  ADMIN: 'Registrada en tienda',
}

function OriginBadge({ source }: { source: OrderSource }) {
  return (
    <span className={`origin-badge origin-badge--${source.toLowerCase()}`}>
      {SOURCE_LABELS[source]}
    </span>
  )
}

const METHOD_LABELS = { CASH: 'efectivo', TRANSFER: 'transferencia' } as const

/**
 * Cómo se pagó, según el origen. Una compra de tienda nunca se presenta como tarjeta ni como una
 * transferencia verificada por el banco, aunque el backend diga `APPROVED` en el detalle.
 */
function paymentText(order: Pick<CustomerOrderDetail, 'source' | 'receiptAvailable'>): {
  title: string
  note: string
} {
  if (!order.receiptAvailable) {
    return {
      title: 'Pago sin comprobante disponible',
      note: 'Este pedido se conserva sin comprobante: no mostramos importes ni pago.',
    }
  }
  return order.source === 'ADMIN'
    ? {
        title: 'Pago registrado en la tienda',
        note: 'Declarado por la tienda al registrar la compra; no es una verificación bancaria.',
      }
    : {
        title: 'Pago aprobado con tarjeta de demostración',
        note: 'Estado del pago · independiente de la entrega',
      }
}

function receiptPaymentText(payment: ReceiptPayment): string {
  return payment.kind === 'ADMIN_DECLARED_EXTERNAL'
    ? `Pago declarado en la tienda: ${METHOD_LABELS[payment.method]} (${formatDateTime(payment.declaredAt)}). No es una verificación bancaria.`
    : `${payment.reference} · tarjeta de demostración terminada en ${payment.cardLast4}`
}

function CheckIcon({ className = 'icon' }: { className?: string }) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 32 32">
      <path
        d="m6 16 7 7L26 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function DeliveryVanIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48">
      <path
        d="M4 11h25v26H4zM29 21h8l7 8v8H29M4 29h25"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="13"
        cy="37"
        r="4"
        fill="var(--color-surface-sunken)"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle
        cx="36"
        cy="37"
        r="4"
        fill="var(--color-surface-sunken)"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  )
}

function OrderStatusIcon({ status }: { status: keyof typeof CUSTOMER_ORDER_STATUS }) {
  switch (status) {
    case 'PENDING':
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20">
          <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M10 6v4l3 2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      )
    case 'ASSIGNED':
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20">
          <circle cx="10" cy="7" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M4 17v-1.5a4.5 4.5 0 0 1 9 0V17"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          />
        </svg>
      )
    case 'IN_TRANSIT':
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20">
          <path
            d="M2 4h10v10H2zM12 8h4l3 4v2h-7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="5" cy="15" r="2" />
          <circle cx="15" cy="15" r="2" />
        </svg>
      )
    case 'DELIVERED':
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20">
          <path
            d="m4 10 4 4 8-8"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )
    case 'CANCELLED':
    default:
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20">
          <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="m7 7 6 6M13 7l-6 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      )
  }
}

function OrderItems({ order }: { order: CustomerOrderDetail }) {
  const missingPhotoIds = useMemo(
    () => order.items.filter((item) => !item.imageUrl).map((item) => item.productId),
    [order.items],
  )
  const loadPhotos = useCallback(
    () =>
      missingPhotoIds.length > 0
        ? loadCheckoutProducts(missingPhotoIds)
        : Promise.resolve(new Map()),
    [missingPhotoIds],
  )
  const catalogPhotos = useFetch(loadPhotos)

  return (
    <ul className="order-items items">
      {order.items.map((item) => (
        <li key={item.productId} className="item">
          <Link to={shopProductPath(item.productId)} aria-label={`Ver ${item.name}`}>
            <ProductImage
              src={
                item.imageUrl ?? catalogPhotos.data?.get(item.productId)?.primaryImageUrl ?? null
              }
              alt={item.name}
              className="order-items__image"
            />
          </Link>
          <div className="item-info">
            <strong className="item-name">
              <Link to={shopProductPath(item.productId)}>{item.name}</Link>
            </strong>
            <p className="item-details text-muted small">
              {item.quantity} ×{' '}
              <span className="money">{formatCents(item.unitPriceCents)} c/u al comprar</span>
            </p>
          </div>
          <b className="item-total money">{formatCents(item.lineTotalCents)}</b>
        </li>
      ))}
    </ul>
  )
}

function DeliveryFacts({ order }: { order: CustomerOrderDetail }) {
  return (
    <>
      <div className="delivery-info">
        <div>
          <h3>Para quién</h3>
          <p>
            {order.recipient
              ? `${order.recipient.name} · ${order.recipient.phone}`
              : 'Datos de quien recibe no disponibles'}
          </p>
        </div>
        <div>
          <h3>Dónde</h3>
          <p>
            {order.delivery.address}
            {order.delivery.zoneName && ` · ${order.delivery.zoneName}`}
          </p>
          {order.delivery.notes && <p className="delivery-notes">{order.delivery.notes}</p>}
        </div>
      </div>
      {order.delivery.location && (
        <details className="delivery-coordinates-disclosure">
          <summary>Ubicación confirmada</summary>
          <p>
            {order.delivery.location.lat.toFixed(5)}, {order.delivery.location.lng.toFixed(5)}
          </p>
        </details>
      )}
    </>
  )
}

/** Llega desde el pago aprobado: es la única vía que vacía el carrito. */
export interface ConfirmationLocationState {
  justPaid?: boolean
}

/**
 * 08-result · Compra confirmada. Solo muestra éxito con el pedido que devuelve el servidor para esta
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
    checkoutStorage.clear()
    clearCart()
    navigate(pathname, { replace: true, state: null })
  }, [justPaid, confirmed, clearCart, navigate, pathname])

  return (
    <div className="shop-page order-page order-result-page">
      <AsyncContent {...order} onRetry={order.reload} loadingText="Confirmando tu compra...">
        {(data) => (
          <>
            <ol className="order-result-steps" aria-label="Pasos de la compra">
              <li>Entrega</li>
              <li>Pago</li>
              <li aria-current="step">Resultado</li>
            </ol>
            <div className="layout">
              <section className="result order-panel" aria-labelledby="confirmation-title">
                <div className="status-art" aria-hidden="true">
                  <CheckIcon className="icon-check" />
                </div>
                <p className="eyebrow order-eyebrow">Resultado del pago</p>
                <h1 id="confirmation-title">Ya es un detalle nuestro.</h1>
                <p className="copy">Consulta el resumen y el comprobante de tu pedido.</p>
                <div className="sample-refs">
                  <p>
                    Pedido: <b>{data.number ?? '—'}</b>
                  </p>
                  <p>
                    Pago:{' '}
                    <b>{data.paymentStatus === 'APPROVED' ? 'aprobado' : data.paymentStatus}</b>
                  </p>
                  {data.totalCents !== null && (
                    <p className="confirmation__total">
                      Total pagado: {formatCents(data.totalCents)}
                    </p>
                  )}
                </div>
                <DeliveryFacts order={data} />
                <div className="confirmation-actions links">
                  <Link
                    to={shopReceiptPath(data.id)}
                    className="button primary btn btn--primary"
                    aria-label="Ver comprobante"
                  >
                    Ver comprobante <span aria-hidden="true">→</span>
                  </Link>
                  <Link to={paths.shopOrders} className="button btn btn--secondary">
                    Ir a mis pedidos
                  </Link>
                  <Link to={paths.shopCatalog} className="button btn btn--ghost">
                    Explorar más regalos
                  </Link>
                </div>
              </section>
              <aside className="summary order-panel" aria-labelledby="confirmation-items-title">
                <p className="eyebrow order-eyebrow">Tu pedido</p>
                <h2 id="confirmation-items-title">Tus detalles</h2>
                <OrderItems order={data} />
                {amountsOf(data) && <OrderAmounts amounts={amountsOf(data)!} />}
              </aside>
            </div>
          </>
        )}
      </AsyncContent>
      {order.error && <Link to={paths.shopOrders}>Ver mis pedidos</Link>}
    </div>
  )
}

/** 09 · Historial de pedidos del cliente, paginado en el servidor, fila completa de 5 columnas. */
export function MyOrdersPage() {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<keyof typeof CUSTOMER_ORDER_STATUS | ''>('')
  const load = useCallback(
    () => customerOrdersService.list(page, 10, status || undefined),
    [page, status],
  )
  const orders = useFetch(load, 'No se pudieron cargar tus pedidos')
  const missingPhotoIds = useMemo(
    () =>
      (orders.data?.items ?? [])
        .filter((order) => !order.primaryImageUrl && order.primaryProductId)
        .map((order) => order.primaryProductId as string),
    [orders.data],
  )
  const loadPhotos = useCallback(
    () =>
      missingPhotoIds.length > 0
        ? loadCheckoutProducts(missingPhotoIds)
        : Promise.resolve(new Map()),
    [missingPhotoIds],
  )
  const catalogPhotos = useFetch(loadPhotos)

  const handleReset = () => {
    setStatus('')
    setPage(1)
  }

  return (
    <div className="shop-page order-page order-history-page">
      <nav aria-label="Ruta de navegación" className="breadcrumb">
        <Link to={paths.shopCatalog}>Inicio</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Mis pedidos</span>
      </nav>
      <header className="intro order-page-heading">
        <p className="eyebrow order-eyebrow">Tu cuenta</p>
        <h1>Mis pedidos</h1>
        <p>Tus detalles, desde que los eliges hasta que llegan.</p>
      </header>
      <div className="filter-bar">
        <label htmlFor="order-status">
          Estado del pedido
          <select
            id="order-status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as typeof status)
              setPage(1)
            }}
          >
            <option value="">Todos los estados</option>
            {Object.entries(CUSTOMER_ORDER_STATUS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button className="button" id="reset" type="button" onClick={handleReset}>
          Limpiar filtros
        </button>
      </div>
      <AsyncContent {...orders} onRetry={orders.reload} loadingText="Cargando tus pedidos...">
        {(data) =>
          data.items.length === 0 ? (
            <div className="empty" id="empty">
              <h2 id="empty-title">
                {status
                  ? 'No encontramos pedidos con ese estado'
                  : 'Tu próximo detalle empieza aquí'}
              </h2>
              <p id="empty-copy">
                {status
                  ? 'Prueba con otro estado o limpia los filtros.'
                  : 'Aún no tienes pedidos registrados. Encuentra un regalo para una ocasión especial.'}
              </p>
              <div className="empty-actions">
                {status ? (
                  <Button onClick={handleReset}>Mostrar todos los pedidos</Button>
                ) : (
                  <Link to={paths.shopCatalog} className="btn btn--primary">
                    Explorar regalos
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <section aria-labelledby="results-heading">
              <div className="results-bar">
                <h2 id="results-heading" role="status" aria-live="polite" aria-atomic="true">
                  {data.total} {data.total === 1 ? 'pedido' : 'pedidos'}
                </h2>
                <p>Más recientes primero</p>
              </div>
              <ul className="orders" id="orders">
                {data.items.map((order) => (
                  <li key={order.id} className="order-item">
                    <Link
                      to={shopOrderPath(order.id)}
                      className="order"
                      aria-label={`Pedido ${order.number ?? 'sin comprobante'} · ${SOURCE_LABELS[order.source]}`}
                    >
                      <span className="art">
                        <ProductImage
                          src={
                            order.primaryImageUrl ??
                            catalogPhotos.data?.get(order.primaryProductId ?? '')
                              ?.primaryImageUrl ??
                            null
                          }
                          alt=""
                          className="order-card__image"
                        />
                      </span>
                      <span className="order-info">
                        <span className="order-id">{order.number ?? 'Sin comprobante'}</span>
                        <OriginBadge source={order.source} />
                        <time dateTime={order.createdAt}>{formatDateTime(order.createdAt)}</time>
                        <span className="items">
                          {order.itemsCount === null
                            ? 'Productos no disponibles'
                            : `${order.itemsCount} ${order.itemsCount === 1 ? 'producto' : 'productos'}`}
                        </span>
                      </span>
                      <span className={`state ${trackingBadgeClass(order)}`}>
                        <OrderStatusIcon status={order.status} />
                        {trackingLabel(order)}
                      </span>
                      <span className="amount">
                        {order.totalCents === null ? (
                          <>
                            <small>Total</small>
                            <strong>Importe no disponible</strong>
                          </>
                        ) : (
                          <>
                            <small>Total · USD</small>
                            <strong>{formatCents(order.totalCents)}</strong>
                          </>
                        )}
                      </span>
                      <span className="arrow" aria-hidden="true">
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Pagination
                page={page}
                pageSize={data.pageSize}
                total={data.total}
                onPageChange={setPage}
              />
            </section>
          )
        }
      </AsyncContent>
    </div>
  )
}

/** 10 · Detalle y seguimiento: banner de entrega, Para quién/Dónde, timeline verificado sin GPS. */
export function OrderDetailPage() {
  const { id = '' } = useParams()
  const order = useOrder(id)

  return (
    <div className="shop-page order-page order-detail-page">
      <nav aria-label="Ruta de navegación" className="breadcrumb">
        <Link to={paths.shopOrders} className="back">
          ← Volver a mis pedidos
        </Link>
      </nav>
      <AsyncContent {...order} onRetry={order.reload} loadingText="Cargando el pedido...">
        {(data) => (
          <>
            <div className="intro order-detail-heading">
              <div>
                <p className="eyebrow order-eyebrow">Detalle del pedido</p>
                <h1 id="order-title" tabIndex={-1}>
                  {data.number ? `Pedido ${data.number}` : 'Pedido sin comprobante'}
                </h1>
                <p className="small">
                  <OriginBadge source={data.source} /> Comprado el {formatDateTime(data.createdAt)}
                </p>
              </div>
              <span className={trackingBadgeClass(data)}>
                <OrderStatusIcon status={data.status} />
                {trackingLabel(data)}
              </span>
            </div>
            <div className="layout">
              <section className="panel order-panel" aria-labelledby="delivery-title">
                <h2 id="delivery-title">
                  {data.status === 'DELIVERED'
                    ? 'Un detalle entregado'
                    : data.status === 'PENDING'
                      ? 'Tu detalle se prepara'
                      : 'Un detalle en camino'}
                </h2>
                <div className="delivery-banner" role="region" aria-label="Entrega programada">
                  <DeliveryVanIcon />
                  <div>
                    <strong>
                      {data.status === 'DELIVERED' ? 'Horario programado' : 'Entrega programada'} ·{' '}
                      {formatDateTime(data.delivery.scheduledDeliveryDate)}
                    </strong>
                    <p className="small">Horario de Ecuador (UTC−05:00)</p>
                  </div>
                </div>
                <DeliveryFacts order={data} />
                <section aria-labelledby="timeline-heading" role="region">
                  <h3 id="timeline-heading">Recorrido del pedido</h3>
                  <ol className="timeline" aria-label="Historial del pedido">
                    {data.timeline.map((entry, index) => (
                      <li
                        key={`${entry.code}-${entry.at}`}
                        aria-current={index === data.timeline.length - 1 ? 'step' : undefined}
                      >
                        <strong>{entry.label}</strong>
                        <time className="text-muted" dateTime={entry.at}>
                          {formatDateTime(entry.at)}
                        </time>
                      </li>
                    ))}
                  </ol>
                  <p className="text-muted small">
                    Muestra los cambios registrados por la tienda y el repartidor. No incluye
                    ubicación en tiempo real.
                  </p>
                </section>
                <p className="payment">
                  <strong>
                    {data.receiptAvailable && <CheckIcon className="icon" />}{' '}
                    {paymentText(data).title}
                  </strong>
                  <span>{paymentText(data).note}</span>
                </p>
              </section>
              <aside className="panel order-panel" aria-labelledby="order-items-title">
                <h2 id="order-items-title">Tus detalles</h2>
                {data.items.length > 0 ? (
                  <OrderItems order={data} />
                ) : (
                  <p className="text-muted">
                    El detalle de productos e importes no está disponible para este pedido.
                  </p>
                )}
                {amountsOf(data) && <OrderAmounts amounts={amountsOf(data)!} />}
              </aside>
            </div>
            <p className="order-page__links">
              {data.receiptAvailable ? (
                <Link to={shopReceiptPath(data.id)} className="btn btn--primary">
                  Ver comprobante
                </Link>
              ) : (
                <span className="text-muted">{RECEIPT_UNAVAILABLE_MESSAGE}</span>
              )}
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

/** Comprobante histórico; la decisión de presentación no modifica el snapshot de la API. */
export function ReceiptPage() {
  const { id = '' } = useParams()
  const loadReceipt = useCallback(() => customerOrdersService.receipt(id), [id])
  const receipt = useFetch(loadReceipt, 'No se pudo cargar el comprobante')
  const order = useOrder(id)

  return (
    <div className="shop-page order-page order-receipt-page">
      <nav aria-label="Ruta de navegación" className="breadcrumb no-print">
        <Link to={order.data ? shopOrderPath(order.data.id) : paths.shopOrders} className="back">
          ← Volver al pedido
        </Link>
      </nav>
      <AsyncContent {...receipt} onRetry={receipt.reload} loadingText="Cargando el comprobante...">
        {(data) => (
          <article className="receipt" aria-labelledby="receipt-title">
            <div className="receipt-heading">
              <div>
                <p className="eyebrow order-eyebrow">{data.merchantName}</p>
                <h1 id="receipt-title">Comprobante de compra</h1>
                <p className="small receipt-id">{data.number}</p>
                <p className="small">
                  Emitido el {formatDateTime(data.issuedAt)} ·{' '}
                  {data.payment.kind === 'ADMIN_DECLARED_EXTERNAL'
                    ? 'Registrado en la tienda'
                    : 'Pago aprobado'}
                </p>
              </div>
            </div>
            <div className="delivery-info">
              <div>
                <h3>Comercio</h3>
                <p>{data.merchantName}</p>
              </div>
              <div>
                <h3>Comprador</h3>
                <p>
                  {[data.buyer.name, data.buyer.email, data.buyer.phone]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <div>
                <h3>Destinatario</h3>
                <p>{[data.recipient.name, data.recipient.phone].filter(Boolean).join(' · ')}</p>
              </div>
              {order.data && (
                <div>
                  <h3>Entrega</h3>
                  <p>
                    {formatDateTime(order.data.delivery.scheduledDeliveryDate)} ·{' '}
                    {order.data.delivery.address}
                  </p>
                </div>
              )}
              <div>
                <h3>Pago</h3>
                <p>{receiptPaymentText(data.payment)}</p>
              </div>
            </div>
            <div
              className="receipt-table-scroll"
              role="region"
              aria-label="Productos comprados"
              tabIndex={0}
            >
              <table className="table receipt__items">
                <caption className="visually-hidden">Productos comprados</caption>
                <thead>
                  <tr>
                    <th scope="col">Detalle</th>
                    <th scope="col">Cantidad</th>
                    <th scope="col">Precio unitario</th>
                    <th scope="col">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr key={item.sku}>
                      <td>{item.name}</td>
                      <td data-label="Cantidad">{item.quantity}</td>
                      <td data-label="Precio unitario">{formatCents(item.unitPriceCents)}</td>
                      <td data-label="Importe">{formatCents(item.lineTotalCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="order-amounts receipt-totals">
              <div>
                <dt>Subtotal</dt>
                <dd>{formatCents(data.subtotalCents)}</dd>
              </div>
              <div>
                <dt>
                  {data.tax.enabled
                    ? `IVA ${data.tax.ratePercent} % (tasa al comprar)`
                    : 'IVA no aplicado'}
                </dt>
                <dd>{formatCents(data.tax.amountCents)}</dd>
              </div>
              <div>
                <dt>Envío</dt>
                <dd>{formatCents(data.shipping.amountCents)}</dd>
              </div>
              <div className="cart-summary__total total">
                <dt>Total</dt>
                <dd>{formatCents(data.totalCents)}</dd>
              </div>
            </dl>
            <p className="order-page__links receipt__actions no-print">
              <Button onClick={() => window.print()}>Imprimir comprobante</Button>
              <Link to={shopOrderPath(data.orderId)} className="btn btn--secondary">
                Volver al pedido
              </Link>
            </p>
          </article>
        )}
      </AsyncContent>
      {/* Un pedido propio sin comprobante se puede seguir consultando; uno ajeno, no. */}
      {receipt.error === RECEIPT_UNAVAILABLE_MESSAGE ? (
        <Link to={shopOrderPath(id)}>Ver el detalle del pedido</Link>
      ) : (
        receipt.error && <Link to={paths.shopOrders}>Ver mis pedidos</Link>
      )}
    </div>
  )
}
