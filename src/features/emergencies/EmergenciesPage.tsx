import { useCallback, useEffect, useId, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { monitorRoutePath, orderReceiptPath, paths } from '../../app/paths'
import { Alert } from '../../components/ui/Alert'
import { AsyncContent } from '../../components/ui/AsyncContent'
import { StepNav } from '../../components/ui/StepNav'
import { Button } from '../../components/ui/Button'
import { Drawer } from '../../components/ui/Drawer'
import { Notice } from '../../components/ui/Notice'
import { TextField } from '../../components/ui/TextField'
import { useFetch } from '../../hooks/useFetch'
import { useRealtimeUpdates } from '../../hooks/useRealtimeUpdates'
import { formatDateTime } from '../../lib/format/formatDateTime'
import { dispatchService } from '../dispatch/dispatchService'
import { ConnectionStatus } from '../monitor/ConnectionStatus'
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

/** Botón que pide un motivo, en un panel lateral, antes de confirmar una acción auditada. */
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
  const titleId = useId()
  const close = useCallback(() => setOpen(false), [])

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
    <>
      <Button variant="secondary" disabled={busy} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Drawer
        open={open}
        onClose={close}
        title={label}
        titleId={titleId}
        className="drawer__panel--form"
      >
        <div className="emergency__reason">
          <TextField
            label={fieldLabel}
            placeholder="Escribe un motivo breve"
            value={reason}
            maxLength={REASON_MAX_LENGTH}
            error={error ?? undefined}
            disabled={busy}
            onChange={(event) => setReason(event.target.value)}
          />
          <div className="emergency__buttons">
            <Button isLoading={busy} loadingText="Guardando..." onClick={() => void confirm()}>
              {confirmLabel}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={close}>
              Cancelar
            </Button>
          </div>
        </div>
      </Drawer>
    </>
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
      <div className="emergency__unit-head">
        <strong>{label}</strong>
        {unit.status === 'PENDING' ? (
          // Si no aparece, la pérdida se declara en el comprobante de este pedido.
          <Link
            className="emergency__lost"
            to={`${orderReceiptPath(unit.orderId)}#perdidas`}
            aria-label="No aparece: declarar pérdida"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3M9 9l4 4M13 9l-4 4" />
            </svg>
            Declarar pérdida
          </Link>
        ) : (
          <span className={`badge ${status.tone}`}>{status.text}</span>
        )}
      </div>
      {unit.recoveredAt && (
        <p className="text-muted">Confirmada el {formatDateTime(unit.recoveredAt)}</p>
      )}
      {unit.status === 'PENDING' && (
        <div className="emergency__buttons">
          <ReasonAction
            label="Confirmar retorno del producto"
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
      <div className="emergency__order-head">
        <h4>{title}</h4>
        <Link to={orderReceiptPath(entry.orderId)} aria-label={`Ver pedido ${title}`}>
          Ver pedido
        </Link>
        {entry.units.some((unit) => unit.status === 'PENDING') && (
          <span className={`badge ${UNIT_STATUS.PENDING.tone}`}>{UNIT_STATUS.PENDING.text}</span>
        )}
      </div>
      <ul className="emergency__units">
        {entry.units.map((unit) => (
          <UnitRow key={unit.id} unit={unit} productName={productOf(unit)} run={run} busy={busy} />
        ))}
      </ul>
      {!entry.resolved ? (
        <p className="text-muted">
          Sigue bloqueado hasta que todas sus unidades vuelvan o tengan un reemplazo preparado.
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
  // Los pedidos en custodia se ven de uno en uno; al resolverse uno, el mismo lugar muestra el siguiente.
  const [selected, setSelected] = useState(0)
  const position = Math.min(selected, Math.max(view.orders.length - 1, 0))

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
      <p className="emergency__why">
        <span>
          <strong>Motivo:</strong> {emergency.reason}
        </span>
        <span className="emergency__declared">
          <strong>Declarada</strong> el {formatDateTime(emergency.declaredAt)}
        </span>
        <Link to={monitorRoutePath(emergency.routeId)}>Ver la ruta en Seguimiento</Link>
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

      <div className="emergency__body">
        <div className="emergency__col">
          <section aria-label={`Lo que ya pasó en ${name}`}>
            <h4>Lo que ya pasó en la ruta</h4>
            {resolvedStops.length === 0 ? (
              <p className="text-muted">Ninguna parada se había resuelto antes de la emergencia.</p>
            ) : (
              <ul className="emergency__stops">
                {resolvedStops.map((stop) => (
                  <li key={stop.id}>
                    {stop.deliveryAddress} ·{' '}
                    <strong>
                      {stop.outcome === 'SUCCESSFUL' ? 'Entregado' : 'Visita fallida'}
                    </strong>
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
                  Su retorno todavía no está confirmado. Recuperar productos o cerrar la emergencia
                  no lo libera: confírmalo aparte cuando vuelva.
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
        </div>

        <div className="emergency__col">
          <section aria-label={`Productos en custodia de ${name}`}>
            <h4>Productos en custodia</h4>
            {view.orders.length === 0 ? (
              <p className="text-muted">
                No quedaban productos pendientes al declarar la emergencia.
              </p>
            ) : (
              <>
                <StepNav
                  noun="Pedido"
                  label={`Pedidos en custodia de ${name}`}
                  position={position}
                  total={view.orders.length}
                  onChange={setSelected}
                />
                <OrderBlock
                  key={view.orders[position].orderId}
                  entry={view.orders[position]}
                  run={run}
                  busy={busy}
                />
              </>
            )}
          </section>
        </div>
      </div>

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
        <Notice tone="warning">
          <strong>Cerrada con pendientes:</strong> quedan{' '}
          {counts.pendingUnits + counts.lostPendingUnits} unidades sin recuperar o sin reemplazo.
        </Notice>
      )}
    </article>
  )
}

/** El tablero y la hora de esta consulta, para mostrar la última actualización. */
const loadBoard = async () => ({
  views: await loadEmergencies(),
  loadedAt: new Date().toISOString(),
})

/**
 * ADMIN · Emergencias en ruta (backend #51): lo entregado se conserva, cada unidad pendiente se
 * recupera por separado, el retorno del repartidor y el cierre son acciones aparte, y un pedido solo
 * vuelve a planificarse cuando el ADMIN lo decide con todas sus unidades resueltas.
 */
export function EmergenciesPage() {
  const board = useFetch(loadBoard, 'No se pudieron cargar las emergencias')
  // En vivo: cada aviso del servidor sobre las rutas y pedidos de las emergencias vuelve a leer el tablero.
  const realtime = useRealtimeUpdates({
    subscriptions: [
      { resource: 'incidents' as const },
      ...(board.data?.views ?? []).flatMap(({ emergency, orders }) => [
        { resource: 'route' as const, id: emergency.routeId },
        ...orders.map(({ orderId }) => ({ resource: 'order' as const, id: orderId })),
      ]),
    ],
    onInvalidate: board.reload,
  })
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState(0)
  // La emergencia a la vista se recuerda por su ruta (id estable): sigue siendo la misma aunque el
  // tablero se recargue o cambie de orden (#67).
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const linkedRouteId = searchParams.get('ruta')
  const clearLink = useCallback(
    () =>
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current)
          next.delete('ruta')
          return next
        },
        { replace: true },
      ),
    [setSearchParams],
  )

  // Un enlace `?ruta=` (desde Seguimiento o Entregas fallidas) selecciona su emergencia; una vez
  // encontrada pasa a ser la selección normal.
  const views = board.data?.views
  useEffect(() => {
    if (!linkedRouteId || !views) return
    const index = views.findIndex(({ emergency }) => emergency.routeId === linkedRouteId)
    if (index < 0) return
    setSelected(index)
    setSelectedRouteId(linkedRouteId)
    clearLink()
  }, [linkedRouteId, views, clearLink])

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
    <main className="page page--wide">
      <header className="planning-page__head">
        <div>
          <h1>Emergencias</h1>
          <p className="text-muted">
            Rutas interrumpidas. Se declaran desde <Link to={paths.monitor}>Seguimiento</Link>.
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
        {message && (
          <Alert variant={message.kind === 'success' ? 'success' : 'error'}>{message.text}</Alert>
        )}
        <AsyncContent {...board} onRetry={board.reload} loadingText="Cargando emergencias...">
          {({ views }) => {
            const missingLink =
              linkedRouteId !== null &&
              !views.some(({ emergency }) => emergency.routeId === linkedRouteId) ? (
                <Notice tone="warning">
                  Esa ruta no tiene una emergencia registrada o la ruta ya no existe.{' '}
                  <Link to={monitorRoutePath(linkedRouteId)}>Ver la ruta en Seguimiento</Link>{' '}
                  <Button variant="secondary" onClick={clearLink}>
                    Ver todas las emergencias
                  </Button>
                </Notice>
              ) : null
            if (views.length === 0) {
              return (
                <>
                  {missingLink}
                  <p className="empty-state">No hay emergencias registradas.</p>
                </>
              )
            }
            // Una emergencia por pantalla, con «Emergencia 2 de 5» y las flechas.
            const byId = selectedRouteId
              ? views.findIndex(({ emergency }) => emergency.routeId === selectedRouteId)
              : -1
            const position = byId >= 0 ? byId : Math.min(selected, views.length - 1)
            const view = views[position]
            return (
              <>
                {missingLink}
                <StepNav
                  noun="Emergencia"
                  label="Emergencias"
                  position={position}
                  total={views.length}
                  onChange={(next) => {
                    setSelected(next)
                    setSelectedRouteId(views[next]?.emergency.routeId ?? null)
                  }}
                />
                <EmergencyCard key={view.emergency.id} view={view} run={run} busy={busy} />
              </>
            )
          }}
        </AsyncContent>
      </div>
    </main>
  )
}
