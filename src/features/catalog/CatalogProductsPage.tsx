import { useCallback, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { paths, productEditPath } from '../../app/paths'
import { Alert } from '../../components/ui/Alert'
import { AsyncContent } from '../../components/ui/AsyncContent'
import { Button } from '../../components/ui/Button'
import { DataTable, type Column } from '../../components/ui/DataTable'
import { Pagination } from '../../components/ui/Pagination'
import { SelectField } from '../../components/ui/SelectField'
import { TextField } from '../../components/ui/TextField'
import { useFetch } from '../../hooks/useFetch'
import { ProductImage } from '../shop/components/ProductImage'
import { formatCents } from '../shop/money'
import { describeCatalogError } from './catalogErrors'
import { catalogService } from './catalogService'
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
          <Link to={productEditPath(product.id)}>{product.name}</Link>
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
          <Link to={productEditPath(product.id)} className="btn btn--secondary">
            Editar <span className="visually-hidden">{product.name}</span>
          </Link>
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
    <main className="page page-stack catalog-page">
      <div className="catalog-header">
        <div>
          <h1>Productos</h1>
          <p className="text-muted">
            Catálogo del Shop REGALÍA: incluye productos agotados y despublicados, que el Shop no
            muestra.
          </p>
        </div>
        <Link to={paths.productNew} className="btn btn--primary">
          Nuevo producto
        </Link>
      </div>

      <section className="card" aria-labelledby="catalog-list-title">
        <h2 id="catalog-list-title">Catálogo</h2>
        <form className="filters" aria-label="Filtrar productos" onSubmit={apply}>
          <TextField
            label="Buscar por nombre, SKU o descripción"
            type="search"
            value={draft.search}
            onChange={(event) => setDraft({ ...draft, search: event.target.value })}
          />
          <SelectField
            label="Categoría"
            value={draft.categoryId}
            onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}
          >
            <option value="">Todas</option>
            {(categories.data ?? []).map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
                {category.isActive ? '' : ' (inactiva)'}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Estado"
            value={draft.status}
            onChange={(event) =>
              setDraft({ ...draft, status: event.target.value as ProductStatusFilter })
            }
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
          <Button type="submit">Filtrar</Button>
          <Button
            variant="secondary"
            onClick={() => {
              setDraft(NO_FILTERS)
              setFilters(NO_FILTERS)
              setPage(1)
            }}
          >
            Quitar filtros
          </Button>
        </form>

        {notice && <Alert variant={notice.ok ? 'success' : 'error'}>{notice.text}</Alert>}

        <AsyncContent {...products} onRetry={products.reload} loadingText="Cargando productos...">
          {(data) => (
            <div className={products.isLoading ? 'is-refreshing' : undefined}>
              <p className="text-muted" aria-live="polite">
                {data.total} {data.total === 1 ? 'producto' : 'productos'}
              </p>
              <DataTable
                caption="Productos del catálogo"
                columns={columns}
                rows={data.items}
                getRowKey={(product) => product.id}
                emptyMessage="No hay productos con esos criterios."
              />
              {data.total > 0 && (
                <Pagination
                  page={page}
                  pageSize={data.pageSize}
                  total={data.total}
                  onPageChange={setPage}
                />
              )}
            </div>
          )}
        </AsyncContent>
      </section>
    </main>
  )
}
