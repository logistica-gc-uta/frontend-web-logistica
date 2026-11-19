import { useCallback, useId, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { orderReceiptPath, paths } from '../../app/paths'
import { Alert } from '../../components/ui/Alert'
import { AsyncContent } from '../../components/ui/AsyncContent'
import { Drawer } from '../../components/ui/Drawer'
import { Pagination } from '../../components/ui/Pagination'
import { useFetch } from '../../hooks/useFetch'
import { productsService } from '../products/productsService'
import { shopService } from '../shop/shopService'
import { OrderFilters } from './OrderFilters'
import { NO_FILTERS, type OrderFiltersValue } from './orderFilterValue'
import { OrderForm } from './OrderForm'
import { ordersService } from './ordersService'
import { OrdersTable } from './OrdersTable'
import type { AdminPurchaseResult, OrdersQuery } from './types'
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
  const closeList = useCallback(() => setListOpen(false), [])

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
      </Drawer>
    </main>
  )
}
