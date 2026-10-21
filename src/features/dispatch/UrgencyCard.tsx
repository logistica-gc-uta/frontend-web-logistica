import { useState } from 'react'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { SelectField } from '../../components/ui/SelectField'
import { TextField } from '../../components/ui/TextField'
import type { KeyedActionState } from '../../hooks/useKeyedActions'
import { formatDateTime } from '../../lib/format/formatDateTime'
import { formatKm } from '../../lib/format/formatDistance'
import { describePlanningReason } from '../../lib/planning/planningReasons'
import { localDateTimeToIso } from '../../lib/time/guayaquil'
import type { Order } from '../orders/types'
import { DRIVER_UNAVAILABLE_LABELS } from '../planning/routeLabels'
import type { Driver } from '../planning/types'
import { URGENCY_KIND_LABELS } from './dispatchLabels'
import type { RescheduleInput, UrgencyProposal } from './types'

/** El backend audita el motivo y admite hasta 500 caracteres. */
const REASON_MAX_LENGTH = 500

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

export interface UrgencyCardProps {
  proposal: UrgencyProposal
  /** Datos del pedido; pueden faltar si el pedido cambió desde que se cargó la bandeja. */
  order: Order | undefined
  /** Nombre de la ruta en la que se insertaría (propuesta `INSERT`). */
  targetRouteName: string | undefined
  drivers: Driver[]
  state: KeyedActionState | undefined
  /** Cada decisión devuelve `true` si el backend la registró. */
  onConfirm: (proposal: UrgencyProposal, reason: string, driverId?: string) => Promise<boolean>
  onReject: (proposal: UrgencyProposal, reason: string) => Promise<boolean>
  onPrioritize: (orderId: string, reason: string) => Promise<boolean>
  onReschedule: (input: RescheduleInput) => Promise<boolean>
}

/** Explicación en palabras de la propuesta del backend. */
function ProposalExplanation({
  proposal,
  targetRouteName,
}: Pick<UrgencyCardProps, 'proposal' | 'targetRouteName'>) {
  if (proposal.kind === 'INSERT') {
    return (
      <p>
        Cabe en <strong>{targetRouteName ?? 'una ruta de hoy sin iniciar'}</strong>: quedaría con{' '}
        {proposal.orderIds.length} paradas ({formatKm(proposal.totalDistanceKm)} estimados).
      </p>
    )
  }
  if (proposal.kind === 'NEW_ROUTE') {
    return (
      <p>
        Ninguna ruta de hoy puede recibirlo: están completas o ya se iniciaron. Se propone una
        salida nueva ({formatKm(proposal.totalDistanceKm)} estimados).
      </p>
    )
  }
  return <p>No se puede despachar por ahora. Sigue pendiente hasta resolver el motivo.</p>
}

/**
 * Pedido urgente de hoy con la propuesta del backend y las decisiones posibles. Toda decisión pide
 * un motivo (queda auditado) y solo se da por hecha cuando el backend la confirma.
 */
export function UrgencyCard({
  proposal,
  order,
  targetRouteName,
  drivers,
  state,
  onConfirm,
  onReject,
  onPrioritize,
  onReschedule,
}: UrgencyCardProps) {
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | undefined>()
  const [driverId, setDriverId] = useState('')
  const [isRescheduling, setIsRescheduling] = useState(false)
  const [day, setDay] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [scheduleError, setScheduleError] = useState<string | undefined>()

  const title = order?.deliveryAddress ?? `Pedido ${proposal.orderId.slice(0, 8)}`
  const isSaving = state?.status === 'saving'
  const canDecide = proposal.kind !== 'BLOCKED'
  // Para una salida nueva solo sirven los choferes que el backend propone y que siguen libres.
  const proposedDrivers = drivers.filter((driver) =>
    proposal.availableDriverIds.includes(driver.id),
  )
  const busyDrivers = drivers.filter((driver) => !driver.isAvailable)

  /**
   * Ejecuta `decide` con el motivo, o muestra el error si falta. Si la decisión se registró, limpia
   * el formulario: el motivo no debe reutilizarse en otra decisión sin escribirlo de nuevo.
   */
  const withReason = async (decide: (trimmed: string) => Promise<boolean> | undefined) => {
    const trimmed = reason.trim()
    if (trimmed === '') {
      setReasonError('Escribe el motivo de la decisión')
      return
    }
    if (await decide(trimmed)) {
      setReason('')
      setDriverId('')
      setIsRescheduling(false)
      setDay('')
      setFrom('')
      setTo('')
    }
  }

  const reschedule = () =>
    withReason((trimmed) => {
      const start = localDateTimeToIso(`${day}T${from}`)
      const end = localDateTimeToIso(`${day}T${to}`)
      if (!start || !end) {
        setScheduleError('Indica el día y la franja horaria de la nueva entrega')
        return undefined
      }
      if (end <= start) {
        setScheduleError('La hora final debe ser posterior a la inicial')
        return undefined
      }
      return onReschedule({
        orderId: proposal.orderId,
        scheduledDeliveryDate: start,
        deliveryWindowStart: start,
        deliveryWindowEnd: end,
        reason: trimmed,
      })
    })

  return (
    <article className="card urgency" aria-label={`Urgencia ${title}`}>
      <header className="urgency__header">
        <h3>{title}</h3>
        <span className={`badge${proposal.kind === 'BLOCKED' ? ' badge--danger' : ''}`}>
          {URGENCY_KIND_LABELS[proposal.kind]}
        </span>
      </header>

      <dl className="urgency__meta">
        <div>
          <dt>Estado</dt>
          <dd>Pendiente (PENDING)</dd>
        </div>
        {order && (
          <>
            <div>
              <dt>Destinatario</dt>
              <dd>{order.recipientName ?? order.user?.name ?? '—'}</dd>
            </div>
            <div>
              <dt>Zona</dt>
              <dd>{order.zone.code}</dd>
            </div>
            <div>
              <dt>Entrega</dt>
              <dd>{formatDateTime(order.scheduledDeliveryDate)}</dd>
            </div>
          </>
        )}
      </dl>

      <ProposalExplanation proposal={proposal} targetRouteName={targetRouteName} />
      {proposal.reasons.length > 0 && (
        <ul className="urgency__reasons" aria-label="Motivos">
          {proposal.reasons.map((code) => (
            <li key={code}>{capitalize(describePlanningReason(code))}</li>
          ))}
        </ul>
      )}

      <TextField
        label={`Motivo de la decisión para ${title}`}
        value={reason}
        maxLength={REASON_MAX_LENGTH}
        error={reasonError}
        onChange={(event) => {
          setReason(event.target.value)
          setReasonError(undefined)
        }}
      />

      {proposal.kind === 'NEW_ROUTE' && (
        <SelectField
          label={`Chofer para la salida de ${title}`}
          value={driverId}
          onChange={(event) => setDriverId(event.target.value)}
        >
          <option value="">Selecciona un chofer disponible</option>
          {proposedDrivers.map((driver) => (
            <option key={driver.id} value={driver.id}>
              {`${driver.name} · ${driver.vehicle}`}
            </option>
          ))}
          {busyDrivers.map((driver) => (
            <option key={driver.id} value={driver.id} disabled>
              {`${driver.name} · ${DRIVER_UNAVAILABLE_LABELS[driver.unavailableReason ?? 'MARKED_UNAVAILABLE']}`}
            </option>
          ))}
        </SelectField>
      )}

      <div className="urgency__actions">
        {proposal.kind === 'INSERT' && (
          <Button
            isLoading={isSaving}
            loadingText="Guardando..."
            onClick={() => withReason((trimmed) => onConfirm(proposal, trimmed))}
          >
            Insertar en la ruta
          </Button>
        )}
        {proposal.kind === 'NEW_ROUTE' && (
          <Button
            disabled={driverId === ''}
            isLoading={isSaving}
            loadingText="Guardando..."
            onClick={() => withReason((trimmed) => onConfirm(proposal, trimmed, driverId))}
          >
            Crear salida nueva
          </Button>
        )}
        {canDecide && (
          <Button
            variant="secondary"
            disabled={isSaving}
            onClick={() => withReason((trimmed) => onReject(proposal, trimmed))}
          >
            Rechazar propuesta
          </Button>
        )}
        <Button
          variant="secondary"
          disabled={isSaving}
          onClick={() => withReason((trimmed) => onPrioritize(proposal.orderId, trimmed))}
        >
          Priorizar
        </Button>
        <Button
          variant="secondary"
          disabled={isSaving}
          aria-expanded={isRescheduling}
          onClick={() => setIsRescheduling((current) => !current)}
        >
          Reprogramar…
        </Button>
      </div>

      {isRescheduling && (
        <div className="urgency__reschedule" role="group" aria-label={`Reprogramar ${title}`}>
          <TextField
            label="Nuevo día de entrega"
            type="date"
            value={day}
            onChange={(event) => setDay(event.target.value)}
          />
          <TextField
            label="Desde (hora de Guayaquil)"
            type="time"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
          <TextField
            label="Hasta (hora de Guayaquil)"
            type="time"
            value={to}
            error={scheduleError}
            onChange={(event) => {
              setTo(event.target.value)
              setScheduleError(undefined)
            }}
          />
          <Button isLoading={isSaving} loadingText="Guardando..." onClick={reschedule}>
            Guardar reprogramación
          </Button>
        </div>
      )}

      {state?.status === 'failed' && <Alert>{state.error}</Alert>}
    </article>
  )
}
