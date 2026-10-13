import { useCallback, useId, useMemo, useState } from 'react'
import { AsyncContent } from '../../components/ui/AsyncContent'
import { Pagination } from '../../components/ui/Pagination'
import { useFetch } from '../../hooks/useFetch'
import { productsService } from '../products/productsService'
import { zonesService } from '../zones/zonesService'
import { OrderFilters } from './OrderFilters'
import { NO_FILTERS, type OrderFiltersValue } from './orderFilterValue'
import { OrderForm } from './OrderForm'
import { ordersService } from './ordersService'
import { OrdersTable } from './OrdersTable'
import type { OrdersQuery } from './types'

const PAGE_SIZE = 10

/** Zonas y productos que necesita el formulario (y el filtro por zona del listado). */
const loadFormOptions = () => Promise.all([zonesService.list(), productsService.list()])

export function OrdersPage() {
  const formTitleId = useId()
  const listTitleId = useId()

  const options = useFetch(loadFormOptions, 'No se pudieron cargar las zonas y los productos')
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

  const handleCreated = () => {
    // El stock de los productos cambió y el nuevo pedido debe aparecer en el listado.
    options.reload()
    orders.reload()
  }

  const handleFiltersChange = (next: OrderFiltersValue) => {
    setFilters(next)
    setPage(1)
  }

  return (
    <main className="page">
      <h1>Pedidos</h1>
      <p className="text-muted">
        Registra pedidos con su fecha, dirección y ubicación confirmada en el mapa, y consulta los
        pedidos existentes.
      </p>

      <div className="page-stack">
        <section className="card" aria-labelledby={formTitleId}>
          <h2 id={formTitleId}>Nuevo pedido</h2>
          <AsyncContent {...options} onRetry={options.reload} loadingText="Cargando formulario...">
            {([zones, products]) => (
              <OrderForm zones={zones} products={products} onCreated={handleCreated} />
            )}
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
            <AsyncContent {...orders} onRetry={orders.reload} loadingText="Cargando pedidos...">
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
