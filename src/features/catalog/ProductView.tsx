import { useCallback } from 'react'
import { AsyncContent } from '../../components/ui/AsyncContent'
import { Button } from '../../components/ui/Button'
import { useFetch } from '../../hooks/useFetch'
import { formatCents } from '../shop/money'
import { catalogService } from './catalogService'

/** Un dato del producto: etiqueta pequeña y el valor debajo. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="product-view__fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

/** Detalle de un producto, solo para mirarlo: imagen, datos, estado y descripción. */
export function ProductView({ id, onEdit }: { id: string; onEdit: () => void }) {
  const load = useCallback(() => catalogService.getProduct(id), [id])
  const product = useFetch(load, 'No se pudo cargar el producto')

  return (
    <AsyncContent {...product} onRetry={product.reload} loadingText="Cargando producto...">
      {(current) =>
        current === null ? null : (
          <div className="product-view">
            {current.primaryImageUrl ? (
              <img
                className="product-view__image"
                src={current.primaryImageUrl}
                alt={current.images.find((image) => image.isPrimary)?.altText ?? current.name}
              />
            ) : (
              <p className="product-view__noimage text-muted">Sin imagen principal.</p>
            )}

            <div className="product-view__head">
              <h3>{current.name}</h3>
              <span className={current.isPublished ? 'badge badge--success' : 'badge'}>
                {current.isPublished ? 'Publicado' : 'Despublicado'}
              </span>
            </div>

            <dl className="product-view__facts">
              <Fact label="SKU">{current.sku}</Fact>
              <Fact label="Categoría">{current.category?.name ?? 'Sin categoría'}</Fact>
              <Fact label="Precio">
                {current.priceCents === null ? 'Sin precio' : formatCents(current.priceCents)}
              </Fact>
              <Fact label="Stock">
                {current.stock === 0 ? (
                  <span className="badge badge--danger">Agotado (0)</span>
                ) : (
                  current.stock
                )}
              </Fact>
            </dl>

            <section aria-label="Descripción">
              <h4>Descripción</h4>
              <p>{current.description?.trim() || 'Sin descripción.'}</p>
            </section>

            <div className="product-view__actions">
              <Button onClick={onEdit}>Editar producto</Button>
            </div>
          </div>
        )
      }
    </AsyncContent>
  )
}
