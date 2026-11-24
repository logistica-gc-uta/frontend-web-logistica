import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { orderReceiptPath, paths } from '../../app/paths'
import { Alert } from '../../components/ui/Alert'
import { AsyncContent } from '../../components/ui/AsyncContent'
import { Button } from '../../components/ui/Button'
import { Notice } from '../../components/ui/Notice'
import { StepNav } from '../../components/ui/StepNav'
import { useFetch } from '../../hooks/useFetch'
import { useKeyedActions } from '../../hooks/useKeyedActions'
import { useRealtimeUpdates } from '../../hooks/useRealtimeUpdates'
import { useAuth } from '../auth/useAuth'
import { shopService } from '../shop/shopService'
import { dispatchService } from '../dispatch/dispatchService'
import type { ContactInput } from '../dispatch/types'
import { IncidentCard, type RegisteredAgreement } from './IncidentCard'
import { resolveIncidentState } from './incidentActions'
import { describeWindow } from './incidentFormat'
import { describeIncidentMutationError, isStaleIncidentError } from './incidentLabels'
import { ConnectionStatus } from '../monitor/ConnectionStatus'
import { loadIncidentsBoard } from './incidentsBoard'
import type { PickupDecision } from './PickupSection'

/**
 * Bandeja de entregas fallidas, separada de la de urgencias: pedidos cuyo intento de entrega falló
 * y esperan que el ADMIN contacte al destinatario y, con fecha acordada, los reprograme.
 */
export function FailedDeliveriesPage() {
  const { user } = useAuth()
  const board = useFetch(loadIncidentsBoard, 'No se pudo cargar la bandeja de entregas fallidas')
  const reloadBoard = board.reload
  const refreshPendingRef = useRef(false)
  const requestReload = useCallback(() => {
    refreshPendingRef.current = true
    reloadBoard()
  }, [reloadBoard])

  useEffect(() => {
    if (!board.isLoading) refreshPendingRef.current = false
  }, [board.isLoading])

  const actions = useKeyedActions(requestReload)
  const [selected, setSelected] = useState(0)
  // El caso a la vista se recuerda por su pedido (id estable), no solo por su posición: así sigue
  // siendo el mismo aunque la bandeja se recargue o cambie de orden (#67).
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const linkedOrderId = searchParams.get('pedido')
  const clearLink = useCallback(
    () =>
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current)
          next.delete('pedido')
          return next
        },
        { replace: true },
      ),
    [setSearchParams],
  )

  // Un enlace `?pedido=` (desde Seguimiento o un pedido) selecciona ese caso. Una vez encontrado,
  // pasa a ser la selección normal: si luego se resuelve, el lugar pasa al siguiente sin avisos.
  const incidentsData = board.data?.incidents
  useEffect(() => {
    if (!linkedOrderId || !incidentsData) return
    const index = incidentsData.findIndex((item) => item.orderId === linkedOrderId)
    if (index < 0) return
    setSelected(index)
    setSelectedOrderId(linkedOrderId)
    clearLink()
  }, [linkedOrderId, incidentsData, clearLink])
  // Horario de entrega de la tienda: la franja acordada se elige dentro de él.
  const settings = useFetch(shopService.settings, 'No se pudo consultar el horario de entrega')
  // Las entregas fallidas llegan en vivo: cada aviso del servidor vuelve a consultar la bandeja.
  const realtime = useRealtimeUpdates({
    subscriptions: [{ resource: 'incidents' }],
    onInvalidate: requestReload,
  })
  // El acuerdo solo se conoce al registrarlo (la API no permite consultarlo después).
  const [agreements, setAgreements] = useState<Record<string, RegisteredAgreement>>({})
  const [notice, setNotice] = useState<string | null>(null)

  const forget = (orderId: string) => setAgreements(({ [orderId]: _forgotten, ...rest }) => rest)

  const runAction = (
    orderId: string,
    perform: () => Promise<unknown>,
    describe: (error: unknown) => string,
  ): Promise<boolean> => {
    if (refreshPendingRef.current || board.isLoading) return Promise.resolve(false)
    return actions.run(orderId, perform, describe)
  }

  const describeError = (error: unknown) => {
    if (isStaleIncidentError(error)) requestReload()
    return describeIncidentMutationError(error)
  }

  const describeAndReload = (error: unknown) => {
    requestReload()
    return describeIncidentMutationError(error)
  }

  const contact = (input: ContactInput) =>
    runAction(
      input.orderId,
      async () => {
        const record = await dispatchService.recordContact(input)
        if (input.agreement) {
          const window = input.agreement
          setAgreements((current) => ({
            ...current,
            [input.orderId]: { id: record.id, window, reason: input.reason },
          }))
        } else {
          // Un contacto posterior sin acuerdo reemplaza al acuerdo anterior.
          forget(input.orderId)
        }
      },
      describeError,
    )

  const confirmReady = async (orderId: string, attemptId: string, reason: string) => {
    const ok = await runAction(
      orderId,
      () => dispatchService.confirmIncidentReady({ orderId, attemptId, reason }),
      describeAndReload,
    )
    if (ok) {
      setNotice(
        `Pedido ${addressOf(orderId)}: disponibilidad en tienda confirmada. Ya puedes reprogramar con un acuerdo o acordar el retiro en tienda; no se replanificó automáticamente.`,
      )
    }
    return ok
  }

  const reschedule = (orderId: string, agreement: RegisteredAgreement) => {
    const address = board.data?.incidents.find((incident) => incident.orderId === orderId)?.order
      ?.deliveryAddress
    return runAction(
      orderId,
      async () => {
        await dispatchService.rescheduleWithAgreement(orderId, agreement.id, agreement.reason)
        forget(orderId)
        setNotice(
          `Pedido ${address ? `«${address}» ` : ''}reprogramado para ${agreement.window ? `el ${describeWindow(agreement.window)}` : 'la fecha acordada'}. ` +
            'Volvió a estado Pendiente para planificarse ese día; sus visitas anteriores se conservan.',
        )
      },
      describeError,
    )
  }

  /**
   * Gestión del retiro en tienda (#50). Si falla (por ejemplo, se cae la red) no se da por hecha: se
   * vuelve a consultar la bandeja para ver el estado real antes de intentar de nuevo.
   */
  const runPickup = async (orderId: string, perform: () => Promise<unknown>, done: string) => {
    const ok = await runAction(orderId, perform, describeAndReload)
    if (ok) setNotice(done)
    return ok
  }

  const addressOf = (orderId: string) => {
    const address = board.data?.incidents.find((incident) => incident.orderId === orderId)?.order
      ?.deliveryAddress
    return address ? `«${address}»` : orderId.slice(0, 8)
  }

  const pickupDecision = (
    orderId: string,
    attemptId: string | undefined,
    decision: PickupDecision,
    reason: string,
  ) =>
    decision === 'agree'
      ? runPickup(
          orderId,
          () => dispatchService.agreePickup({ orderId, attemptId, reason }),
          `Pedido ${addressOf(orderId)}: retiro en tienda acordado. Queda pendiente de retiro; no se creó otra ruta y todavía no está entregado.`,
        )
      : runPickup(
          orderId,
          () => dispatchService.declinePickup({ orderId, attemptId, reason }),
          `Pedido ${addressOf(orderId)}: el cliente no aceptó retirar. Sigue pendiente de gestión.`,
        )

  const pickupConfirm = (orderId: string, reason: string) =>
    runPickup(
      orderId,
      () => dispatchService.confirmPickup(orderId, reason),
      `Pedido ${addressOf(orderId)} entregado: retirado en tienda.`,
    )

  return (
    <main className="page page--wide">
      <header className="planning-page__head">
        <div>
          <h1>Entregas fallidas</h1>
          <p className="text-muted">
            Pedidos cuyo intento de entrega falló: contacta al destinatario para reprogramar o
            acordar el retiro en tienda.
          </p>
        </div>
        <ConnectionStatus
          status={realtime.status}
          updatedAt={board.data?.loadedAt}
          deniedCount={realtime.deniedCount}
          onReconnect={realtime.reconnect}
        />
      </header>

      <div className="page-stack">
        <section className="card" aria-labelledby="incidents-title">
          <div className="planning-routes__header">
            <h2 id="incidents-title">Pendientes de gestión</h2>
          </div>
          {notice && <Alert variant="success">{notice}</Alert>}
          <AsyncContent
            {...board}
            onRetry={board.reload}
            loadingText="Cargando entregas fallidas..."
          >
            {({ incidents }) => {
              const visibleOrderIds = new Set(incidents.map((item) => item.orderId))
              const missingIncidentErrors = Object.entries(actions.states).flatMap(
                ([orderId, state]) =>
                  state.status === 'failed' && !visibleOrderIds.has(orderId)
                    ? [[orderId, state.error] as const]
                    : [],
              )
              // El caso enlazado ya no está pendiente (se resolvió o nunca existió): salida clara.
              const missingLink =
                linkedOrderId !== null && !visibleOrderIds.has(linkedOrderId) ? (
                  <Notice tone="warning">
                    Ese pedido ya no tiene una entrega fallida pendiente de gestión: pudo
                    reprogramarse, retirarse en tienda o resolverse en otra sesión.{' '}
                    <Link to={orderReceiptPath(linkedOrderId)}>Ver el pedido</Link>{' '}
                    <Button variant="secondary" onClick={clearLink}>
                      Ver los pendientes
                    </Button>
                  </Notice>
                ) : null
              const emergencyIncidents = incidents.filter(
                (item) => resolveIncidentState(item, agreements[item.orderId]).isEmergencyCustody,
              )
              const ordinaryIncidents = incidents.filter(
                (item) => !resolveIncidentState(item, agreements[item.orderId]).isEmergencyCustody,
              )
              const linkedEmergency =
                linkedOrderId !== null
                  ? emergencyIncidents.find((item) => item.orderId === linkedOrderId)
                  : undefined
              const emergencyBanner =
                emergencyIncidents.length > 0 ? (
                  <Notice tone="warning">
                    {emergencyIncidents.length === 1
                      ? 'Hay 1 pedido bajo custodia por emergencia activa. Su recuperación se gestiona aparte en Emergencias.'
                      : `Hay ${emergencyIncidents.length} pedidos bajo custodia por emergencia activa. Su recuperación se gestiona aparte en Emergencias.`}{' '}
                    <Link to={paths.emergencies}>Ir a Emergencias</Link>
                  </Notice>
                ) : null
              if (linkedEmergency) {
                return (
                  <div className="incident-list">
                    {emergencyBanner}
                    {missingIncidentErrors.map(([orderId, error]) => (
                      <Alert key={orderId}>{error}</Alert>
                    ))}
                    <IncidentCard
                      key={linkedEmergency.orderId}
                      incident={linkedEmergency}
                      schedule={settings.data?.deliverySchedule}
                      agreement={agreements[linkedEmergency.orderId]}
                      state={actions.states[linkedEmergency.orderId]}
                      isRefreshing={board.isLoading}
                      currentUserId={user?.id}
                      onContact={contact}
                      onConfirmReady={confirmReady}
                      onReschedule={reschedule}
                      onPickupDecision={pickupDecision}
                      onPickupConfirm={pickupConfirm}
                    />
                  </div>
                )
              }
              if (ordinaryIncidents.length === 0) {
                return (
                  <>
                    {emergencyBanner}
                    {missingLink}
                    {missingIncidentErrors.map(([orderId, error]) => (
                      <Alert key={orderId}>{error}</Alert>
                    ))}
                    <p className="empty-state">No hay entregas fallidas pendientes de gestión.</p>
                  </>
                )
              }
              // Se atiende una falla ordinaria a la vez; las emergencias quedan fuera de esta cola.
              const byId = selectedOrderId
                ? ordinaryIncidents.findIndex((item) => item.orderId === selectedOrderId)
                : -1
              const position = byId >= 0 ? byId : Math.min(selected, ordinaryIncidents.length - 1)
              const incident = ordinaryIncidents[position]
              return (
                <div className="incident-list">
                  {emergencyBanner}
                  {missingLink}
                  {missingIncidentErrors.map(([orderId, error]) => (
                    <Alert key={orderId}>{error}</Alert>
                  ))}
                  <StepNav
                    noun="Falla"
                    label="Entregas fallidas"
                    position={position}
                    total={ordinaryIncidents.length}
                    onChange={(next) => {
                      setSelected(next)
                      setSelectedOrderId(ordinaryIncidents[next]?.orderId ?? null)
                    }}
                  />
                  <IncidentCard
                    key={incident.orderId}
                    incident={incident}
                    schedule={settings.data?.deliverySchedule}
                    agreement={agreements[incident.orderId]}
                    state={actions.states[incident.orderId]}
                    isRefreshing={board.isLoading}
                    currentUserId={user?.id}
                    onContact={contact}
                    onConfirmReady={confirmReady}
                    onReschedule={reschedule}
                    onPickupDecision={pickupDecision}
                    onPickupConfirm={pickupConfirm}
                  />
                </div>
              )
            }}
          </AsyncContent>
        </section>
      </div>
    </main>
  )
}
