import { useCallback, useState } from 'react'
import { Link } from 'react-router'
import { paths } from '../../app/paths'
import { Alert } from '../../components/ui/Alert'
import { AsyncContent } from '../../components/ui/AsyncContent'
import { Button } from '../../components/ui/Button'
import { SelectField } from '../../components/ui/SelectField'
import { TextField } from '../../components/ui/TextField'
import { useFetch } from '../../hooks/useFetch'
import { formatDateTime } from '../../lib/format/formatDateTime'
import { dispatchService } from '../dispatch/dispatchService'
import { ordersService } from '../orders/ordersService'
import type { Order, OrderItem } from '../orders/types'
import { describeLossError } from './lossErrors'
import type { OrderItemLoss, RecoveryCondition, StockMovement } from './types'

const REASON_MAX_LENGTH = 500

interface LossesData {
  order: Order
  losses: OrderItemLoss[]
}

const MOVEMENT_LABELS: Record<StockMovement['kind'], string> = {
  REPLACEMENT_OUT: 'Salida por reemplazo',
  RECOVERY_IN: 'Ingreso por original recuperado',
  REPLACEMENT_CANCEL_IN: 'Devolución al anular la pérdida',
}

const replacementText = (loss: OrderItemLoss) =>
  loss.replacement.state === 'PREPARED'
    ? `Preparado el ${formatDateTime(loss.replacement.preparedAt)}`
    : 'Pendiente: no había stock libre'

const originalText = (loss: OrderItemLoss) =>
  loss.original.state === 'LOST'
    ? 'Perdido: todavía no aparece'
    : `Recuperado ${loss.original.condition === 'SELLABLE' ? 'vendible' : 'dañado'} el ${formatDateTime(loss.original.recoveredAt)}`

type Action =
  | { kind: 'declare'; item: OrderItem }
  | { kind: 'prepare'; loss: OrderItemLoss }
  | { kind: 'recover'; loss: OrderItemLoss }
  | { kind: 'cancel'; loss: OrderItemLoss }

/**
 * Formulario de una acción con motivo. Mientras se guarda queda bloqueado: un doble clic no puede
 * descontar ni sumar dos veces (el backend además lo impide).
 */
function ActionForm({
  action,
  name,
  saving,
  onSubmit,
  onCancel,
}: {
  action: Action
  name: string
  saving: boolean
  onSubmit: (values: { unitNumber?: number; condition?: RecoveryCondition; reason: string }) => void
  onCancel: () => void
}) {
  const quantity = action.kind === 'declare' ? action.item.quantity : 1
  const [unit, setUnit] = useState(quantity === 1 ? '1' : '')
  const [condition, setCondition] = useState<RecoveryCondition | null>(null)
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const submit = () => {
    const found: Record<string, string> = {}
    if (action.kind === 'declare' && quantity > 1 && unit === '')
      found.unit = 'Elige qué unidad se perdió'
    if (action.kind === 'recover' && condition === null) {
      found.condition = 'Indica cómo está el original tras revisarlo'
    }
    if (reason.trim() === '') found.reason = 'Escribe un motivo breve'
    setErrors(found)
    if (Object.keys(found).length > 0) return
    onSubmit({
      ...(action.kind === 'declare' && quantity > 1 && { unitNumber: Number(unit) }),
      ...(action.kind === 'recover' && condition && { condition }),
      reason: reason.trim(),
    })
  }

  const legend =
    action.kind === 'declare'
      ? `Declarar pérdida de ${name}`
      : action.kind === 'prepare'
        ? `Preparar reemplazo de ${name}`
        : action.kind === 'cancel'
          ? `Anular pérdida de ${name}`
          : `Recuperación del original de ${name}`

  return (
    <fieldset className="losses__form" disabled={saving}>
      <legend>{legend}</legend>
      {action.kind === 'declare' && quantity > 1 && (
        <SelectField
          label="Unidad perdida"
          value={unit}
          error={errors.unit}
          onChange={(event) => setUnit(event.target.value)}
        >
          <option value="">Elige la unidad</option>
          {Array.from({ length: quantity }, (_, index) => (
            <option key={index + 1} value={index + 1}>
              Unidad {index + 1} de {quantity}
            </option>
          ))}
        </SelectField>
      )}
      {action.kind === 'declare' && (
        <p className="text-muted">
          Si hay stock libre se descuenta una unidad para el reemplazo; si no, el reemplazo queda
          pendiente. No se cobra de nuevo ni se crea otro comprobante.
        </p>
      )}
      {action.kind === 'recover' && (
        <div className="losses__choices" role="radiogroup" aria-label="Estado del original">
          <label>
            <input
              type="radio"
              name={`condition-${action.loss.id}`}
              checked={condition === 'SELLABLE'}
              onChange={() => setCondition('SELLABLE')}
            />
            Vendible: vuelve al stock
          </label>
          <label>
            <input
              type="radio"
              name={`condition-${action.loss.id}`}
              checked={condition === 'DAMAGED'}
              onChange={() => setCondition('DAMAGED')}
            />
            Dañado: no vuelve al stock
          </label>
          {errors.condition && <span className="field__error">{errors.condition}</span>}
        </div>
      )}
      <TextField
        label={`Motivo: ${legend.toLowerCase()}`}
        value={reason}
        maxLength={REASON_MAX_LENGTH}
        error={errors.reason}
        onChange={(event) => setReason(event.target.value)}
      />
      <div className="losses__buttons">
        <Button isLoading={saving} loadingText="Guardando..." onClick={submit}>
          Confirmar
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </fieldset>
  )
}

/**
 * ADMIN · Pérdidas de unidades de un pedido, su reemplazo y la recuperación del original
 * (backend #52). Todo lo que se muestra viene del servidor: la web nunca suma ni resta stock.
 */
export function LossesPanel({ orderId, attemptId }: { orderId: string; attemptId?: string }) {
  const load = useCallback(async (): Promise<LossesData> => {
    const [order, losses] = await Promise.all([
      ordersService.get(orderId),
      dispatchService.losses(orderId),
    ])
    return { order, losses }
  }, [orderId])
  const data = useFetch(load, 'No se pudieron cargar las pérdidas del pedido')
  const [action, setAction] = useState<Action | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const nameOf = (order: Order, itemId: string) =>
    order.items.find((item) => item.id === itemId)?.product.name ?? 'Producto'

  const run = async (perform: () => Promise<unknown>, done: string, fallback: string) => {
    setSaving(true)
    setMessage(null)
    try {
      await perform()
      setAction(null)
      setMessage({ kind: 'success', text: done })
    } catch (error) {
      setMessage({ kind: 'error', text: describeLossError(error, fallback) })
    } finally {
      setSaving(false)
      // Con éxito o sin él se vuelve a leer: el estado real lo decide el servidor.
      data.reload()
    }
  }

  return (
    <section className="card losses" id="perdidas" aria-labelledby="losses-title">
      <h2 id="losses-title">Pérdidas y reemplazos</h2>
      <p className="text-muted">
        Si una unidad se perdió o se dañó en el camino, decláralo aquí. El reemplazo y el original
        se siguen por separado. La entrega del reemplazo se coordina con el contacto y la
        reprogramación, o con el retiro en tienda, en{' '}
        <Link to={paths.failedDeliveries}>Entregas fallidas</Link>.
      </p>
      {message && (
        <Alert variant={message.kind === 'success' ? 'success' : 'error'}>{message.text}</Alert>
      )}
      <AsyncContent {...data} onRetry={data.reload} loadingText="Cargando pérdidas...">
        {({ order, losses }) => {
          const resolved = order.status === 'DELIVERED' || order.status === 'CANCELLED'
          return (
            <>
              <h3>Productos del pedido</h3>
              <ul className="losses__items" aria-label="Productos del pedido">
                {order.items.map((item) => {
                  const declared = losses.filter(
                    (loss) => loss.orderItemId === item.id && !loss.cancelledAt,
                  ).length
                  return (
                    <li key={item.id}>
                      <span>
                        <strong>{item.product.name}</strong> · {item.quantity}{' '}
                        {item.quantity === 1 ? 'unidad' : 'unidades'}
                        {declared > 0 && ` · ${declared} con pérdida declarada`}
                      </span>
                      {!resolved && declared < item.quantity && (
                        <Button
                          variant="secondary"
                          aria-label={`Declarar pérdida de ${item.product.name}`}
                          disabled={saving}
                          onClick={() => setAction({ kind: 'declare', item })}
                        >
                          Declarar pérdida
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
              {resolved && (
                <p className="text-muted">
                  El pedido ya está {order.status === 'DELIVERED' ? 'entregado' : 'cancelado'}: no
                  se declaran pérdidas nuevas.
                </p>
              )}

              {action?.kind === 'declare' && (
                <ActionForm
                  action={action}
                  name={action.item.product.name}
                  saving={saving}
                  onCancel={() => setAction(null)}
                  onSubmit={({ unitNumber, reason }) =>
                    void run(
                      () =>
                        dispatchService.declareLoss({
                          orderId,
                          orderItemId: action.item.id,
                          unitNumber,
                          attemptId,
                          reason,
                        }),
                      'Pérdida declarada. Revisa abajo si el reemplazo quedó preparado o pendiente.',
                      'No se pudo declarar la pérdida',
                    )
                  }
                />
              )}

              <h3>Pérdidas declaradas</h3>
              {losses.length === 0 ? (
                <p className="text-muted">Este pedido no tiene pérdidas declaradas.</p>
              ) : (
                <ul className="losses__list" aria-label="Pérdidas declaradas">
                  {losses.map((loss) => {
                    const name = `${nameOf(order, loss.orderItemId)} (unidad ${loss.unitNumber})`
                    return (
                      <li key={loss.id} aria-label={`Pérdida de ${name}`}>
                        <p>
                          <strong>{name}</strong> · declarada el {formatDateTime(loss.declaredAt)}
                        </p>
                        <dl className="losses__state">
                          <div>
                            <dt>Reemplazo</dt>
                            <dd>{replacementText(loss)}</dd>
                          </div>
                          <div>
                            <dt>Original</dt>
                            <dd>{originalText(loss)}</dd>
                          </div>
                        </dl>
                        {loss.movements.length > 0 && (
                          <ul
                            className="losses__movements"
                            aria-label={`Movimientos de stock de ${name}`}
                          >
                            {loss.movements.map((movement) => (
                              <li key={`${movement.kind}-${movement.createdAt}`}>
                                {MOVEMENT_LABELS[movement.kind]} ({movement.delta > 0 ? '+' : ''}
                                {movement.delta}) · stock después: {movement.stockAfter} ·{' '}
                                {formatDateTime(movement.createdAt)}
                              </li>
                            ))}
                          </ul>
                        )}
                        {loss.cancelledAt && (
                          <p className="badge" role="note">
                            Anulada el {formatDateTime(loss.cancelledAt)}
                            {loss.cancelReason ? ` · ${loss.cancelReason}` : ''}
                          </p>
                        )}
                        <div className="losses__buttons">
                          {!loss.cancelledAt && loss.original.state === 'LOST' && (
                            <Button
                              variant="secondary"
                              disabled={saving}
                              aria-label={`Anular pérdida de ${name}`}
                              onClick={() => setAction({ kind: 'cancel', loss })}
                            >
                              Anular pérdida
                            </Button>
                          )}
                          {!loss.cancelledAt && loss.replacement.state === 'PENDING' && (
                            <Button
                              variant="secondary"
                              disabled={saving}
                              aria-label={`Preparar reemplazo de ${name}`}
                              onClick={() => setAction({ kind: 'prepare', loss })}
                            >
                              Preparar reemplazo
                            </Button>
                          )}
                          {!loss.cancelledAt && loss.original.state === 'LOST' && (
                            <Button
                              variant="secondary"
                              disabled={saving}
                              aria-label={`Registrar recuperación del original de ${name}`}
                              onClick={() => setAction({ kind: 'recover', loss })}
                            >
                              Registrar recuperación del original
                            </Button>
                          )}
                        </div>
                        {action && action.kind !== 'declare' && action.loss.id === loss.id && (
                          <ActionForm
                            action={action}
                            name={name}
                            saving={saving}
                            onCancel={() => setAction(null)}
                            onSubmit={({ condition, reason }) =>
                              action.kind === 'prepare'
                                ? void run(
                                    () => dispatchService.prepareReplacement(loss.id, reason),
                                    'Reemplazo preparado: se descontó una unidad del stock.',
                                    'No se pudo preparar el reemplazo',
                                  )
                                : action.kind === 'cancel'
                                  ? void run(
                                      () => dispatchService.cancelLoss(loss.id, reason),
                                      loss.replacement.state === 'PREPARED'
                                        ? 'Pérdida anulada: la unidad del reemplazo volvió al stock.'
                                        : 'Pérdida anulada: no había reemplazo preparado, el stock no cambia.',
                                      'No se pudo anular la pérdida',
                                    )
                                  : void run(
                                      () =>
                                        dispatchService.recoverOriginal(
                                          loss.id,
                                          condition!,
                                          reason,
                                        ),
                                      condition === 'SELLABLE'
                                        ? 'Original recuperado vendible: volvió una unidad al stock.'
                                        : 'Original recuperado dañado: no se sumó al stock.',
                                      'No se pudo registrar la recuperación',
                                    )
                            }
                          />
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          )
        }}
      </AsyncContent>
    </section>
  )
}
