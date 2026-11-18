import { Link } from 'react-router'
import { paths } from '../../../app/paths'
import { catalogSearch } from '../catalogQuery'
import type { ShopCategory } from '../types'

const OCCASION_COLORS = ['rose', 'sage', 'peach', 'lilac'] as const
const OCCASION_SYMBOLS = ['✷', '♡', '❀', '✧'] as const

interface CategoryCardProps {
  category: ShopCategory
  index?: number
  /** Copia visual de relleno: no se anuncia ni entra en el orden de tabulación. */
  decorative?: boolean
}

/** Ocasión o categoría: presentación compacta de diseño aprobado con categorías reales. */
export function CategoryCard({ category, index = 0, decorative = false }: CategoryCardProps) {
  const colorClass = OCCASION_COLORS[index % OCCASION_COLORS.length]
  const symbol = OCCASION_SYMBOLS[index % OCCASION_SYMBOLS.length]

  return (
    <Link
      className={`occasion ${colorClass}`}
      tabIndex={decorative ? -1 : undefined}
      to={`${paths.shopCatalog}${catalogSearch({ categoryId: category.id })}`}
    >
      <span className="occasion-icon" aria-hidden="true">
        {symbol}
      </span>
      <span className="occasion-name">{category.name}</span>
    </Link>
  )
}
