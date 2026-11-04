import { Link } from 'react-router'
import { paths } from '../../../app/paths'
import { catalogSearch } from '../catalogQuery'
import type { ShopCategory } from '../types'

/** Ocasión o categoría: enlaza al catálogo filtrado. La API no trae imagen, así que usa la inicial. */
export function CategoryCard({ category }: { category: ShopCategory }) {
  return (
    <Link
      className="category-card"
      to={`${paths.shopCatalog}${catalogSearch({ categoryId: category.id })}`}
    >
      <span className="category-card__icon" aria-hidden="true">
        {category.name.charAt(0).toUpperCase()}
      </span>
      <span className="category-card__name">{category.name}</span>
      <small>
        {category.productCount} {category.productCount === 1 ? 'regalo' : 'regalos'}
      </small>
    </Link>
  )
}
