import { useState } from 'react'
import { Link } from 'react-router'
import { orderReceiptPath, paths } from '../../app/paths'
import { Alert } from '../../components/ui/Alert'
import { AsyncContent } from '../../components/ui/AsyncContent'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { useFetch } from '../../hooks/useFetch'
import { formatDateTime } from '../../lib/format/formatDateTime'
import { dispatchService } from '../dispatch/dispatchService'
import { routeName } from '../incidents/incidentFormat'
import { describeEmergencyError } from './emergencyErrors'
import { loadEmergencies, type EmergencyOrder, type EmergencyView } from './emergencyBoard'
import type { EmergencyUnit, EmergencyUnitStatus } from './types'
import '../../styles/emergencies.css'

const REASON_MAX_LENGTH = 500

const UNIT_STATUS: Record<EmergencyUnitStatus, { text: string; tone: string }> = {
  PENDING: { text: 'Pendiente de recuperar', tone: 'badge--warning' },
  RECOVERED: { text: 'Recuperada en la tienda', tone: 'badge--success' },
  LOST_PREPARED: { text: 'Perdida · reemplazo preparado', tone: 'badge--success' },
  LOST_PENDING: { text: 'Perdida · reemplazo pendiente (sin stock)', tone: 'badge--danger' },
}

/** Botón que pide un motivo antes de confirmar una acción auditada. */
function ReasonAction({
  label,
  fieldLabel,
  confirmLabel,
  busy,
  onConfirm,
}: {
  label: string
  fieldLabel: string
  confirmLabel: string
  busy: boolean
  /** Devuelve `true` si el servidor aplicó la acción. */
  onConfirm: (reason: string) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!open) {
    return (
      <Button variant="secondary" disabled={busy} onClick={() => setOpen(true)}>
        {label}
      </Button>
    )
  }

  const confirm = async () => {
    if (reason.trim() === '') {
      setError('Escribe un motivo breve')
      return
    }
    setError(null)
    if (await onConfirm(reason.trim())) {
      setOpen(false)
      setReason('')
    }
  }

  return (
    <fieldset className="emergency__reason" disabled={busy}>
      <TextField
        label={fieldLabel}
        value={reason}
        maxLength={REASON_MAX_LENGTH}
        error={error ?? undefined}
        onChange={(event) => setReason(event.target.value)}
      />
      <div className="emergency__buttons">
        <Button isLoading={busy} loadingText="Guardando..." onClick={() => void confirm()}>
          {confirmLabel}
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </fieldset>
  )
}

interface ActionsProps {
  busy: boolean
  run: (perform: () => Promise<unknown>, done: string, fallback: string) => Promise<boolean>
}

function UnitRow({
  unit,
  productName,
  run,
  busy,
}: { unit: EmergencyUnit; productName: string } & ActionsProps) {
  const status = UNIT_STATUS[unit.status]
  const label = `${productName} (unidad ${unit.unitNumber})`
  return (
    <li className="emergency__unit" aria-label={`Unidad ${label}`}>
      <div>
        <strong>{label}</strong> <span className={`badge ${status.tone}`}>{status.text}</span>
        {unit.recoveredAt && (
          <span className="text-muted"> · confirmada el {formatDateTime(unit.recoveredAt)}</span>
        )}
      </div>
      {unit.status === 'PENDING' && (
        <div className="emergency__buttons">
          <ReasonAction
            label="Confirmar retorno"
            fieldLabel={`Motivo del retorno de ${label}`}
            confirmLabel="Sí, volvió a la tienda"
            busy={busy}
            onConfirm={(reason) =>
              run(
                () => dispatchService.confirmUnitRecovery(unit.id, reason),
                `Retorno de ${label} confirmado. El stock no cambia.`,
                'No se pudo confirmar el retorno',
              )
            }
          />
          <Link to={`${orderReceiptPath(unit.orderId)}#perdidas`}>
            No aparece: declarar pérdida
          </Link>
        </div>
      )}
    </li>
  )
}

function OrderBlock({ entry, run, busy }: { entry: EmergencyOrder } & ActionsProps) {
  const title = entry.order?.deliveryAddress ?? `Pedido ${entry.orderId.slice(0, 8)}`
  const productOf = (unit: EmergencyUnit) =>
    entry.order?.items.find((item) => item.id === unit.orderItemId)?.product.name ?? 'Producto'

  return (
    <section className="emergency__order" aria-label={`Pedido ${title}`}>
      <h4>{title}</h4>
      <ul className="emergency__units">
        {entry.units.map((unit) => (
          <UnitRow key={unit.id} unit={unit} productName={productOf(unit)} run={run} busy={busy} />
        ))}
      </ul>
      {!entry.resolved ? (
        <p className="text-muted">
          Sigue bloqueado: no se puede planificar, reprogramar ni acordar un retiro hasta que todas
          sus unidades vuelvan o tengan un reemplazo preparado.
        </p>
      ) : entry.awaitingReview ? (
        <div className="emergency__buttons">
          <p className="text-muted">
            Todas sus unidades están resueltas. Decide cómo sigue: habilitarlo para planificar, o
            coordinar una nueva fecha o el retiro en tienda.
          </p>
          <ReasonAction
            label="Habilitar para planificar"
            fieldLabel={`Motivo para habilitar ${title}`}
            confirmLabel="Habilitar"
            busy={busy}
            onConfirm={(reason) =>
              run(
                () =>
                  dispatchService.requeueOrder(entry.orderId, entry.units[0].emergencyId, reason),
                `Pedido ${title} habilitado: ya aparece en Planificación.`,
                'No se pudo habilitar el pedido',
              )
            }
          />
        </div>
      ) : (
        <p className="text-muted">Habilitado para planificar.</p>
      )}
    </section>
  )
}

function EmergencyCard({ view, run, busy }: { view: EmergencyView } & ActionsProps) {
  const { emergency, route } = view
  const name = route ? routeName(route) : `Ruta ${emergency.routeId.slice(0, 8)}`
  const resolvedStops = (route?.stops ?? []).filter(
    (stop) => stop.outcome === 'SUCCESSFUL' || stop.outcome === 'FAILED',
  )
  const { counts } = emergency

  return (
    <article className="card emergency" aria-label={`Emergencia de ${name}`}>
      <header className="emergency__header">
        <h3>{name}</h3>
        {emergency.closedAt ? (
          <span className="badge">Cerrada el {formatDateTime(emergency.closedAt)}</span>
        ) : (
          <span className="badge badge--danger">Abierta</span>
        )}
      </header>
      <p>
        <strong>Motivo:</strong> {emergency.reason} · declarada el{' '}
        {formatDateTime(emergency.declaredAt)}
      </p>

      <dl className="emergency__counts" aria-label={`Unidades de ${name}`}>
        <div>
          <dt>Unidades en custodia</dt>
          <dd>{counts.totalUnits}</dd>
        </div>
        <div>
          <dt>Recuperadas</dt>
          <dd>{counts.recoveredUnits}</dd>
        </div>
        <div>
          <dt>Con reemplazo preparado</dt>
          <dd>{counts.lostPreparedUnits}</dd>
        </div>
        <div>
          <dt>Reemplazo pendiente</dt>
          <dd>{counts.lostPendingUnits}</dd>
        </div>
        <div>
          <dt>Pendientes de recuperar</dt>
          <dd>{counts.pendingUnits}</dd>
        </div>
      </dl>

      <section aria-label={`Lo que ya pasó en ${name}`}>
        <h4>Lo que ya pasó en la ruta</h4>
        {resolvedStops.length === 0 ? (
          <p className="text-muted">Ninguna parada se había resuelto antes de la emergencia.</p>
        ) : (
          <ul className="emergency__stops">
            {resolvedStops.map((stop) => (
              <li key={stop.id}>
                {stop.deliveryAddress} ·{' '}
                <strong>{stop.outcome === 'SUCCESSFUL' ? 'Entregado' : 'Visita fallida'}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label={`Repartidor de ${name}`}>
        <h4>Repartidor</h4>
        {emergency.returnedAt ? (
          <p>Retorno al depósito confirmado el {formatDateTime(emergency.returnedAt)}.</p>
        ) : (
          <>
            <p>
              Su retorno todavía no está confirmado. Recuperar productos o cerrar la emergencia no
              lo libera: confírmalo aparte cuando vuelva.
            </p>
            <ReasonAction
              label="Confirmar retorno del repartidor"
              fieldLabel={`Motivo del retorno del repartidor de ${name}`}
              confirmLabel="Sí, volvió al depósito"
              busy={busy}
              onConfirm={(reason) =>
                run(
                  () => dispatchService.releaseEmergencyDriver(emergency.routeId, reason),
                  'Retorno del repartidor confirmado. Su disponibilidad la decide el servidor (ausencias incluidas).',
                  'No se pudo confirmar el retorno del repartidor',
                )
              }
            />
          </>
        )}
      </section>

      <section aria-label={`Productos en custodia de ${name}`}>
        <h4>Productos en custodia</h4>
        {view.orders.length === 0 ? (
          <p className="text-muted">No quedaban productos pendientes al declarar la emergencia.</p>
        ) : (
          view.orders.map((entry) => (
            <OrderBlock key={entry.orderId} entry={entry} run={run} busy={busy} />
          ))
        )}
      </section>

      {!emergency.closedAt && (
        <div className="emergency__close">
          {counts.pendingUnits + counts.lostPendingUnits > 0 && (
            <p className="text-muted">
              Puedes cerrar la emergencia aunque queden unidades pendientes: seguirán aquí, a la
              vista, y sus pedidos seguirán bloqueados.
            </p>
          )}
          <ReasonAction
            label="Cerrar emergencia"
            fieldLabel={`Motivo del cierre de ${name}`}
            confirmLabel="Cerrar"
            busy={busy}
            onConfirm={(reason) =>
              run(
                () => dispatchService.closeEmergency(emergency.routeId, reason),
                'Emergencia cerrada. Las unidades pendientes siguen a la vista.',
                'No se pudo cerrar la emergencia',
              )
            }
          />
        </div>
      )}
      {emergency.closedAt && counts.pendingUnits + counts.lostPendingUnits > 0 && (
        <p className="notice" role="note">
          <strong>Cerrada con pendientes:</strong> quedan{' '}
          {counts.pendingUnits + counts.lostPendingUnits} unidades sin recuperar o sin reemplazo.
        </p>
      )}
    </article>
  )
}

/**
 * ADMIN · Emergencias en ruta (backend #51): lo entregado se conserva, cada unidad pendiente se
 * recupera por separado, el retorno del repartidor y el cierre son acciones aparte, y un pedido solo
 * vuelve a planificarse cuando el ADMIN lo decide con todas sus unidades resueltas.
 */
export function EmergenciesPage() {
  const board = useFetch(loadEmergencies, 'No se pudieron cargar las emergencias')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const run = async (perform: () => Promise<unknown>, done: string, fallback: string) => {
    setBusy(true)
    setMessage(null)
    try {
      await perform()
      setMessage({ kind: 'success', text: done })
      return true
    } catch (error) {
      setMessage({ kind: 'error', text: describeEmergencyError(error, fallback) })
      return false
    } finally {
      setBusy(false)
      // Con éxito o sin él se vuelve a leer: el estado real lo decide el servidor.
      board.reload()
    }
  }

  return (
    <main className="page">
      <h1>Emergencias</h1>
      <p className="text-muted">
        Rutas interrumpidas por una emergencia. Se declaran desde{' '}
        <Link to={paths.monitor}>Seguimiento</Link>. Una emergencia no es una entrega fallida: lo
        entregado se conserva y cada producto pendiente se recupera por separado.
      </p>
      <div className="page-stack">
        {message && (
          <Alert variant={message.kind === 'success' ? 'success' : 'error'}>{message.text}</Alert>
        )}
        <div className="planning-routes__header">
          <span />
          <Button variant="secondary" onClick={board.reload}>
            Actualizar
          </Button>
        </div>
        <AsyncContent {...board} onRetry={board.reload} loadingText="Cargando emergencias...">
          {(views) =>
            views.length === 0 ? (
              <p className="empty-state">No hay emergencias registradas.</p>
            ) : (
              views.map((view) => (
                <EmergencyCard key={view.emergency.id} view={view} run={run} busy={busy} />
              ))
            )
          }
        </AsyncContent>
      </div>
    </main>
  )
}
