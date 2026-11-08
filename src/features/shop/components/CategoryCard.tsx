import { Link } from 'react-router'
import { paths } from '../../../app/paths'
import { catalogSearch } from '../catalogQuery'
import type { ShopCategory } from '../types'

const OCCASION_COLORS = ['rose', 'sage', 'peach', 'lilac'] as const
const OCCASION_SYMBOLS = ['✷', '♡', '❀', '✧'] as const

interface CategoryCardProps {
  category: ShopCategory
  index?: number
}

/** Ocasión o categoría: presentación compacta de diseño aprobado con categorías reales. */
export function CategoryCard({ category, index = 0 }: CategoryCardProps) {
  const colorClass = OCCASION_COLORS[index % OCCASION_COLORS.length]
  const symbol = OCCASION_SYMBOLS[index % OCCASION_SYMBOLS.length]

  return (
    <Link
      className={`occasion ${colorClass}`}
      to={`${paths.shopCatalog}${catalogSearch({ categoryId: category.id })}`}
    >
      <span aria-hidden="true">{symbol}</span>
      <span className="occasion-name">{category.name}</span>
    </Link>
  )
}
