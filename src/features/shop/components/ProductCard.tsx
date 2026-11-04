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
    <article className="product-card" aria-label={product.name}>
      <ProductImage src={product.primaryImageUrl} alt={primary?.altText || product.name} />
      <div className="product-card__body">
        {product.category && <p className="product-card__category">{product.category.name}</p>}
        <h3 className="product-card__name">{product.name}</h3>
        <p className="product-card__price">{formatCents(product.priceCents)}</p>
        <p className={`badge${product.isAvailable ? ' badge--success' : ' badge--danger'}`}>
          {product.isAvailable ? 'Disponible' : 'Agotado'}
        </p>
        <p className="product-card__shipping">Envío gratis — incluido en el precio</p>
        <Link
          className="btn btn--secondary product-card__cta"
          to={shopProductPath(product.id)}
          state={{ fromSearch }}
          aria-label={`Ver detalle de ${product.name}`}
        >
          Ver detalle
        </Link>
      </div>
    </article>
  )
}
