import { useState } from 'react'
import { Alert } from '../../components/ui/Alert'
import { AsyncContent } from '../../components/ui/AsyncContent'
import { Button } from '../../components/ui/Button'
import { useFetch } from '../../hooks/useFetch'
import { useKeyedActions } from '../../hooks/useKeyedActions'
import { formatTime } from '../../lib/format/formatTime'
import { useAuth } from '../auth/useAuth'
import { dispatchService } from '../dispatch/dispatchService'
import type { ContactInput } from '../dispatch/types'
import { IncidentCard, type RegisteredAgreement } from './IncidentCard'
import { describeIncidentError } from './incidentError'
import { describeWindow } from './incidentFormat'
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
          `Pedido ${address ? `«${address}» ` : ''}reprogramado para el ${describeWindow(agreement.window)}. ` +
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
    <main className="page">
      <h1>Entregas fallidas</h1>
      <p className="text-muted">
        Pedidos cuyo intento de entrega falló. No se cancelan ni se dan por entregados: contacta al
        destinatario y, si acuerdan una nueva fecha y franja, reprográmalos, o acuerda que lo retire
        en la tienda.
      </p>

      <div className="page-stack">
        {notice && (
          <Alert variant="success">
            <span>{notice}</span>
          </Alert>
        )}

        <section className="card" aria-labelledby="incidents-title">
          <div className="planning-routes__header">
            <h2 id="incidents-title">Pendientes de gestión</h2>
            <Button variant="secondary" onClick={board.reload}>
              Actualizar
            </Button>
          </div>
          {board.data && (
            <p className="text-muted">Última actualización: {formatTime(board.data.loadedAt)}</p>
          )}
          <AsyncContent
            {...board}
            onRetry={board.reload}
            loadingText="Cargando entregas fallidas..."
          >
            {({ incidents }) =>
              incidents.length === 0 ? (
                <p className="empty-state">No hay entregas fallidas pendientes de gestión.</p>
              ) : (
                <div className="incident-list">
                  {incidents.map((incident) => (
                    <IncidentCard
                      key={incident.orderId}
                      incident={incident}
                      agreement={agreements[incident.orderId]}
                      state={actions.states[incident.orderId]}
                      currentUserId={user?.id}
                      onContact={contact}
                      onReschedule={reschedule}
                      onPickupDecision={pickupDecision}
                      onPickupConfirm={pickupConfirm}
                    />
                  ))}
                </div>
              )
            }
          </AsyncContent>
        </section>
      </div>
    </main>
  )
}
