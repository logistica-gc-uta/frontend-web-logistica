import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import '../../styles/drawer.css'

interface DrawerProps {
  open: boolean
  onClose: () => void
  /** Título visible; también nombra el diálogo para lectores de pantalla. */
  title: string
  titleId: string
  /** Clase extra del panel, para que los estilos de la pantalla que lo abre sigan aplicando dentro. */
  className?: string
  children: ReactNode
}

/**
 * Panel lateral modal: se abre desde la derecha, se cierra con Escape, con la X o tocando el fondo,
 * bloquea el desplazamiento de la página y devuelve el foco a quien lo abrió.
 */
export function Drawer({ open, onClose, title, titleId, className, children }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  // `onClose` puede cambiar en cada render: se guarda aparte para que el efecto (y el foco) solo
  // dependan de abrir y cerrar, y no le quiten el foco al campo que se está escribiendo.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      opener?.focus()
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div className="drawer">
      <div className="drawer__backdrop" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        className={`drawer__panel${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="drawer__head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="drawer__close" aria-label="Cerrar" onClick={onClose}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>
        <div className="drawer__body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
