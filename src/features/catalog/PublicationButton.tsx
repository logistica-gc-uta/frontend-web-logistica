import { useState } from 'react'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'

interface PublicationButtonProps {
  name: string
  isPublished: boolean
  isSaving: boolean
  onConfirm: (publish: boolean) => void
}

/**
 * Publicar o despublicar afecta lo que ve el Shop: se pide confirmación antes de enviar.
 * Despublicar solo oculta el producto; no borra el registro ni los pedidos históricos.
 */
export function PublicationButton({
  name,
  isPublished,
  isSaving,
  onConfirm,
}: PublicationButtonProps) {
  const [asking, setAsking] = useState(false)
  const action = isPublished ? 'Despublicar' : 'Publicar'

  return (
    <>
      <button
        type="button"
        className="catalog-table__icon"
        title={`${action} producto`}
        disabled={isSaving}
        onClick={() => setAsking(true)}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {isPublished ? (
            <path d="M3 3l18 18M10.6 5.1A9.7 9.7 0 0 1 12 5c5 0 9 4.5 10 7a11.8 11.8 0 0 1-2.5 3.6M6.5 6.6A11.8 11.8 0 0 0 2 12c1 2.5 5 7 10 7a9.5 9.5 0 0 0 4.1-.9M9.9 9.9a3 3 0 0 0 4.2 4.2" />
          ) : (
            <>
              <path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12Z" />
              <circle cx="12" cy="12" r="3" />
            </>
          )}
        </svg>
        <span className="visually-hidden">
          {action} {name}
        </span>
      </button>

      {asking && (
        <ConfirmDialog
          title={isPublished ? '¿Despublicar este producto?' : '¿Publicar este producto?'}
          confirmLabel={`Sí, ${action.toLowerCase()}`}
          isLoading={isSaving}
          onCancel={() => setAsking(false)}
          onConfirm={() => {
            setAsking(false)
            onConfirm(!isPublished)
          }}
        >
          {isPublished
            ? `«${name}» se oculta del Shop. Los pedidos ya hechos no cambian.`
            : `«${name}» se mostrará en el Shop.`}
        </ConfirmDialog>
      )}
    </>
  )
}
