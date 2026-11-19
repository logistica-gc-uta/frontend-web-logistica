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

/**
 * Tarjeta de un regalo: sobre la imagen van la categoría (arriba a la izquierda) y la
 * disponibilidad (arriba a la derecha); debajo, el nombre, la descripción breve y el precio. El
 * envío gratis es un aviso general de la página, no de cada tarjeta.
 */
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
          {product.category && (
            <span className="product-card__tag product-card__category">
              {product.category.name}
            </span>
          )}
          <span
            className={`product-card__tag product-card__status${product.isAvailable ? '' : ' product-card__status--out'}`}
          >
            {product.isAvailable ? 'Disponible' : 'Agotado'}
          </span>
        </figure>
        <div className="product-body product-card__body">
          <h3 className="product-name product-card__name" title={product.name}>
            {product.name}
          </h3>
          {product.description && (
            <p className="description product-card__description">{product.description}</p>
          )}
          <span className="price product-card__price">{formatCents(product.priceCents)}</span>
        </div>
      </Link>
    </article>
  )
}
