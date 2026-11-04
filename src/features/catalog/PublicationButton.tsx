import { useState } from 'react'
import { Button } from '../../components/ui/Button'

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

  if (!asking) {
    return (
      <Button variant="secondary" disabled={isSaving} onClick={() => setAsking(true)}>
        {action} <span className="visually-hidden">{name}</span>
      </Button>
    )
  }

  return (
    <span
      className="confirm-inline"
      role="group"
      aria-label={`Confirmar: ${action.toLowerCase()} ${name}`}
    >
      <span>
        {isPublished
          ? '¿Ocultarlo del Shop? Los pedidos ya hechos no cambian.'
          : '¿Mostrarlo en el Shop?'}
      </span>
      <Button
        isLoading={isSaving}
        loadingText="Guardando..."
        onClick={() => {
          setAsking(false)
          onConfirm(!isPublished)
        }}
      >
        Sí, {action.toLowerCase()}
      </Button>
      <Button variant="secondary" disabled={isSaving} onClick={() => setAsking(false)}>
        Cancelar
      </Button>
    </span>
  )
}
