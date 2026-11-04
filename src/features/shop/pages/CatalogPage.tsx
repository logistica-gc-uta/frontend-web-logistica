import { useCallback, useMemo } from 'react'
import { useLocation, useSearchParams } from 'react-router'
import { AsyncContent } from '../../../components/ui/AsyncContent'
import { Button } from '../../../components/ui/Button'
import { Pagination } from '../../../components/ui/Pagination'
import { SelectField } from '../../../components/ui/SelectField'
import { useFetch } from '../../../hooks/useFetch'
import {
  hasActiveFilters,
  parseCatalogParams,
  SORT_OPTIONS,
  toApiQuery,
  toCatalogParams,
  type CatalogFilters,
  type CatalogState,
} from '../catalogQuery'
import { CatalogFiltersForm } from '../components/CatalogFiltersForm'
import { ProductCard } from '../components/ProductCard'
import { shopService } from '../shopService'
import type { CatalogSort } from '../types'

const NO_FILTERS: CatalogFilters = {
  search: '',
  categoryId: '',
  minPrice: '',
  maxPrice: '',
  inStock: false,
}

/**
 * Catálogo paginado en el servidor. Búsqueda, filtros, orden y página viven en la URL: un enlace
 * reproduce la misma vista y volver desde el detalle la conserva.
 */
export function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { search: locationSearch } = useLocation()
  const queryKey = searchParams.toString()
  const state = useMemo(() => parseCatalogParams(new URLSearchParams(queryKey)), [queryKey])

  const loadProducts = useCallback(() => shopService.products(toApiQuery(state)), [state])
  const products = useFetch(loadProducts, 'No se pudieron cargar los regalos')
  const categories = useFetch(shopService.categories, 'No se pudieron cargar las categorías')

  const navigate = (next: CatalogState) => setSearchParams(toCatalogParams(next))
  // Cambiar un criterio vuelve a la primera página.
  const applyFilters = (filters: CatalogFilters) => navigate({ ...state, ...filters, page: 1 })
  const changeSort = (sort: CatalogSort) => navigate({ ...state, sort, page: 1 })
  const changePage = (page: number) => {
    navigate({ ...state, page })
    window.scrollTo?.({ top: 0 })
  }

  return (
    <div className="shop-page catalog">
      <h1>Catálogo de regalos</h1>

      <div className="catalog__layout">
        <aside className="catalog__filters">
          <CatalogFiltersForm
            key={queryKey}
            applied={state}
            categories={categories.data ?? []}
            onApply={applyFilters}
            onClear={() => navigate({ ...state, ...NO_FILTERS, page: 1 })}
          />
          {categories.error && <p className="field__error">{categories.error}</p>}
        </aside>

        <section className="catalog__results" aria-labelledby="catalog-results-title">
          <div className="catalog__toolbar">
            <h2 id="catalog-results-title" aria-live="polite">
              {state.search ? `Resultados para «${state.search}»` : 'Todos los regalos'}
              {products.data && !products.isLoading && (
                <small>
                  {' '}
                  · {products.data.total} {products.data.total === 1 ? 'regalo' : 'regalos'}
                </small>
              )}
            </h2>
            {state.search && (
              <Button variant="secondary" onClick={() => applyFilters({ ...state, search: '' })}>
                Quitar búsqueda
              </Button>
            )}
            <div className="catalog__sort">
              <SelectField
                label="Ordenar por"
                value={state.sort}
                onChange={(event) => changeSort(event.target.value as CatalogSort)}
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectField>
            </div>
          </div>

          <div className={products.isLoading && products.data ? 'is-refreshing' : undefined}>
            <AsyncContent {...products} onRetry={products.reload} loadingText="Cargando regalos...">
              {(page) =>
                page.items.length === 0 ? (
                  <div className="empty-state">
                    {state.page > 1 && page.total > 0 ? (
                      <>
                        <p>Esta página ya no tiene regalos.</p>
                        <Button variant="secondary" onClick={() => changePage(1)}>
                          Ir a la primera página
                        </Button>
                      </>
                    ) : hasActiveFilters(state) ? (
                      <>
                        <p>No encontramos regalos con esos criterios.</p>
                        <Button
                          variant="secondary"
                          onClick={() => navigate({ ...state, ...NO_FILTERS, page: 1 })}
                        >
                          Quitar filtros
                        </Button>
                      </>
                    ) : (
                      <p>Todavía no hay regalos publicados.</p>
                    )}
                  </div>
                ) : (
                  <>
                    <ul className="product-grid">
                      {page.items.map((product) => (
                        <li key={product.id}>
                          <ProductCard product={product} fromSearch={locationSearch} />
                        </li>
                      ))}
                    </ul>
                    <Pagination
                      page={state.page}
                      pageSize={page.pageSize}
                      total={page.total}
                      onPageChange={changePage}
                    />
                  </>
                )
              }
            </AsyncContent>
          </div>
        </section>
      </div>
    </div>
  )
}
