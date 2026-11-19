import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { formatDateTime } from '../../lib/format/formatDateTime'
import type { OrderPickup } from '../dispatch/types'
import type { ResolvedIncidentAction } from './incidentActions'
import { describeActionDisabledReason } from './incidentLabels'

const REASON_MAX_LENGTH = 500

export type PickupDecision = 'agree' | 'decline'

interface PickupSectionProps {
  title: string
  pickup: OrderPickup | null
  isSaving: boolean
  isRefreshing?: boolean
  agreeGate?: ResolvedIncidentAction
  declineGate?: ResolvedIncidentAction
  confirmGate?: ResolvedIncidentAction
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
  isRefreshing = false,
  agreeGate,
  declineGate,
  confirmGate,
  onDecide,
  onConfirm,
}: PickupSectionProps) {
  const [decision, setDecision] = useState<PickupDecision | null>(null)
  const [reason, setReason] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isBusy = isSaving || isRefreshing

  const reasonError = () => (reason.trim() === '' ? 'Escribe un motivo breve' : null)

  if (pickup?.state === 'PICKED_UP') {
    return (
      <section className="incident__pickup" aria-label={`Retiro en tienda de ${title}`}>
        <h4>Retiro en tienda</h4>
        <p>
          <strong>Retirado en tienda</strong>
          {pickup.pickedUpAt ? ` el ${formatDateTime(pickup.pickedUpAt)}` : ''}.
        </p>
      </section>
    )
  }

  if (pickup?.state === 'PENDING_PICKUP') {
    const canConfirm = confirmGate ? confirmGate.allowed : true
    const confirm = async () => {
      if (!canConfirm || isBusy) return
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
        </p>
        {confirming && canConfirm ? (
          <fieldset disabled={isBusy}>
            <legend>Confirmar retiro físico</legend>
            <TextField
              label="Cómo se confirmó el retiro"
              placeholder="Ej.: Lo retiró el titular con su cédula"
              value={reason}
              maxLength={REASON_MAX_LENGTH}
              error={error ?? undefined}
              onChange={(event) => setReason(event.target.value)}
            />
            <Button
              disabled={isBusy}
              isLoading={isSaving}
              loadingText="Confirmando..."
              onClick={() => void confirm()}
            >
              Sí, el cliente lo retiró
            </Button>
            <Button variant="secondary" disabled={isBusy} onClick={() => setConfirming(false)}>
              Volver
            </Button>
          </fieldset>
        ) : (
          <>
            <Button disabled={!canConfirm || isBusy} onClick={() => setConfirming(true)}>
              Confirmar retiro
            </Button>
            {!canConfirm && confirmGate?.fromServer ? (
              <p className="text-muted">
                {describeActionDisabledReason(confirmGate.reasonCode)}
              </p>
            ) : (
              <p className="incident__pickup-note">
                Todavía no está entregado: confírmalo solo cuando el cliente se lo lleve.
              </p>
            )}
          </>
        )}
      </section>
    )
  }

  const canAgree = agreeGate ? agreeGate.allowed : true
  const canDecline = declineGate ? declineGate.allowed : true
  const activeDecision =
    (decision === 'agree' && !canAgree) || (decision === 'decline' && !canDecline)
      ? null
      : decision

  const submit = async () => {
    if (isBusy) return
    const problem = activeDecision === null ? 'Indica si el cliente acepta retirar' : reasonError()
    setError(problem)
    if (problem || activeDecision === null) return
    if (await onDecide(activeDecision, reason.trim())) {
      setDecision(null)
      setReason('')
    }
  }

  return (
    <section className="incident__pickup" aria-label={`Retiro en tienda de ${title}`}>
      <fieldset disabled={isBusy || (!canAgree && !canDecline)}>
        <legend>Ofrecer retiro en tienda</legend>
        <p className="text-muted">
          Si el cliente prefiere ir a la tienda, no se crea otra ruta: el pedido queda esperando su
          retiro.
        </p>
        <div
          className="incident__choices choices"
          role="radiogroup"
          aria-label="Respuesta al retiro"
        >
          <label>
            <input
              type="radio"
              name={`pickup-${title}`}
              checked={activeDecision === 'agree'}
              disabled={!canAgree}
              onChange={() => setDecision('agree')}
            />
            El cliente retirará en tienda
          </label>
          <label>
            <input
              type="radio"
              name={`pickup-${title}`}
              checked={activeDecision === 'decline'}
              disabled={!canDecline}
              onChange={() => setDecision('decline')}
            />
            El cliente no acepta retirar
          </label>
        </div>
        {!canAgree && agreeGate?.fromServer && (
          <p className="incident__hint">{describeActionDisabledReason(agreeGate.reasonCode)}</p>
        )}
        {!canDecline && declineGate?.fromServer && declineGate.reasonCode !== agreeGate?.reasonCode && (
          <p className="incident__hint">{describeActionDisabledReason(declineGate.reasonCode)}</p>
        )}
        <TextField
          label="Respuesta del cliente"
          placeholder="Ej.: Prefiere recogerlo en la tienda el lunes"
          value={reason}
          maxLength={REASON_MAX_LENGTH}
          error={error ?? undefined}
          onChange={(event) => setReason(event.target.value)}
        />
        <Button
          variant="secondary"
          disabled={isBusy || (!canAgree && !canDecline)}
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
