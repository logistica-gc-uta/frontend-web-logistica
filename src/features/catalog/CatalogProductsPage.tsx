import { useCallback, useState, type FormEvent } from 'react'
import { Alert } from '../../components/ui/Alert'
import { AsyncContent } from '../../components/ui/AsyncContent'
import { Button } from '../../components/ui/Button'
import { DataTable, type Column } from '../../components/ui/DataTable'
import { Drawer } from '../../components/ui/Drawer'
import { StepNav } from '../../components/ui/StepNav'
import { SelectMenu } from '../orders/SelectMenu'
import { TextField } from '../../components/ui/TextField'
import { useFetch } from '../../hooks/useFetch'
import { ProductImage } from '../shop/components/ProductImage'
import { formatCents } from '../shop/money'
import { describeCatalogError } from './catalogErrors'
import { catalogService } from './catalogService'
import { ProductEditor } from './ProductEditorPage'
import { ProductView } from './ProductView'
import { PublicationButton } from './PublicationButton'
import type { AdminProduct, ProductStatusFilter } from './types'

const PAGE_SIZE = 20

const STATUS_OPTIONS: { value: ProductStatusFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'published', label: 'Publicados' },
  { value: 'unpublished', label: 'Despublicados' },
  { value: 'out_of_stock', label: 'Agotados (stock 0)' },
]

interface Filters {
  search: string
  categoryId: string
  status: ProductStatusFilter
}

const NO_FILTERS: Filters = { search: '', categoryId: '', status: 'all' }

/** Atributos de los iconos de las acciones de la tabla. */
const ICON = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

/**
 * ADMIN-01 · Catálogo completo del Shop: también agotados, despublicados y productos antiguos,
 * con búsqueda, filtros y paginación del servidor. Las cifras salen siempre del backend.
 */
export function CatalogProductsPage() {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [draft, setDraft] = useState<Filters>(NO_FILTERS)
  const [page, setPage] = useState(1)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  // Crear, editar y ver un producto se hacen en un panel lateral, sin salir del listado.
  const [panel, setPanel] = useState<
    | { mode: 'create' }
    | { mode: 'edit'; id: string; created?: boolean }
    | { mode: 'view'; id: string }
    | null
  >(null)
  const closePanel = useCallback(() => setPanel(null), [])

  const loadProducts = useCallback(
    () =>
      catalogService.listProducts({
        page,
        pageSize: PAGE_SIZE,
        ...filters,
        search: filters.search.trim(),
      }),
    [page, filters],
  )
  const products = useFetch(loadProducts, 'No se pudieron cargar los productos')
  const categories = useFetch(catalogService.listCategories, 'No se pudieron cargar las categorías')

  const apply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFilters(draft)
    setPage(1)
  }

  const togglePublication = async (product: AdminProduct, publish: boolean) => {
    setSavingId(product.id)
    setNotice(null)
    try {
      await catalogService.setPublication(product.id, publish)
      setNotice({
        ok: true,
        text: publish
          ? `«${product.name}» ya se muestra en el Shop.`
          : `«${product.name}» se ocultó del Shop.`,
      })
      products.reload()
    } catch (error) {
      setNotice({
        ok: false,
        text: describeCatalogError(error, 'No se pudo cambiar la publicación'),
      })
    } finally {
      setSavingId(null)
    }
  }

  const columns: Column<AdminProduct>[] = [
    {
      header: 'Imagen',
      render: (product) => (
        <ProductImage src={product.primaryImageUrl} alt={product.name} className="catalog-thumb" />
      ),
    },
    {
      header: 'Producto',
      render: (product) => (
        <>
          <button
            type="button"
            className="catalog-table__name"
            onClick={() => setPanel({ mode: 'view', id: product.id })}
          >
            {product.name}
          </button>
          <br />
          <small className="text-muted">SKU {product.sku}</small>
        </>
      ),
    },
    { header: 'Categoría', render: (product) => product.category?.name ?? 'Sin categoría' },
    {
      header: 'Precio',
      render: (product) =>
        product.priceCents === null ? 'Sin precio' : formatCents(product.priceCents),
    },
    {
      header: 'Stock',
      render: (product) =>
        product.stock === 0 ? (
          <span className="badge badge--danger">Agotado (0)</span>
        ) : (
          product.stock
        ),
    },
    {
      header: 'Estado',
      render: (product) => (
        <span className={product.isPublished ? 'badge badge--success' : 'badge'}>
          {product.isPublished ? 'Publicado' : 'Despublicado'}
        </span>
      ),
    },
    {
      header: 'Acciones',
      render: (product) => (
        <div className="catalog-actions">
          <button
            type="button"
            className="catalog-table__icon"
            title="Ver producto"
            onClick={() => setPanel({ mode: 'view', id: product.id })}
          >
            <svg {...ICON}>
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <span className="visually-hidden">Ver {product.name}</span>
          </button>
          <button
            type="button"
            className="catalog-table__icon"
            title="Editar producto"
            onClick={() => setPanel({ mode: 'edit', id: product.id })}
          >
            <svg {...ICON}>
              <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z" />
            </svg>
            <span className="visually-hidden">Editar {product.name}</span>
          </button>
          <PublicationButton
            name={product.name}
            isPublished={product.isPublished}
            isSaving={savingId === product.id}
            onConfirm={(publish) => void togglePublication(product, publish)}
          />
        </div>
      ),
    },
  ]

  return (
    <main className="page page--wide page-stack catalog-page">
      <header className="catalog-header">
        <div>
          <h1>Productos</h1>
          <p className="text-muted">Catálogo del Shop, con productos agotados y despublicados.</p>
        </div>
      </header>

      <section className="card catalog-card" aria-labelledby="catalog-list-title">
        <h2 id="catalog-list-title" className="visually-hidden">
          Catálogo
        </h2>
        <div className="catalog-strip">
          <button
            type="button"
            className="catalog-new"
            onClick={() => setPanel({ mode: 'create' })}
          >
            <svg {...ICON} width={18} height={18} strokeWidth={2}>
              <path d="M12 5v14M5 12h14" />
            </svg>
            Nuevo producto
          </button>
          {products.data && (
            <p className="catalog-strip__count" aria-live="polite">
              {products.data.total} {products.data.total === 1 ? 'producto' : 'productos'}
            </p>
          )}
        </div>

        <form className="filters catalog-filters" aria-label="Filtrar productos" onSubmit={apply}>
          <TextField
            label="Buscar por nombre, SKU o descripción"
            type="search"
            placeholder="Ej.: ramo de rosas o REG-OC-MEJ-014"
            value={draft.search}
            onChange={(event) => setDraft({ ...draft, search: event.target.value })}
          />
          <SelectMenu
            id="filter-category"
            label="Categoría"
            value={draft.categoryId}
            placeholder="Todas"
            options={[
              { value: '', label: 'Todas' },
              ...(categories.data ?? []).map((category) => ({
                value: category.id,
                label: `${category.name}${category.isActive ? '' : ' (inactiva)'}`,
              })),
            ]}
            onChange={(categoryId) => setDraft({ ...draft, categoryId })}
          />
          <SelectMenu
            id="filter-status"
            label="Estado"
            value={draft.status}
            placeholder="Todos"
            options={STATUS_OPTIONS}
            onChange={(status) => setDraft({ ...draft, status: status as ProductStatusFilter })}
          />
          <div className="catalog-filters__actions">
            <Button type="submit">Filtrar</Button>
            <button
              type="button"
              className="catalog-filters__clear"
              onClick={() => {
                setDraft(NO_FILTERS)
                setFilters(NO_FILTERS)
                setPage(1)
              }}
            >
              Quitar filtros
            </button>
          </div>
        </form>

        {notice && <Alert variant={notice.ok ? 'success' : 'error'}>{notice.text}</Alert>}

        <AsyncContent {...products} onRetry={products.reload} loadingText="Cargando productos...">
          {(data) => (
            <div className={products.isLoading ? 'is-refreshing' : undefined}>
              <StepNav
                noun="Productos"
                singular="Producto"
                label="Productos"
                position={page - 1}
                total={data.total}
                pageSize={data.pageSize}
                onChange={(position) => setPage(position + 1)}
              />
              <DataTable
                caption="Productos del catálogo"
                columns={columns}
                rows={data.items}
                getRowKey={(product) => product.id}
                emptyMessage="No hay productos con esos criterios."
              />
            </div>
          )}
        </AsyncContent>
      </section>

      <Drawer
        open={panel !== null}
        onClose={closePanel}
        title={
          panel?.mode === 'create'
            ? 'Nuevo producto'
            : panel?.mode === 'edit'
              ? 'Editar producto'
              : 'Producto'
        }
        titleId="catalog-panel-title"
        className="drawer__panel--wide"
      >
        {panel?.mode === 'create' && (
          <ProductEditor
            onChanged={products.reload}
            onCreated={(saved) => setPanel({ mode: 'edit', id: saved.id, created: true })}
          />
        )}
        {panel?.mode === 'edit' && (
          <ProductEditor
            key={panel.id}
            id={panel.id}
            created={panel.created}
            onChanged={products.reload}
            onCreated={() => undefined}
          />
        )}
        {panel?.mode === 'view' && (
          <ProductView id={panel.id} onEdit={() => setPanel({ mode: 'edit', id: panel.id })} />
        )}
      </Drawer>
    </main>
  )
}
