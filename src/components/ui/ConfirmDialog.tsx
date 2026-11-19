import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import '../../styles/confirm-dialog.css'
import { Button } from './Button'

interface ConfirmDialogProps {
  title: string
  children: ReactNode
  confirmLabel: string
  isLoading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Confirmación en un modal al centro de la pantalla: un título, una frase de qué pasará y dos
 * botones. Se cierra con Escape o tocando el fondo, y el foco empieza en «Cancelar».
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const onCancelRef = useRef(onCancel)
  useEffect(() => {
    onCancelRef.current = onCancel
  })

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    cancelRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancelRef.current()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      opener?.focus()
    }
  }, [])

  return createPortal(
    <div className="confirm">
      <div className="confirm__backdrop" aria-hidden="true" onClick={onCancel} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="confirm__panel"
      >
        <h2 id={titleId}>{title}</h2>
        <p>{children}</p>
        <div className="confirm__buttons">
          <button
            ref={cancelRef}
            type="button"
            className="btn btn--secondary"
            disabled={isLoading}
            onClick={onCancel}
          >
            Cancelar
          </button>
          <Button isLoading={isLoading} loadingText="Guardando..." onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
