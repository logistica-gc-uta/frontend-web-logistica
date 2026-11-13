import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { formatDateTime } from '../../lib/format/formatDateTime'
import type { OrderPickup } from '../dispatch/types'

const REASON_MAX_LENGTH = 500

export type PickupDecision = 'agree' | 'decline'

interface PickupSectionProps {
  title: string
  pickup: OrderPickup | null
  isSaving: boolean
  /** Devuelven `true` solo si el backend registró la acción. */
  onDecide: (decision: PickupDecision, reason: string) => Promise<boolean>
  onConfirm: (reason: string) => Promise<boolean>
}

/**
 * Retiro en tienda (backend #50). Acordar el retiro y confirmar el retiro físico son pasos distintos:
 * el acuerdo deja el pedido pendiente de retiro sin crear ruta; solo la confirmación lo entrega.
 */
export function PickupSection({
  title,
  pickup,
  isSaving,
  onDecide,
  onConfirm,
}: PickupSectionProps) {
  const [decision, setDecision] = useState<PickupDecision | null>(null)
  const [reason, setReason] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reasonError = () => (reason.trim() === '' ? 'Escribe un motivo breve' : null)

  if (pickup?.state === 'PENDING_PICKUP') {
    const confirm = async () => {
      const problem = reasonError()
      setError(problem)
      if (problem) return
      if (await onConfirm(reason.trim())) {
        setReason('')
        setConfirming(false)
      }
    }

    return (
      <section className="incident__pickup" aria-label={`Retiro en tienda de ${title}`}>
        <h4>Retiro en tienda</h4>
        <p>
          <strong>Pendiente de retiro en tienda</strong> desde el {formatDateTime(pickup.agreedAt)}.
          Todavía no está entregado: confírmalo solo cuando el cliente se lo lleve.
        </p>
        {confirming ? (
          <fieldset disabled={isSaving}>
            <legend>Confirmar retiro físico</legend>
            <TextField
              label={`Motivo de la confirmación del retiro de ${title}`}
              value={reason}
              maxLength={REASON_MAX_LENGTH}
              error={error ?? undefined}
              onChange={(event) => setReason(event.target.value)}
            />
            <Button
              isLoading={isSaving}
              loadingText="Confirmando..."
              onClick={() => void confirm()}
            >
              Sí, el cliente lo retiró
            </Button>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Volver
            </Button>
          </fieldset>
        ) : (
          <Button onClick={() => setConfirming(true)}>Confirmar retiro</Button>
        )}
      </section>
    )
  }

  const submit = async () => {
    const problem = decision === null ? 'Indica si el cliente acepta retirar' : reasonError()
    setError(problem)
    if (problem || decision === null) return
    if (await onDecide(decision, reason.trim())) {
      setDecision(null)
      setReason('')
    }
  }

  return (
    <section className="incident__pickup" aria-label={`Retiro en tienda de ${title}`}>
      <fieldset disabled={isSaving}>
        <legend>Ofrecer retiro en tienda</legend>
        <p className="text-muted">
          Alternativa a reprogramar: si el cliente acepta, el pedido queda pendiente de retiro y no
          se crea otra ruta. No es una entrega ni una cancelación.
        </p>
        <div className="incident__choices" role="radiogroup" aria-label="Respuesta al retiro">
          <label>
            <input
              type="radio"
              name={`pickup-${title}`}
              checked={decision === 'agree'}
              onChange={() => setDecision('agree')}
            />
            El cliente retirará en tienda
          </label>
          <label>
            <input
              type="radio"
              name={`pickup-${title}`}
              checked={decision === 'decline'}
              onChange={() => setDecision('decline')}
            />
            El cliente no acepta retirar
          </label>
        </div>
        <TextField
          label={`Motivo del retiro de ${title}`}
          value={reason}
          maxLength={REASON_MAX_LENGTH}
          error={error ?? undefined}
          onChange={(event) => setReason(event.target.value)}
        />
        <Button
          variant="secondary"
          isLoading={isSaving}
          loadingText="Guardando..."
          onClick={() => void submit()}
        >
          Registrar respuesta
        </Button>
      </fieldset>
    </section>
  )
}
