import { useCallback, useId, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { orderReceiptPath, paths } from '../../app/paths'
import { Alert } from '../../components/ui/Alert'
import { AsyncContent } from '../../components/ui/AsyncContent'
import { Button } from '../../components/ui/Button'
import { Drawer } from '../../components/ui/Drawer'
import { StepNav } from '../../components/ui/StepNav'
import { TextField } from '../../components/ui/TextField'
import { useFetch } from '../../hooks/useFetch'
import { describeDispatchError } from '../dispatch/dispatchError'
import { dispatchService } from '../dispatch/dispatchService'
import { productsService } from '../products/productsService'
import { shopService } from '../shop/shopService'
import { OrderFilters } from './OrderFilters'
import { NO_FILTERS, type OrderFiltersValue } from './orderFilterValue'
import { OrderForm } from './OrderForm'
import { OrderRescheduleDrawer } from './OrderRescheduleDrawer'
import { ordersService } from './ordersService'
import { OrdersTable } from './OrdersTable'
import type { AdminPurchaseResult, Order, OrdersQuery } from './types'
import '../../styles/orders-admin.css'
import '../../styles/order-form.css'

const PAGE_SIZE = 4

/** Solo se cargan los datos de tienda necesarios para registrar ventas. */
const loadFormOptions = () =>
  Promise.all([productsService.list(), shopService.settings(), shopService.storeCoverage()])

export function OrdersPage() {
  const formTitleId = useId()
  const listTitleId = useId()
  const navigate = useNavigate()

  const options = useFetch(loadFormOptions, 'No se pudo cargar lo necesario para registrar ventas')
  const [filters, setFilters] = useState<OrderFiltersValue>(NO_FILTERS)
  const [page, setPage] = useState(1)
  const [listOpen, setListOpen] = useState(false)
  const [reschedulingOrder, setReschedulingOrder] = useState<Order | null>(null)
  const [pickupOrder, setPickupOrder] = useState<Order | null>(null)
  const [pickupNote, setPickupNote] = useState('')
  const [pickupError, setPickupError] = useState<string | null>(null)
  const [isConfirmingPickup, setIsConfirmingPickup] = useState(false)
  const [rescheduleNotice, setRescheduleNotice] = useState<string | null>(null)
  const closeList = useCallback(() => {
    setListOpen(false)
    setRescheduleNotice(null)
  }, [])
  const closeReschedule = useCallback(() => setReschedulingOrder(null), [])
  const closePickup = useCallback(() => {
    if (isConfirmingPickup) return
    setPickupOrder(null)
    setPickupNote('')
    setPickupError(null)
  }, [isConfirmingPickup])
  const handleStartReschedule = useCallback((order: Order) => {
    setRescheduleNotice(null)
    setReschedulingOrder(order)
  }, [])
  const handleStartPickupConfirm = useCallback((order: Order) => {
    setRescheduleNotice(null)
    setPickupOrder(order)
    setPickupNote('')
    setPickupError(null)
  }, [])

  const submitPickupConfirm = async () => {
    if (!pickupOrder || isConfirmingPickup) return
    const trimmed = pickupNote.trim()
    if (!trimmed) {
      setPickupError('Escribe una nota breve de la entrega en tienda')
      return
    }
    setPickupError(null)
    setIsConfirmingPickup(true)
    try {
      await dispatchService.confirmPickup(pickupOrder.id, trimmed)
      const recipient = pickupOrder.recipientName ?? pickupOrder.user?.name ?? 'el cliente'
      setPickupOrder(null)
      setPickupNote('')
      setRescheduleNotice(`Retiro en tienda confirmado para ${recipient}. El pedido quedó entregado.`)
      orders.reload()
    } catch (error) {
      setPickupError(describeDispatchError(error))
    } finally {
      setIsConfirmingPickup(false)
    }
  }

  const query = useMemo<OrdersQuery>(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      ...(filters.date && { date: filters.date }),
      ...(filters.status && { status: filters.status }),
    }),
    [page, filters],
  )
  const fetchOrders = useCallback(() => ordersService.list(query), [query])
  const orders = useFetch(fetchOrders, 'No se pudieron cargar los pedidos')

  /** Venta confirmada: se abre su comprobante para verlo, imprimirlo o corregir el contacto. */
  const handleCreated = (result: AdminPurchaseResult) => {
    navigate(orderReceiptPath(result.id), { state: { justCreated: true } })
  }

  const handleFiltersChange = (next: OrderFiltersValue) => {
    setFilters(next)
    setPage(1)
  }

  return (
    <main className="page orders-admin">
      <header className="orders-admin__head">
        <div>
          <h1>Pedidos</h1>
          <p className="text-muted">Registra ventas en tienda y consulta los pedidos existentes.</p>
        </div>
        <button
          type="button"
          className="orders-admin__list-button"
          aria-haspopup="dialog"
          aria-label="Ver pedidos registrados"
          title="Pedidos registrados"
          onClick={() => setListOpen(true)}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 8 12 3 3 8v8l9 5 9-5V8ZM3 8l9 5 9-5M12 13v8" />
          </svg>
          <span className="orders-admin__list-label">Pedidos registrados</span>
          {orders.data !== undefined && orders.data.total > 0 && (
            <span className="orders-admin__list-count" aria-hidden="true">
              {orders.data.total}
            </span>
          )}
        </button>
      </header>

      <div className="page-stack">
        <section className="card" aria-labelledby={formTitleId}>
          <h2 id={formTitleId}>Nueva venta</h2>
          <AsyncContent
            {...options}
            onRetry={options.reload}
            loadingText="Cargando formulario..."
            loading={<div className="admin-skeleton" />}
          >
            {([products, settings, coverage]) =>
              coverage.configured ? (
                <OrderForm
                  products={products}
                  schedule={settings.deliverySchedule}
                  maxUnitsPerOrder={settings.maxUnitsPerOrder}
                  coverage={coverage}
                  onCreated={handleCreated}
                />
              ) : (
                // Sin cobertura configurada el backend rechaza toda venta: se dice antes de llenar nada.
                <Alert>
                  <span>
                    La tienda todavía no tiene definida su zona de entrega, así que no se pueden
                    registrar ventas.
                  </span>{' '}
                  <Link to={paths.storeCoverage}>Configurar tienda y cobertura</Link>
                </Alert>
              )
            }
          </AsyncContent>
        </section>
      </div>

      <Drawer
        open={listOpen}
        onClose={closeList}
        title="Pedidos registrados"
        titleId={listTitleId}
        className="orders-admin"
      >
        <OrderFilters value={filters} onChange={handleFiltersChange} />
        {rescheduleNotice && <Alert variant="success">{rescheduleNotice}</Alert>}
        <div
          aria-busy={orders.isLoading}
          className={orders.isLoading && orders.data ? 'is-refreshing' : undefined}
        >
          <AsyncContent
            {...orders}
            onRetry={orders.reload}
            loadingText="Cargando pedidos..."
            loading={<div className="admin-skeleton" />}
          >
            {(result) => (
              <>
                <StepNav
                  noun="Pedidos"
                  singular="Pedido"
                  label="Páginas de pedidos"
                  position={result.page - 1}
                  total={result.total}
                  pageSize={result.pageSize}
                  onChange={(position) => setPage(position + 1)}
                />
                <OrdersTable
                  orders={result.items}
                  onReschedule={handleStartReschedule}
                  onConfirmPickup={handleStartPickupConfirm}
                />
              </>
            )}
          </AsyncContent>
        </div>
      </Drawer>

      <OrderRescheduleDrawer
        order={reschedulingOrder}
        schedule={options.data?.[1].deliverySchedule}
        onClose={closeReschedule}
        onRescheduled={(order) => {
          const recipient = order.recipientName ?? order.user?.name ?? 'el cliente'
          setReschedulingOrder(null)
          setRescheduleNotice(
            `Pedido de ${recipient} reprogramado. Ya puedes planificarlo para la nueva fecha.`,
          )
          orders.reload()
        }}
      />

      <Drawer
        open={pickupOrder !== null}
        onClose={closePickup}
        title="Confirmar retiro en tienda"
        titleId="order-pickup-confirm-title"
        className="drawer__panel--narrow"
      >
        {pickupOrder && (
          <div className="order-reschedule">
            <div className="order-reschedule__summary">
              <p>
                <strong>{pickupOrder.recipientName ?? pickupOrder.user?.name ?? 'Sin nombre'}</strong>
              </p>
              <p className="text-muted">{pickupOrder.deliveryAddress}</p>
            </div>
            <p className="text-muted">
              Confirma este paso solo cuando el cliente retire físicamente el pedido en el local.
              El pedido pasará a <strong>Entregado</strong>.
            </p>
            {pickupError && <Alert>{pickupError}</Alert>}
            <TextField
              label="Nota de retiro"
              placeholder="Ej.: Retirado por el cliente en mostrador"
              value={pickupNote}
              maxLength={500}
              error={pickupError ?? undefined}
              onChange={(event) => {
                setPickupNote(event.target.value)
                setPickupError(null)
              }}
            />
            <div className="order-reschedule__actions">
              <Button
                isLoading={isConfirmingPickup}
                loadingText="Confirmando..."
                onClick={() => void submitPickupConfirm()}
              >
                Confirmar entrega en tienda
              </Button>
              <Button variant="secondary" disabled={isConfirmingPickup} onClick={closePickup}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </main>
  )
}
