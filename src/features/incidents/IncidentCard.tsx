import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { orderReceiptPath, paths } from '../../app/paths'
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
import type {
  ContactInput,
  DeliveryAgreement,
  IncidentEmergencyContext,
  IncidentReadiness,
} from '../dispatch/types'
import { describeFailureReason, MONITOR_ROUTE_STATUS_LABELS } from '../monitor/monitorLabels'
import {
  NO_AGREEMENT_REASON,
  resolveIncidentState,
  type RegisteredAgreement,
  type ResolvedIncidentAction,
} from './incidentActions'
import { describeWindow, routeName, visitResult } from './incidentFormat'
import { describeActionDisabledReason, incidentStatusBadge } from './incidentLabels'
import type { IncidentView } from './incidentsBoard'
import { PickupSection, type PickupDecision } from './PickupSection'

export type { RegisteredAgreement } from './incidentActions'

/** El backend audita el motivo y admite hasta 500 caracteres. */
const REASON_MAX_LENGTH = 500

/** Si todavía no se conoce el horario de la tienda, se usa el habitual (7:00 a 17:00). */
const DEFAULT_SCHEDULE: DeliverySchedule = {
  timeZone: 'America/Guayaquil',
  startTime: '07:00',
  endTime: '17:00',
}

export interface IncidentCardProps {
  incident: IncidentView
  /** Horario de entrega de la tienda: la franja acordada se elige dentro de él. */
  schedule?: DeliverySchedule
  /** Acuerdo registrado en esta sesión (con su franja). */
  agreement: RegisteredAgreement | undefined
  state: KeyedActionState | undefined
  /** Hay una recarga de bandeja en curso; bloquea acciones sobre el snapshot anterior. */
  isRefreshing?: boolean
  currentUserId: string | undefined
  /** Devuelve `true` si el backend registró el contacto. */
  onContact: (input: ContactInput) => Promise<boolean>
  /** Confirma explícitamente disponibilidad física del pedido o reemplazo en tienda. */
  onConfirmReady?: (orderId: string, attemptId: string, reason: string) => Promise<boolean>
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

function EmergencyCustodySection({
  title,
  emergency,
}: {
  title: string
  emergency: IncidentEmergencyContext | null | undefined
}) {
  return (
    <section className="incident__pickup" aria-label={`Custodia por emergencia de ${title}`}>
      <h4>Custodia por emergencia</h4>
      <p className="text-muted">
        Este pedido está gestionado por una emergencia activa. Sus acciones de recuperación y
        resolución se atienden desde Emergencias y no desde la bandeja ordinaria de entregas
        fallidas.
      </p>
      {emergency && (
        <p>
          {emergency.recoveryResolved
            ? `Recuperación resuelta (${emergency.totalUnitsCount} unidades verificadas).`
            : `${emergency.pendingUnitsCount} de ${emergency.totalUnitsCount} unidades pendientes de recuperación.`}
        </p>
      )}
      <Link className="btn btn--primary" to={paths.emergencies}>
        Ir a Emergencias
      </Link>
    </section>
  )
}

function StoreReadinessSection({
  title,
  readiness,
  gate,
  attemptId,
  currentUserId,
  isSaving,
  isRefreshing,
  onConfirm,
}: {
  title: string
  readiness: IncidentReadiness | null | undefined
  gate: ResolvedIncidentAction
  attemptId: string | undefined
  currentUserId: string | undefined
  isSaving: boolean
  isRefreshing: boolean
  onConfirm: ((reason: string) => Promise<boolean>) | undefined
}) {
  const [confirming, setConfirming] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (readiness) {
    return (
      <section className="incident__pickup" aria-label={`Disponibilidad en tienda de ${title}`}>
        <h4>Disponibilidad en tienda</h4>
        <p>
          <strong>Disponibilidad en tienda confirmada</strong> el{' '}
          {formatDateTime(readiness.confirmedAt)} ·{' '}
          {readiness.confirmedById === currentUserId ? 'Tú' : 'Otro administrador'}.
        </p>
      </section>
    )
  }

  if (!gate.fromServer) return null

  const isBusy = isSaving || isRefreshing
  const canConfirm = gate.allowed && Boolean(attemptId) && Boolean(onConfirm)

  const submit = async () => {
    if (!canConfirm || !onConfirm || isBusy) return
    const trimmed = reason.trim()
    if (trimmed === '') {
      setError('Escribe un motivo breve')
      return
    }
    if (trimmed.length > REASON_MAX_LENGTH) {
      setError(`El motivo no puede superar ${REASON_MAX_LENGTH} caracteres`)
      return
    }
    setError(null)
    if (await onConfirm(trimmed)) {
      setReason('')
      setConfirming(false)
    }
  }

  return (
    <section className="incident__pickup" aria-label={`Disponibilidad en tienda de ${title}`}>
      <h4>Disponibilidad en tienda</h4>
      {confirming && canConfirm ? (
        <fieldset disabled={isBusy}>
          <legend>Confirmar disponibilidad en tienda</legend>
          <p className="text-muted">
            Confirma que el pedido devuelto o un reemplazo está físicamente disponible en tienda.
            Esta confirmación no replanifica automáticamente el pedido.
          </p>
          <TextField
            label="Motivo o verificación en tienda"
            placeholder="Ej.: Pedido devuelto verificado en bodega"
            value={reason}
            maxLength={REASON_MAX_LENGTH}
            error={error ?? undefined}
            onChange={(event) => {
              setReason(event.target.value)
              setError(null)
            }}
          />
          <Button
            disabled={isBusy}
            isLoading={isSaving}
            loadingText="Confirmando..."
            onClick={() => void submit()}
          >
            Sí, confirmar disponibilidad
          </Button>
          <Button
            variant="secondary"
            disabled={isBusy}
            onClick={() => {
              setConfirming(false)
              setError(null)
            }}
          >
            Volver
          </Button>
        </fieldset>
      ) : (
        <>
          <p className="text-muted">
            Antes de reprogramar o acordar el retiro en tienda, confirma que el pedido devuelto o un
            reemplazo está disponible en tienda.
          </p>
          <Button
            variant="secondary"
            disabled={!canConfirm || isBusy}
            onClick={() => setConfirming(true)}
          >
            Confirmar disponibilidad en tienda
          </Button>
          {!gate.allowed && (
            <p className="incident__hint">{describeActionDisabledReason(gate.reasonCode)}</p>
          )}
        </>
      )}
    </section>
  )
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
  isRefreshing = false,
  currentUserId,
  onContact,
  onConfirmReady,
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
  const isBusy = isSaving || isRefreshing
  const resolved = resolveIncidentState(incident, sessionAgreement)
  const {
    usesServerContract,
    isEmergencyCustody,
    awaitingPickup,
    isPickedUp,
    canonicalAttemptId,
    agreement,
    hasContact,
    routeCompleted,
    actions,
  } = resolved

  const locked = agreement !== undefined
  const usesServerGates = actions.RESCHEDULE.fromServer
  // Con un camino ya acordado (fecha nueva en modo legado o retiro pendiente) el otro queda bloqueado.
  const pathLocked = awaitingPickup || isPickedUp || (!usesServerGates && locked)
  const pickupBlocked = usesServerGates
    ? !awaitingPickup &&
      !isPickedUp &&
      !actions.PICKUP_AGREE.allowed &&
      !actions.PICKUP_DECLINE.allowed &&
      !actions.PICKUP_CONFIRM.allowed
    : !awaitingPickup && (!hasContact || !routeCompleted)
  const path =
    awaitingPickup || isPickedUp
      ? 'pickup'
      : !usesServerGates && locked
        ? 'contact'
        : pickupBlocked
          ? 'contact'
          : chosenPath

  const statusBadge = incident.status
    ? incidentStatusBadge(incident.status)
    : awaitingPickup
      ? { label: 'Pendiente de retiro en tienda', className: 'badge badge--warning' }
      : { label: 'Entrega pendiente de gestión', className: 'badge badge--danger' }

  const nextStepText = isEmergencyCustody
    ? 'gestionar la custodia y recuperación desde Emergencias.'
    : isPickedUp
      ? 'retiro en tienda confirmado.'
      : awaitingPickup
        ? 'confirmar el retiro cuando el cliente se lo lleve.'
        : usesServerContract
          ? incident.readiness
            ? agreement
              ? 'reprogramar la entrega con el acuerdo.'
              : 'acordar una nueva fecha o el retiro en tienda.'
            : agreement
              ? 'confirmar disponibilidad en tienda para habilitar la reprogramación.'
              : 'contactar al destinatario y confirmar disponibilidad en tienda para reprogramar o acordar retiro.'
          : agreement
            ? routeCompleted
              ? 'reprogramar la entrega con el acuerdo.'
              : 'reprogramarla cuando el chofer termine la ruta original.'
            : 'contactar al destinatario o acordar el retiro en tienda.'

  const submitContact = async () => {
    if (isBusy) return
    if (actions.CONTACT.fromServer && !actions.CONTACT.allowed) return
    if (usesServerContract && !canonicalAttemptId) return
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
      attemptId: canonicalAttemptId,
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
    <article
      className="card incident"
      aria-label={`Entrega fallida ${title}`}
      aria-busy={isBusy || undefined}
    >
      <header className="incident__header">
        <h3>{title}</h3>
        <span className={statusBadge.className}>{statusBadge.label}</span>
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
          <li data-state={agreement || awaitingPickup || isPickedUp ? 'done' : 'current'}>
            <span>
              {awaitingPickup || isPickedUp
                ? 'Retiro acordado'
                : agreement
                  ? 'Acuerdo hecho'
                  : 'Contactar'}
            </span>
          </li>
          <li data-state={isPickedUp ? 'done' : agreement || awaitingPickup ? 'current' : 'todo'}>
            <span>{awaitingPickup || isPickedUp ? 'Confirmar retiro' : 'Reprogramar'}</span>
          </li>
        </ol>
        <p className="incident__next">
          <strong>Siguiente paso:</strong> {nextStepText}
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

      {isEmergencyCustody ? (
        <EmergencyCustodySection title={title} emergency={incident.emergency} />
      ) : (
        <>
          {usesServerContract && !awaitingPickup && !isPickedUp && (
            <StoreReadinessSection
              key={canonicalAttemptId ?? 'no-attempt'}
              title={title}
              readiness={incident.readiness}
              gate={actions.CONFIRM_INCIDENT_READY}
              attemptId={canonicalAttemptId}
              currentUserId={currentUserId}
              isSaving={isSaving}
              isRefreshing={isRefreshing}
              onConfirm={
                onConfirmReady && canonicalAttemptId
                  ? (why) => onConfirmReady(incident.orderId, canonicalAttemptId, why)
                  : undefined
              }
            />
          )}

          <fieldset className="incident__path" disabled={isBusy}>
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
                {usesServerGates
                  ? describeActionDisabledReason(
                      actions.PICKUP_AGREE.reasonCode ?? actions.PICKUP_DECLINE.reasonCode,
                    )
                  : !hasContact
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
                    : agreement.recordedAt
                      ? `${formatDateTime(agreement.recordedAt)}.`
                      : 'acuerdo vigente registrado.'}
                </p>
              )}
              <fieldset
                className="incident__contact"
                disabled={isBusy || (actions.CONTACT.fromServer && !actions.CONTACT.allowed)}
              >
                <legend>Registrar contacto con el destinatario</legend>
                {actions.CONTACT.fromServer && !actions.CONTACT.allowed ? (
                  <p className="text-muted">
                    {describeActionDisabledReason(actions.CONTACT.reasonCode)}
                  </p>
                ) : (
                  !locked && (
                    <p className="incident__hint">
                      Llama o escribe al destinatario y anota aquí el resultado. Si acordaron una
                      nueva fecha, indícala para poder reprogramar la entrega.
                    </p>
                  )
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
                  <Button
                    disabled={isBusy}
                    isLoading={isSaving}
                    loadingText="Guardando..."
                    onClick={submitContact}
                  >
                    Registrar contacto
                  </Button>
                )}
              </fieldset>

              <div className="incident__reschedule">
                {usesServerGates ? (
                  !actions.RESCHEDULE.allowed && (
                    <p className="text-muted">
                      {describeActionDisabledReason(actions.RESCHEDULE.reasonCode)}
                    </p>
                  )
                ) : (
                  <>
                    {!agreement && (
                      <p className="text-muted">
                        Para reprogramar, primero registra un contacto en el que se acordó fecha y
                        franja.
                      </p>
                    )}
                    {!routeCompleted && (
                      <p className="text-muted">
                        La ruta original todavía no se completó: se podrá reprogramar cuando el
                        chofer la termine.
                      </p>
                    )}
                  </>
                )}
                <Button
                  disabled={
                    usesServerGates
                      ? !actions.RESCHEDULE.allowed || !agreement || isBusy
                      : !agreement || !routeCompleted || isBusy
                  }
                  onClick={() =>
                    !isBusy &&
                    (!usesServerGates || actions.RESCHEDULE.allowed) &&
                    agreement &&
                    void onReschedule(incident.orderId, agreement)
                  }
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
              isRefreshing={isRefreshing}
              agreeGate={actions.PICKUP_AGREE}
              declineGate={actions.PICKUP_DECLINE}
              confirmGate={actions.PICKUP_CONFIRM}
              onDecide={(decision, why) =>
                usesServerContract && !canonicalAttemptId
                  ? Promise.resolve(false)
                  : onPickupDecision(incident.orderId, canonicalAttemptId, decision, why)
              }
              onConfirm={(why) => onPickupConfirm(incident.orderId, why)}
            />
          )}

          <p className="incident__losses">
            ¿Se perdió o se dañó un producto?{' '}
            <Link
              to={`${orderReceiptPath(incident.orderId)}${canonicalAttemptId ? `?intento=${encodeURIComponent(canonicalAttemptId)}` : ''}#perdidas`}
            >
              Pérdida o reemplazo
            </Link>
          </p>
        </>
      )}

      {state?.status === 'failed' && <Alert>{state.error}</Alert>}
    </article>
  )
}
