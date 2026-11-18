import { useEffect, useRef } from 'react'
import type { ShopCategory } from '../types'
import { CategoryCard } from './CategoryCard'

/** Tarjetas por fila: suficientes para cubrir el ancho más el recorrido del scroll. */
const CARDS_PER_ROW = 24
/** Cuánto se desplazan las filas por cada píxel de scroll. */
const SHIFT_FACTOR = 0.35
const MAX_SHIFT = 420

interface OccasionMarqueeProps {
  categories: readonly ShopCategory[]
}

interface Slot {
  key: string
  category: ShopCategory
  index: number
  decorative: boolean
}

/** Rellena la fila repitiendo las categorías; solo la primera vuelta es real (accesible). */
function buildRow(
  categories: readonly ShopCategory[],
  rowId: string,
  offset: number,
  decorativeRow: boolean,
): Slot[] {
  const count = Math.max(CARDS_PER_ROW, categories.length)
  return Array.from({ length: count }, (_, position) => {
    const index = (position + offset) % categories.length
    return {
      key: `${rowId}-${position}`,
      category: categories[index],
      index,
      decorative: decorativeRow || position >= categories.length,
    }
  })
}

/**
 * Dos filas de ocasiones que se deslizan en sentidos opuestos al hacer scroll vertical.
 * La fila superior es la lista real de enlaces; la inferior y las repeticiones son decorativas.
 */
export function OccasionMarquee({ categories }: OccasionMarqueeProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = ref.current
    if (!element || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    let frame = 0
    const update = () => {
      frame = 0
      const box = element.getBoundingClientRect()
      const distance = box.top + box.height / 2 - window.innerHeight / 2
      const shift = Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, distance * SHIFT_FACTOR))
      element.style.setProperty('--occasion-shift', shift.toFixed(1))
    }
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  if (categories.length === 0) return null
  const rows = [
    { id: 'a', slots: buildRow(categories, 'a', 0, false), decorative: false },
    { id: 'b', slots: buildRow(categories, 'b', Math.ceil(categories.length / 2), true), decorative: true },
  ]

  return (
    <div ref={ref} className="occasion-marquee">
      {rows.map((row) => (
        <ul
          key={row.id}
          className={`occasion-row occasion-row--${row.id}`}
          aria-hidden={row.decorative ? true : undefined}
        >
          {row.slots.map((slot) => (
            <li key={slot.key} aria-hidden={slot.decorative && !row.decorative ? true : undefined}>
              <CategoryCard category={slot.category} index={slot.index} decorative={slot.decorative} />
            </li>
          ))}
        </ul>
      ))}
    </div>
  )
}
