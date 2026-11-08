import { Link } from 'react-router'
import { shopProductPath } from '../../../app/paths'
import { formatCents } from '../money'
import type { ShopProduct } from '../types'
import { ProductImage } from './ProductImage'

interface ProductCardProps {
  product: ShopProduct
  /** Búsqueda del catálogo (`?q=…`) para volver desde el detalle sin perder los filtros. */
  fromSearch?: string
}

/** Tarjeta de un regalo: imagen, nombre, categoría, precio, disponibilidad y enlace al detalle. */
export function ProductCard({ product, fromSearch = '' }: ProductCardProps) {
  const primary = product.images.find((image) => image.isPrimary)

  return (
    <article className="product product-card" aria-label={product.name}>
      <Link
        className="product-link product-card__link"
        to={shopProductPath(product.id)}
        state={{ fromSearch }}
        aria-label={product.name}
      >
        <figure className="product-figure">
          <ProductImage src={product.primaryImageUrl} alt={primary?.altText || product.name} />
        </figure>
        <div className="product-body product-card__body">
          {product.category && <p className="category product-card__category">{product.category.name}</p>}
          <h3 className="product-name product-card__name">{product.name}</h3>
          {product.description && (
            <p className="description product-card__description">{product.description}</p>
          )}
          <div className="product-bottom">
            <span className="price product-card__price">{formatCents(product.priceCents)}</span>
            <span className={`badge${product.isAvailable ? ' badge--success' : ' badge--danger'}`}>
              {product.isAvailable ? 'Disponible' : 'Agotado'}
            </span>
          </div>
          <p className="product-card__shipping">Envío gratis — incluido en el precio</p>
        </div>
      </Link>
    </article>
  )
}
