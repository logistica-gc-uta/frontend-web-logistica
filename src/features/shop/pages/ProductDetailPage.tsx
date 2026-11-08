import { useCallback, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { paths } from '../../../app/paths'
import { AsyncContent } from '../../../components/ui/AsyncContent'
import { useFetch } from '../../../hooks/useFetch'
import { catalogSearch } from '../catalogQuery'
import { AddToCart } from '../components/AddToCart'
import { ProductCard } from '../components/ProductCard'
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
      <figure className="stage-figure">
        <div className="stage">
          <ProductImage
            src={selected?.secureUrl ?? product.primaryImageUrl}
            alt={selected?.altText || product.name}
            className="gallery__main"
            eager
          />
        </div>
      </figure>
      {product.images.length > 1 && (
        <ul className="thumbnails gallery__thumbs" aria-label="Imágenes del regalo">
          {product.images.map((image, index) => (
            <li key={image.id}>
              <button
                type="button"
                className="thumb gallery__thumb"
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
    <article className="product-layout product-detail" aria-labelledby="product-title">
      <section aria-label="Galería del regalo">
        <Gallery product={product} />
      </section>
      <div className="product-info product-detail__info">
        {product.category && (
          <p className="eyebrow">
            <Link
              className="product-detail__category"
              to={`${paths.shopCatalog}${catalogSearch({ categoryId: product.category.id })}`}
            >
              {product.category.name}
            </Link>
          </p>
        )}
        <h1 id="product-title">{product.name}</h1>
        <p className="description product-detail__description">{product.description}</p>
        <p className="price product-detail__price">{formatCents(product.priceCents)}</p>
        <p className="small product-card__shipping">Envío gratis — incluido en el precio</p>
        <p className={`stock-status badge${product.isAvailable ? ' badge--success' : ' badge--danger'}`}>
          {product.isAvailable ? `Disponible · ${product.stock} en stock` : 'Agotado'}
        </p>

        <AddToCart product={product} />
        <p className="small text-muted">
          El precio y la disponibilidad se confirman al pagar. El IVA se desglosa en el checkout.
        </p>
      </div>
    </article>
  )
}

function RelatedProducts({ product, fromSearch }: { product: ShopProduct; fromSearch: string }) {
  const categoryId = product.category?.id
  const load = useCallback(
    () =>
      shopService.products({
        page: 1,
        pageSize: 8,
        sort: 'featured',
        categoryId,
      }),
    [categoryId],
  )
  const related = useFetch(load, 'No se pudieron cargar regalos relacionados')
  const items = related.data?.items.filter((item) => item.id !== product.id).slice(0, 4) ?? []
  if (items.length === 0) return null

  return (
    <section className="related-products" aria-labelledby="related-title">
      <h2 id="related-title">También te puede gustar</h2>
      <ul className="products product-grid">
        {items.map((item) => (
          <li key={item.id}>
            <ProductCard product={item} fromSearch={fromSearch} />
          </li>
        ))}
      </ul>
    </section>
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
    <div className="shop-page product-detail-page">
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

      <AsyncContent
        {...product}
        onRetry={product.reload}
        loadingText="Cargando regalo..."
        loading={<div className="shop-skeleton" role="status" aria-label="Cargando regalo" />}
      >
        {(data) => (
          <>
            <ProductDetail product={data} />
            {data.category && <RelatedProducts product={data} fromSearch={fromSearch} />}
            <div className="endnote">
              <Link to={catalogLink}>← Seguir explorando el catálogo</Link>
            </div>
          </>
        )}
      </AsyncContent>

      {product.error && (
        <p>
          <Link to={catalogLink}>Volver al catálogo</Link>
        </p>
      )}
    </div>
  )
}
