import { useState } from 'react'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { SelectField } from '../../components/ui/SelectField'
import { TextField } from '../../components/ui/TextField'
import type { RouteOrderSummary, SavedRouteDetail } from './types'
import type { RouteActionState } from './useRouteActions'

/** Otra ruta del mismo día y zona, sin iniciar y con lugar, que puede recibir un pedido. */
export interface MoveTarget {
  id: string
  name: string
}

/** El backend exige un motivo y lo guarda en la auditoría. */
const REASON_MAX_LENGTH = 500

interface RouteCorrectionProps {
  route: SavedRouteDetail
  /** Nombre visible de la ruta, para que los controles se distingan de los de otras rutas. */
  name: string
  targets: MoveTarget[]
  state: RouteActionState | undefined
  onReorder: (orderIds: string[], reason: string) => Promise<boolean>
  onMove: (orderId: string, targetRouteId: string, reason: string) => Promise<boolean>
  onClose: () => void
}

const sameOrder = (a: RouteOrderSummary[], b: RouteOrderSummary[]) =>
  a.length === b.length && a.every((order, index) => order.id === b[index].id)

/**
 * Corrección administrativa de una ruta todavía no iniciada (DRAFT o ASSIGNED): cambiar el orden
 * de visita o pasar un pedido a otra ruta del mismo día y zona. Cada cambio pide un motivo.
 */
export function RouteCorrection({
  route,
  name,
  targets,
  state,
  onReorder,
  onMove,
  onClose,
}: RouteCorrectionProps) {
  const [stops, setStops] = useState(route.orders)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | undefined>()
  const [orderToMove, setOrderToMove] = useState('')
  const [targetRouteId, setTargetRouteId] = useState('')

  const isSaving = state?.status === 'saving'
  const canMove = targets.length > 0 && route.orders.length > 1

  const shift = (index: number, delta: -1 | 1) =>
    setStops((current) => {
      const next = [...current]
      ;[next[index], next[index + delta]] = [next[index + delta], next[index]]
      return next
    })

  /** Devuelve el motivo listo para enviar, o `null` (y muestra el error) si falta. */
  const validReason = (): string | null => {
    const trimmed = reason.trim()
    if (trimmed === '') {
      setReasonError('Escribe el motivo de la corrección')
      return null
    }
    return trimmed
  }

  const saveOrder = async () => {
    const valid = validReason()
    if (valid === null) return
    if (
      await onReorder(
        stops.map((order) => order.id),
        valid,
      )
    )
      onClose()
  }

  const moveOrder = async () => {
    const valid = validReason()
    if (valid === null) return
    if (await onMove(orderToMove, targetRouteId, valid)) onClose()
  }

  return (
    <div className="route-correction" role="group" aria-label={`Corregir ${name}`}>
      <p className="text-muted">
        Cambia el orden de visita o pasa un pedido a otra ruta. Solo se permite antes de iniciar la
        ruta.
      </p>

      <ol className="route-correction__stops">
        {stops.map((order, index) => (
          <li key={order.id}>
            <span>{order.deliveryAddress}</span>
            <span className="route-correction__arrows">
              <button
                type="button"
                className="btn btn--secondary"
                aria-label={`Subir ${order.deliveryAddress}`}
                disabled={index === 0 || isSaving}
                onClick={() => shift(index, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="btn btn--secondary"
                aria-label={`Bajar ${order.deliveryAddress}`}
                disabled={index === stops.length - 1 || isSaving}
                onClick={() => shift(index, 1)}
              >
                ↓
              </button>
            </span>
          </li>
        ))}
      </ol>

      <TextField
        label={`Motivo de la corrección de ${name}`}
        value={reason}
        maxLength={REASON_MAX_LENGTH}
        error={reasonError}
        onChange={(event) => {
          setReason(event.target.value)
          setReasonError(undefined)
        }}
      />

      <div className="route-correction__actions">
        <Button
          disabled={sameOrder(stops, route.orders)}
          isLoading={isSaving}
          loadingText="Guardando..."
          onClick={saveOrder}
        >
          Guardar nuevo orden
        </Button>
        <Button variant="secondary" disabled={isSaving} onClick={onClose}>
          Cancelar
        </Button>
      </div>

      {canMove ? (
        <div className="route-correction__move">
          <SelectField
            label={`Pedido a mover de ${name}`}
            value={orderToMove}
            onChange={(event) => setOrderToMove(event.target.value)}
          >
            <option value="">Selecciona un pedido</option>
            {route.orders.map((order) => (
              <option key={order.id} value={order.id}>
                {order.deliveryAddress}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={`Ruta destino para ${name}`}
            value={targetRouteId}
            onChange={(event) => setTargetRouteId(event.target.value)}
          >
            <option value="">Selecciona la ruta destino</option>
            {targets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.name}
              </option>
            ))}
          </SelectField>
          <Button
            variant="secondary"
            disabled={orderToMove === '' || targetRouteId === '' || isSaving}
            onClick={moveOrder}
          >
            Mover pedido
          </Button>
        </div>
      ) : (
        <p className="text-muted">
          {route.orders.length > 1
            ? 'No hay otra ruta del mismo día y zona, sin iniciar y con lugar, que pueda recibir un pedido.'
            : 'Una ruta con una sola parada no puede quedar vacía: no se puede mover su pedido.'}
        </p>
      )}

      {state?.status === 'failed' && <Alert>{state.error}</Alert>}
    </div>
  )
}
