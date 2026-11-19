import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { orderReceiptPath } from '../../app/paths'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import type { DeliverySchedule } from '../shop/types'
import { SelectMenu } from '../orders/SelectMenu'
import { buildTimeSlots, formatTimeLabel } from '../orders/orderInput'
import type { KeyedActionState } from '../../hooks/useKeyedActions'
import { formatDateTime } from '../../lib/format/formatDateTime'
import { localDateTimeToIso, todayInGuayaquil } from '../../lib/time/guayaquil'
import { DISPATCH_ACTION_LABELS } from '../dispatch/dispatchLabels'
import type { ContactInput, DeliveryAgreement } from '../dispatch/types'
import { describeFailureReason, MONITOR_ROUTE_STATUS_LABELS } from '../monitor/monitorLabels'
import { describeWindow, routeName, visitResult } from './incidentFormat'
import type { IncidentView } from './incidentsBoard'
import { PickupSection, type PickupDecision } from './PickupSection'

/** El backend audita el motivo y admite hasta 500 caracteres. */
const REASON_MAX_LENGTH = 500

/** Sin acuerdo no se pide motivo: el registro lleva este texto fijo. */
const NO_AGREEMENT_REASON = 'No se logró acordar con el destinatario'

/** Si todavía no se conoce el horario de la tienda, se usa el habitual (7:00 a 17:00). */
const DEFAULT_SCHEDULE: DeliverySchedule = {
  timeZone: 'America/Guayaquil',
  startTime: '07:00',
  endTime: '17:00',
}

/** Acuerdo registrado en esta sesión: su id es lo que permite reprogramar. */
export interface RegisteredAgreement {
  id: string
  /** La franja solo se conoce si el acuerdo se registró en esta sesión; después queda el motivo. */
  window?: DeliveryAgreement
  reason: string
  /** Cuándo se registró (solo en los acuerdos leídos de las gestiones guardadas). */
  recordedAt?: string
}

export interface IncidentCardProps {
  incident: IncidentView
  /** Horario de entrega de la tienda: la franja acordada se elige dentro de él. */
  schedule?: DeliverySchedule
  /** Acuerdo registrado en esta sesión (con su franja). */
  agreement: RegisteredAgreement | undefined
  state: KeyedActionState | undefined
  currentUserId: string | undefined
  /** Devuelve `true` si el backend registró el contacto. */
  onContact: (input: ContactInput) => Promise<boolean>
  onReschedule: (orderId: string, agreement: RegisteredAgreement) => Promise<boolean>
  /** Retiro en tienda (backend #50): respuesta del cliente y confirmación del retiro físico. */
  onPickupDecision: (
    orderId: string,
    attemptId: string | undefined,
    decision: PickupDecision,
    reason: string,
  ) => Promise<boolean>
  onPickupConfirm: (orderId: string, reason: string) => Promise<boolean>
}

/** «Completada (COMPLETED)» → «Completada»: el código técnico no le dice nada a quien gestiona. */
const routeStatus = (status: string): string =>
  (
    MONITOR_ROUTE_STATUS_LABELS[status as keyof typeof MONITOR_ROUTE_STATUS_LABELS] ?? status
  ).replace(/\s*\(.*\)$/, '')

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/**
 * Entrega fallida que espera gestión. El intento fallido no cancela ni entrega el pedido: el ADMIN
 * registra el contacto con el destinatario y, solo si se acordó fecha y franja, lo reprograma.
 */
export function IncidentCard({
  incident,
  schedule = DEFAULT_SCHEDULE,
  agreement: sessionAgreement,
  state,
  currentUserId,
  onContact,
  onReschedule,
  onPickupDecision,
  onPickupConfirm,
}: IncidentCardProps) {
  // Horas ofrecidas para la franja: cada 30 minutos dentro del horario de entrega de la tienda.
  const windowOptions = useMemo(
    () => buildTimeSlots(schedule).map((slot) => ({ value: slot, label: formatTimeLabel(slot) })),
    [schedule],
  )
  const [agreed, setAgreed] = useState<boolean | null>(null)
  // Dos caminos excluyentes: contactar al destinatario (y reprogramar) o acordar el retiro en tienda.
  const [chosenPath, setChosenPath] = useState<'contact' | 'pickup'>('contact')
  const [reason, setReason] = useState('')
  const [day, setDay] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const { order, latestAttempt, originalRoute } = incident
  const title = order?.deliveryAddress ?? `Pedido ${incident.orderId.slice(0, 8)}`
  const isSaving = state?.status === 'saving'
  // El servidor solo reprograma o acuerda el retiro cuando la ruta original ya terminó (o se interrumpió).
  const routeCompleted =
    originalRoute?.status === 'COMPLETED' || originalRoute?.status === 'INTERRUPTED'
  // Con el retiro acordado no se ofrecen contacto ni reprogramación: serían decisiones contradictorias.
  const awaitingPickup = incident.pickup?.state === 'PENDING_PICKUP'
  // Con un acuerdo ya registrado el formulario queda bloqueado: no se vuelve a ingresar información.
  // Tras recargar la página el acuerdo se reconoce por la última gestión de contacto registrada: la API
  // no guarda la franja aparte, pero sí su identificador (con él se reprograma) y lo que se anotó.
  const lastContact = incident.management.find((record) => record.action === 'CONTACT')
  const storedAgreement: RegisteredAgreement | undefined =
    lastContact && lastContact.reason !== NO_AGREEMENT_REASON
      ? { id: lastContact.id, reason: lastContact.reason, recordedAt: lastContact.recordedAt }
      : undefined
  const agreement = sessionAgreement ?? storedAgreement
  const locked = agreement !== undefined
  // Con un camino ya acordado (fecha nueva o retiro pendiente) el otro queda bloqueado.
  const pathLocked = locked || awaitingPickup
  // El orden es siempre el mismo: primero se contacta al destinatario. Solo después de registrar un
  // contacto se puede ofrecer el retiro en tienda; antes, esa opción está bloqueada.
  const hasContact = lastContact !== undefined
  const pickupBlocked = !awaitingPickup && (!hasContact || !routeCompleted)
  const path = awaitingPickup
    ? 'pickup'
    : locked
      ? 'contact'
      : pickupBlocked
        ? 'contact'
        : chosenPath

  const submitContact = async () => {
    const found: Record<string, string> = {}
    const trimmed = reason.trim()
    if (agreed === null) found.agreed = 'Indica si se acordó una nueva entrega'
    if (agreed && trimmed === '') found.reason = 'Escribe un motivo breve de la gestión'
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
      reason: agreed ? trimmed : NO_AGREEMENT_REASON,
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
        {awaitingPickup ? (
          <span className="badge badge--warning">Pendiente de retiro en tienda</span>
        ) : (
          <span className="badge badge--danger">Entrega pendiente de gestión</span>
        )}
      </header>
      <section className="incident__status" aria-label={`Situación de ${title}`}>
        <div className="incident__what">
          <p className="incident__reason">
            {capitalize(describeFailureReason(latestAttempt?.failureReason ?? null))}
          </p>
          <p className="incident__when">
            {formatDateTime(latestAttempt?.recordedAt)}
            {originalRoute?.driverName ? ` · Chofer ${originalRoute.driverName}` : ''}
          </p>
        </div>
        <ol className="incident__steps" aria-label="Avance de la gestión">
          <li data-state="done">
            <span>Entrega fallida</span>
          </li>
          <li data-state={agreement || awaitingPickup ? 'done' : 'current'}>
            <span>
              {awaitingPickup ? 'Retiro acordado' : agreement ? 'Acuerdo hecho' : 'Contactar'}
            </span>
          </li>
          <li data-state={agreement || awaitingPickup ? 'current' : 'todo'}>
            <span>{awaitingPickup ? 'Confirmar retiro' : 'Reprogramar'}</span>
          </li>
        </ol>
        <p className="incident__next">
          <strong>Siguiente paso:</strong>{' '}
          {awaitingPickup
            ? 'confirmar el retiro cuando el cliente se lo lleve.'
            : agreement
              ? routeCompleted
                ? 'reprogramar la entrega con el acuerdo.'
                : 'reprogramarla cuando el chofer termine la ruta original.'
              : 'contactar al destinatario o acordar el retiro en tienda.'}
        </p>
      </section>

      <details className="incident__details">
        <summary>Ver historial del pedido</summary>
        <ol className="incident__timeline" aria-label={`Historial de ${title}`}>
          {incident.visits.map(({ route, stop }) => (
            <li key={stop.id}>
              <time>{formatDateTime(route.date)}</time>
              <div>
                {stop.outcome === 'FAILED' ? (
                  <>
                    <strong>Visita fallida</strong>
                    <span className="incident__why">
                      Motivo: {capitalize(describeFailureReason(stop.failureReason))}
                    </span>
                    {stop.failureContext && (
                      <span className="incident__why">Qué pasó: {stop.failureContext}</span>
                    )}
                  </>
                ) : (
                  <strong>{visitResult(stop)}</strong>
                )}
                <span>
                  {routeName(route)} · {routeStatus(route.status)}
                  {route.driverName ? ` · Chofer ${route.driverName}` : ''}
                </span>
              </div>
            </li>
          ))}
          {[...incident.management].reverse().map((record) => (
            <li key={record.id}>
              <time>{formatDateTime(record.recordedAt)}</time>
              <div>
                <strong>
                  {DISPATCH_ACTION_LABELS[record.action]} ·{' '}
                  {record.actorId === currentUserId ? 'Tú' : 'Otro administrador'}
                </strong>
                <span>Motivo: {record.reason}</span>
              </div>
            </li>
          ))}
        </ol>
      </details>

      <fieldset className="incident__path" disabled={isSaving}>
        <legend>¿Cómo se resolverá?</legend>
        <div className="choices" role="radiogroup" aria-label="Camino para resolver la entrega">
          <label>
            <input
              type="radio"
              name={`path-${incident.orderId}`}
              checked={path === 'contact'}
              disabled={pathLocked}
              onChange={() => setChosenPath('contact')}
            />
            Contactar al destinatario
          </label>
          <label>
            <input
              type="radio"
              name={`path-${incident.orderId}`}
              checked={path === 'pickup'}
              disabled={pathLocked || pickupBlocked}
              onChange={() => setChosenPath('pickup')}
            />
            Retiro en tienda
          </label>
        </div>
        {pickupBlocked && (
          <p className="incident__hint">
            {!hasContact
              ? 'Primero registra el contacto con el destinatario; después podrás ofrecerle el retiro en tienda.'
              : 'El retiro en tienda se acuerda cuando el chofer termine la ruta original: hoy sigue abierta.'}
          </p>
        )}
      </fieldset>

      {path === 'contact' && (
        <div className="incident__contact-wrap">
          {agreement && (
            <p className="incident__agreement">
              <strong>Acuerdo registrado:</strong>{' '}
              {agreement.window
                ? `nueva entrega el ${describeWindow(agreement.window)}.`
                : `${formatDateTime(agreement.recordedAt)}.`}
            </p>
          )}
          <fieldset className="incident__contact" disabled={isSaving}>
            <legend>Registrar contacto con el destinatario</legend>
            {!locked && (
              <p className="incident__hint">
                Llama o escribe al destinatario y anota aquí el resultado. Si acordaron una nueva
                fecha, indícala para poder reprogramar la entrega.
              </p>
            )}
            <div
              className="incident__choices choices"
              role="radiogroup"
              aria-label="Resultado del contacto"
            >
              <label>
                <input
                  type="radio"
                  name={`agreed-${incident.orderId}`}
                  checked={locked || agreed === true}
                  disabled={locked}
                  onChange={() => setAgreed(true)}
                />
                Se acordó una nueva entrega
              </label>
              <label>
                <input
                  type="radio"
                  name={`agreed-${incident.orderId}`}
                  checked={!locked && agreed === false}
                  disabled={locked}
                  onChange={() => setAgreed(false)}
                />
                No se logró acordar
              </label>
            </div>
            {errors.agreed && <p className="field__error">{errors.agreed}</p>}

            {!locked && agreed === true && (
              <TextField
                label="Qué se habló con el destinatario"
                placeholder="Ej.: Aceptó recibirlo el sábado por la mañana"
                value={reason}
                maxLength={REASON_MAX_LENGTH}
                error={errors.reason}
                onChange={(event) => setReason(event.target.value)}
              />
            )}

            {!locked && agreed && (
              <div className="incident__window">
                <TextField
                  label="Día acordado"
                  type="date"
                  min={todayInGuayaquil()}
                  value={day}
                  onChange={(event) => setDay(event.target.value)}
                />
                <SelectMenu
                  id={`from-${incident.orderId}`}
                  label="Desde"
                  value={from}
                  placeholder="Elige la hora"
                  options={windowOptions}
                  onChange={setFrom}
                />
                <SelectMenu
                  id={`to-${incident.orderId}`}
                  label="Hasta"
                  value={to}
                  placeholder="Elige la hora"
                  options={windowOptions}
                  error={errors.window}
                  errorId={`to-${incident.orderId}-error`}
                  onChange={setTo}
                />
                {errors.window && (
                  <p
                    id={`to-${incident.orderId}-error`}
                    className="field__error incident__window-error"
                  >
                    {errors.window}
                  </p>
                )}
              </div>
            )}

            {!locked && (
              <Button isLoading={isSaving} loadingText="Guardando..." onClick={submitContact}>
                Registrar contacto
              </Button>
            )}
          </fieldset>

          <div className="incident__reschedule">
            {!agreement && (
              <p className="text-muted">
                Para reprogramar, primero registra un contacto en el que se acordó fecha y franja.
              </p>
            )}
            {!routeCompleted && (
              <p className="text-muted">
                La ruta original todavía no se completó: se podrá reprogramar cuando el chofer la
                termine.
              </p>
            )}
            <Button
              disabled={!agreement || !routeCompleted || isSaving}
              onClick={() => agreement && void onReschedule(incident.orderId, agreement)}
            >
              Reprogramar con este acuerdo
            </Button>
          </div>
        </div>
      )}

      {path === 'pickup' && (
        <PickupSection
          title={title}
          pickup={incident.pickup}
          isSaving={isSaving}
          onDecide={(decision, why) =>
            onPickupDecision(incident.orderId, latestAttempt?.id, decision, why)
          }
          onConfirm={(why) => onPickupConfirm(incident.orderId, why)}
        />
      )}

      <p className="incident__losses">
        ¿Se perdió o se dañó un producto?{' '}
        <Link
          to={`${orderReceiptPath(incident.orderId)}${latestAttempt ? `?intento=${encodeURIComponent(latestAttempt.id)}` : ''}#perdidas`}
        >
          Pérdida o reemplazo
        </Link>
      </p>

      {state?.status === 'failed' && <Alert>{state.error}</Alert>}
    </article>
  )
}
