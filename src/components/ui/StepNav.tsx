/** Atributos de los iconos de las flechas. */
const CHEVRON = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

interface StepNavProps {
  /** Nombre de lo que se recorre: «Falla», «Pedido» (de uno en uno) o «Rutas» (de varios en varios). */
  noun: string
  /** Posición actual (o página, si se recorre de varios en varios), empezando en 0. */
  position: number
  /** Cantidad total de elementos. */
  total: number
  /** Singular de `noun`, para cuando la última pantalla muestra un solo elemento («Ruta 3»). */
  singular?: string
  /** Elementos por pantalla; con más de uno se muestra el rango («Rutas 1–2 de 5»). */
  pageSize?: number
  onChange: (position: number) => void
  /** Nombre accesible de la navegación. */
  label: string
}

/**
 * Recorre de uno en uno una lista larga: «Falla 2 de 5» y dos flechas. Solo aparece si hay más de
 * un elemento, para no repetir información que no hace falta.
 */
export function StepNav({
  noun,
  position,
  total,
  pageSize = 1,
  singular = noun,
  onChange,
  label,
}: StepNavProps) {
  const pages = Math.ceil(total / pageSize)
  if (pages <= 1) return null
  const from = position * pageSize + 1
  const to = Math.min(total, (position + 1) * pageSize)

  return (
    <nav aria-label={label} className="incident-nav">
      <span aria-live="polite">
        <strong>{from === to ? `${singular} ${from}` : `${noun} ${from}–${to}`}</strong> de {total}
      </span>
      <div className="incident-nav__buttons">
        <button
          type="button"
          className="incident-nav__icon"
          aria-label="Anterior"
          title={`${noun} anterior`}
          disabled={position === 0}
          onClick={() => onChange(position - 1)}
        >
          <svg {...CHEVRON}>
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <button
          type="button"
          className="incident-nav__icon"
          aria-label="Siguiente"
          title={`${noun} siguiente`}
          disabled={position === pages - 1}
          onClick={() => onChange(position + 1)}
        >
          <svg {...CHEVRON}>
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>
    </nav>
  )
}
