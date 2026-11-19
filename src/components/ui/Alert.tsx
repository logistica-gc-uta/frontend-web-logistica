import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type AlertVariant = 'error' | 'success'

interface AlertProps {
  variant?: AlertVariant
  children: ReactNode
}

const ICON = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

/** Cuánto se queda a la vista una notificación antes de irse sola. */
const TOAST_MS = 7000

/** Notificación de lo que pasó: un cuadrito en la esquina superior derecha que se va solo. */
function Toast({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), TOAST_MS)
    return () => clearTimeout(timer)
  }, [])

  if (!visible) return null

  return createPortal(
    <div role="status" className="toast">
      <svg {...ICON} className="toast__icon">
        <path d="m5 12.5 4.5 4.5L19 7.5" />
      </svg>
      <div className="toast__body">{children}</div>
      <button
        type="button"
        className="toast__close"
        aria-label="Cerrar aviso"
        onClick={() => setVisible(false)}
      >
        <svg {...ICON} width={14} height={14}>
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>,
    document.body,
  )
}

/**
 * Aviso mínimo. Un error es un icono y texto rojo, sin caja, en el lugar donde ocurrió. Lo que salió
 * bien es una notificación (un cuadrito arriba a la derecha) que se va sola.
 */
export function Alert({ variant = 'error', children }: AlertProps) {
  if (variant === 'success') return <Toast>{children}</Toast>

  return (
    <div role="alert" className="alert alert--error">
      <svg {...ICON} className="alert__icon">
        <path d="M12 3 2 20h20L12 3ZM12 10v4M12 17.5v.01" />
      </svg>
      <div className="alert__body">{children}</div>
    </div>
  )
}
