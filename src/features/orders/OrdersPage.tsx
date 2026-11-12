import { useCallback, useId, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { orderReceiptPath, paths } from '../../app/paths'
import { Alert } from '../../components/ui/Alert'
import { AsyncContent } from '../../components/ui/AsyncContent'
import { Pagination } from '../../components/ui/Pagination'
import { useFetch } from '../../hooks/useFetch'
import { productsService } from '../products/productsService'
import { shopService } from '../shop/shopService'
import { zonesService } from '../zones/zonesService'
import { OrderFilters } from './OrderFilters'
import { NO_FILTERS, type OrderFiltersValue } from './orderFilterValue'
import { OrderForm } from './OrderForm'
import { ordersService } from './ordersService'
import { OrdersTable } from './OrdersTable'
import type { AdminPurchaseResult, OrdersQuery } from './types'
import '../../styles/orders-admin.css'

const PAGE_SIZE = 10

/**
 * Lo que necesita el formulario de venta (productos, horario y cobertura de la tienda) y el
 * filtro por zona del listado (los pedidos antiguos conservan su zona).
 */
const loadFormOptions = () =>
  Promise.all([
    zonesService.list(),
    productsService.list(),
    shopService.settings(),
    shopService.storeCoverage(),
  ])

export function OrdersPage() {
  const formTitleId = useId()
  const listTitleId = useId()
  const navigate = useNavigate()

  const options = useFetch(loadFormOptions, 'No se pudo cargar lo necesario para registrar ventas')
  const [filters, setFilters] = useState<OrderFiltersValue>(NO_FILTERS)
  const [page, setPage] = useState(1)

  const query = useMemo<OrdersQuery>(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      ...(filters.date && { date: filters.date }),
      ...(filters.zoneId && { zoneId: filters.zoneId }),
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
        <p className="dashboard__eyebrow">REGALÍA · Logística</p>
        <h1>Pedidos</h1>
        <p className="text-muted">
          Registra ventas pagadas en la tienda (efectivo o transferencia) con su entrega, y consulta
          los pedidos existentes.
        </p>
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
            {([, products, settings, coverage]) =>
              coverage.configured ? (
                <OrderForm
                  products={products}
                  schedule={settings.deliverySchedule}
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

        <section className="card" aria-labelledby={listTitleId}>
          <h2 id={listTitleId}>Pedidos registrados</h2>
          <OrderFilters
            value={filters}
            zones={options.data?.[0] ?? []}
            onChange={handleFiltersChange}
          />
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
                  <OrdersTable orders={result.items} />
                  {result.total > 0 && (
                    <Pagination
                      page={result.page}
                      pageSize={result.pageSize}
                      total={result.total}
                      onPageChange={setPage}
                    />
                  )}
                </>
              )}
            </AsyncContent>
          </div>
        </section>
      </div>
    </main>
  )
}
