import { useCallback, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { paths } from '../../../app/paths'
import { AsyncContent } from '../../../components/ui/AsyncContent'
import { useFetch } from '../../../hooks/useFetch'
import { catalogSearch } from '../catalogQuery'
import { AddToCart } from '../components/AddToCart'
import { ProductImage } from '../components/ProductImage'
import { formatCents } from '../money'
import { shopService } from '../shopService'
import type { ShopProduct } from '../types'

function Gallery({ product }: { product: ShopProduct }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected =
    product.images.find((image) => image.id === selectedId) ??
    product.images.find((image) => image.isPrimary) ??
    product.images[0]

  return (
    <div className="gallery">
      <ProductImage
        src={selected?.secureUrl ?? product.primaryImageUrl}
        alt={selected?.altText || product.name}
        className="gallery__main"
        eager
      />
      {product.images.length > 1 && (
        <ul className="gallery__thumbs" aria-label="Imágenes del regalo">
          {product.images.map((image, index) => (
            <li key={image.id}>
              <button
                type="button"
                className="gallery__thumb"
                aria-label={`Ver imagen ${index + 1} de ${product.images.length}`}
                aria-pressed={image.id === selected?.id}
                onClick={() => setSelectedId(image.id)}
              >
                <ProductImage src={image.secureUrl} alt="" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ProductDetail({ product }: { product: ShopProduct }) {
  return (
    <article className="product-detail" aria-labelledby="product-title">
      <Gallery product={product} />
      <div className="product-detail__info">
        {product.category && (
          <Link
            className="product-detail__category"
            to={`${paths.shopCatalog}${catalogSearch({ categoryId: product.category.id })}`}
          >
            {product.category.name}
          </Link>
        )}
        <h1 id="product-title">{product.name}</h1>
        <p className="product-detail__price">{formatCents(product.priceCents)}</p>
        <p className="product-card__shipping">Envío gratis — incluido en el precio</p>
        <p className={`badge${product.isAvailable ? ' badge--success' : ' badge--danger'}`}>
          {product.isAvailable ? `Disponible · ${product.stock} en stock` : 'Agotado'}
        </p>

        <AddToCart product={product} />
        <p className="text-muted">
          El precio y la disponibilidad se confirman al pagar. El IVA se desglosa en el checkout.
        </p>

        <h2>Descripción</h2>
        {/* Texto plano: React lo escapa, así que una descripción con HTML no se ejecuta. */}
        <p className="product-detail__description">{product.description}</p>
      </div>
    </article>
  )
}

interface DetailLocationState {
  fromSearch?: string
}

/** Detalle de un regalo por su ID, con regreso al catálogo conservando búsqueda y filtros. */
export function ProductDetailPage() {
  const { id = '' } = useParams()
  const location = useLocation()
  const fromSearch = (location.state as DetailLocationState | null)?.fromSearch ?? ''
  const catalogLink = `${paths.shopCatalog}${fromSearch}`

  const loadProduct = useCallback(() => shopService.product(id), [id])
  const product = useFetch(loadProduct, 'No se pudo cargar el regalo')

  return (
    <div className="shop-page">
      <nav aria-label="Ruta de navegación" className="breadcrumb">
        <ol>
          <li>
            <Link to={paths.shop}>Inicio</Link>
          </li>
          <li>
            <Link to={catalogLink}>Catálogo</Link>
          </li>
          {product.data && <li aria-current="page">{product.data.name}</li>}
        </ol>
      </nav>

      <AsyncContent {...product} onRetry={product.reload} loadingText="Cargando regalo...">
        {(data) => <ProductDetail product={data} />}
      </AsyncContent>

      {product.error && (
        <p>
          <Link to={catalogLink}>Volver al catálogo</Link>
        </p>
      )}
    </div>
  )
}
