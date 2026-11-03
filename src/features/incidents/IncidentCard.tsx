import { useState } from 'react'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import type { KeyedActionState } from '../../hooks/useKeyedActions'
import { formatDateTime } from '../../lib/format/formatDateTime'
import { localDateTimeToIso, todayInGuayaquil } from '../../lib/time/guayaquil'
import { DISPATCH_ACTION_LABELS } from '../dispatch/dispatchLabels'
import type { ContactInput, DeliveryAgreement } from '../dispatch/types'
import { describeFailureReason, MONITOR_ROUTE_STATUS_LABELS } from '../monitor/monitorLabels'
import { describeWindow, routeName, visitResult } from './incidentFormat'
import { ORDER_STATUS_LABELS } from '../orders/orderLabels'
import type { IncidentView } from './incidentsBoard'

/** El backend audita el motivo y admite hasta 500 caracteres. */
const REASON_MAX_LENGTH = 500

/** Acuerdo registrado en esta sesión: su id es lo que permite reprogramar. */
export interface RegisteredAgreement {
  id: string
  window: DeliveryAgreement
  reason: string
}

export interface IncidentCardProps {
  incident: IncidentView
  agreement: RegisteredAgreement | undefined
  state: KeyedActionState | undefined
  currentUserId: string | undefined
  /** Devuelve `true` si el backend registró el contacto. */
  onContact: (input: ContactInput) => Promise<boolean>
  onReschedule: (orderId: string, agreement: RegisteredAgreement) => Promise<boolean>
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/**
 * Entrega fallida que espera gestión. El intento fallido no cancela ni entrega el pedido: el ADMIN
 * registra el contacto con el destinatario y, solo si se acordó fecha y franja, lo reprograma.
 */
export function IncidentCard({
  incident,
  agreement,
  state,
  currentUserId,
  onContact,
  onReschedule,
}: IncidentCardProps) {
  const [agreed, setAgreed] = useState<boolean | null>(null)
  const [reason, setReason] = useState('')
  const [day, setDay] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const { order, latestAttempt, originalRoute } = incident
  const title = order?.deliveryAddress ?? `Pedido ${incident.orderId.slice(0, 8)}`
  const isSaving = state?.status === 'saving'
  const routeCompleted = originalRoute?.status === 'COMPLETED'

  const submitContact = async () => {
    const found: Record<string, string> = {}
    const trimmed = reason.trim()
    if (agreed === null) found.agreed = 'Indica si se acordó una nueva entrega'
    if (trimmed === '') found.reason = 'Escribe un motivo breve de la gestión'
    let window: DeliveryAgreement | null = null
    if (agreed) {
      const start = localDateTimeToIso(`${day}T${from}`)
      const end = localDateTimeToIso(`${day}T${to}`)
      if (!start || !end) found.window = 'Indica el día y la franja horaria acordados'
      else if (end <= start) found.window = 'La hora final debe ser posterior a la inicial'
      else if (Date.parse(start) <= Date.now()) found.window = 'La franja acordada debe ser futura'
      else
        window = {
          scheduledDeliveryDate: start,
          deliveryWindowStart: start,
          deliveryWindowEnd: end,
        }
    }
    setErrors(found)
    if (Object.keys(found).length > 0) return

    const registered = await onContact({
      orderId: incident.orderId,
      attemptId: latestAttempt?.id,
      agreement: window,
      reason: trimmed,
    })
    if (registered) {
      setAgreed(null)
      setReason('')
      setDay('')
      setFrom('')
      setTo('')
    }
  }

  return (
    <article className="card incident" aria-label={`Entrega fallida ${title}`}>
      <header className="incident__header">
        <h3>{title}</h3>
        <span className="badge badge--danger">Pendiente de gestión</span>
      </header>

      <p className="notice" role="note">
        <strong>Intento fallido.</strong> El pedido no está cancelado ni entregado: espera que el
        administrador contacte al destinatario y, si acuerdan una nueva fecha, lo reprograme.
      </p>

      <dl className="incident__meta">
        <div>
          <dt>Estado del pedido</dt>
          <dd>{order ? ORDER_STATUS_LABELS[order.status] : '—'} · en revisión</dd>
        </div>
        <div>
          <dt>Motivo del intento</dt>
          <dd>{capitalize(describeFailureReason(latestAttempt?.failureReason ?? null))}</dd>
        </div>
        <div>
          <dt>Fecha y hora del intento</dt>
          <dd>{formatDateTime(latestAttempt?.recordedAt)}</dd>
        </div>
        <div>
          <dt>Ruta original</dt>
          <dd>{originalRoute ? routeName(originalRoute) : '—'}</dd>
        </div>
        <div>
          <dt>Chofer</dt>
          <dd>{originalRoute?.driverName ?? '—'}</dd>
        </div>
      </dl>

      <section aria-label={`Historial de visitas de ${title}`}>
        <h4>Historial de visitas</h4>
        <ol className="incident__history">
          {incident.visits.map(({ route, stop }) => (
            <li key={stop.id}>
              <span>
                {routeName(route)} ({MONITOR_ROUTE_STATUS_LABELS[route.status] ?? route.status})
              </span>
              <strong>{visitResult(stop)}</strong>
            </li>
          ))}
        </ol>
      </section>

      {incident.management.length > 0 && (
        <section aria-label={`Gestiones registradas de ${title}`}>
          <h4>Gestiones registradas</h4>
          <ul className="incident__management">
            {incident.management.map((record) => (
              <li key={record.id}>
                {DISPATCH_ACTION_LABELS[record.action]} · {formatDateTime(record.recordedAt)} ·{' '}
                {record.actorId === currentUserId ? 'Tú' : 'Otro administrador'} · Motivo:{' '}
                {record.reason}
              </li>
            ))}
          </ul>
        </section>
      )}

      <fieldset className="incident__contact" disabled={isSaving}>
        <legend>Registrar contacto con el destinatario</legend>
        <div className="incident__choices" role="radiogroup" aria-label="Resultado del contacto">
          <label>
            <input
              type="radio"
              name={`agreed-${incident.orderId}`}
              checked={agreed === true}
              onChange={() => setAgreed(true)}
            />
            Se acordó una nueva entrega
          </label>
          <label>
            <input
              type="radio"
              name={`agreed-${incident.orderId}`}
              checked={agreed === false}
              onChange={() => setAgreed(false)}
            />
            No se logró acordar
          </label>
        </div>
        {errors.agreed && <p className="field__error">{errors.agreed}</p>}

        <TextField
          label={`Motivo de la gestión de ${title}`}
          value={reason}
          maxLength={REASON_MAX_LENGTH}
          error={errors.reason}
          onChange={(event) => setReason(event.target.value)}
        />

        {agreed && (
          <div className="incident__window">
            <TextField
              label="Día acordado"
              type="date"
              min={todayInGuayaquil()}
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
              error={errors.window}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
        )}

        <Button isLoading={isSaving} loadingText="Guardando..." onClick={submitContact}>
          Registrar contacto
        </Button>
      </fieldset>

      <div className="incident__reschedule">
        {agreement ? (
          <p>
            <strong>Acuerdo registrado:</strong> nueva entrega el {describeWindow(agreement.window)}
            .
          </p>
        ) : (
          <p className="text-muted">
            Para reprogramar, registra primero un contacto en el que se haya acordado la fecha y la
            franja de entrega.
          </p>
        )}
        {!routeCompleted && (
          <p className="text-muted">
            La ruta original todavía no se completó: se podrá reprogramar cuando el chofer la
            termine.
          </p>
        )}
        <Button
          variant="secondary"
          disabled={!agreement || !routeCompleted || isSaving}
          onClick={() => agreement && void onReschedule(incident.orderId, agreement)}
        >
          Reprogramar con este acuerdo
        </Button>
      </div>

      {state?.status === 'failed' && <Alert>{state.error}</Alert>}
    </article>
  )
}
