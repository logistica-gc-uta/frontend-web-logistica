import { useState } from 'react'
import { Alert } from '../../components/ui/Alert'
import { AsyncContent } from '../../components/ui/AsyncContent'
import { StepNav } from '../../components/ui/StepNav'
import { useFetch } from '../../hooks/useFetch'
import { useKeyedActions } from '../../hooks/useKeyedActions'
import { useRealtimeUpdates } from '../../hooks/useRealtimeUpdates'
import { useAuth } from '../auth/useAuth'
import { shopService } from '../shop/shopService'
import { dispatchService } from '../dispatch/dispatchService'
import type { ContactInput } from '../dispatch/types'
import { IncidentCard, type RegisteredAgreement } from './IncidentCard'
import { describeIncidentError } from './incidentError'
import { describeWindow } from './incidentFormat'
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
  const actions = useKeyedActions(board.reload)
  const [selected, setSelected] = useState(0)
  // Horario de entrega de la tienda: la franja acordada se elige dentro de él.
  const settings = useFetch(shopService.settings, 'No se pudo consultar el horario de entrega')
  // Las entregas fallidas llegan en vivo: cada aviso del servidor vuelve a consultar la bandeja.
  const realtime = useRealtimeUpdates({
    subscriptions: [{ resource: 'incidents' }],
    onInvalidate: board.reload,
  })
  // El acuerdo solo se conoce al registrarlo (la API no permite consultarlo después).
  const [agreements, setAgreements] = useState<Record<string, RegisteredAgreement>>({})
  const [notice, setNotice] = useState<string | null>(null)

  const forget = (orderId: string) => setAgreements(({ [orderId]: _forgotten, ...rest }) => rest)

  const contact = (input: ContactInput) =>
    actions.run(
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
      describeIncidentError,
    )

  const reschedule = (orderId: string, agreement: RegisteredAgreement) => {
    const address = board.data?.incidents.find((incident) => incident.orderId === orderId)?.order
      ?.deliveryAddress
    return actions.run(
      orderId,
      async () => {
        await dispatchService.rescheduleWithAgreement(orderId, agreement.id, agreement.reason)
        forget(orderId)
        setNotice(
          `Pedido ${address ? `«${address}» ` : ''}reprogramado para ${agreement.window ? `el ${describeWindow(agreement.window)}` : 'la fecha acordada'}. ` +
            'Volvió a estado Pendiente para planificarse ese día; sus visitas anteriores se conservan.',
        )
      },
      describeIncidentError,
    )
  }

  /**
   * Gestión del retiro en tienda (#50). Si falla (por ejemplo, se cae la red) no se da por hecha: se
   * vuelve a consultar la bandeja para ver el estado real antes de intentar de nuevo.
   */
  const runPickup = async (orderId: string, perform: () => Promise<unknown>, done: string) => {
    const ok = await actions.run(orderId, perform, describeIncidentError)
    if (ok) setNotice(done)
    else board.reload()
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
              if (incidents.length === 0) {
                return (
                  <p className="empty-state">No hay entregas fallidas pendientes de gestión.</p>
                )
              }
              // Se atiende una falla a la vez; al resolverse una, el mismo lugar pasa a la siguiente.
              const position = Math.min(selected, incidents.length - 1)
              const incident = incidents[position]
              return (
                <div className="incident-list">
                  <StepNav
                    noun="Falla"
                    label="Entregas fallidas"
                    position={position}
                    total={incidents.length}
                    onChange={setSelected}
                  />
                  <IncidentCard
                    key={incident.orderId}
                    incident={incident}
                    schedule={settings.data?.deliverySchedule}
                    agreement={agreements[incident.orderId]}
                    state={actions.states[incident.orderId]}
                    currentUserId={user?.id}
                    onContact={contact}
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
