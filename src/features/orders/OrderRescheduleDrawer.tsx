import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Drawer } from '../../components/ui/Drawer'
import { TextField } from '../../components/ui/TextField'
import { formatDateTime } from '../../lib/format/formatDateTime'
import { localDateTimeToIso, todayInGuayaquil } from '../../lib/time/guayaquil'
import { describeDispatchError } from '../dispatch/dispatchError'
import { dispatchService } from '../dispatch/dispatchService'
import type { DeliverySchedule } from '../shop/types'
import { DEFAULT_DELIVERY_SCHEDULE, timeSlotOptions } from './orderInput'
import { SelectMenu } from './SelectMenu'
import type { Order } from './types'

const REASON_MAX_LENGTH = 500

export function canReschedulePendingOrder(order: Order): boolean {
  return (
    order.status === 'PENDING' &&
    order.routeId === null &&
    !order.pickup &&
    !order.requiresAdministrativeReview
  )
}

export function isOverduePendingOrder(order: Order, nowMs: number = Date.now()): boolean {
  if (!canReschedulePendingOrder(order) || !order.scheduledDeliveryDate) {
    return false
  }
  const scheduledMs = Date.parse(order.scheduledDeliveryDate)
  return Number.isFinite(scheduledMs) && scheduledMs < nowMs
}

interface OrderRescheduleDrawerProps {
  order: Order | null
  schedule?: DeliverySchedule
  onClose: () => void
  onRescheduled: (order: Order) => void
}

/**
 * Permite reprogramar un pedido pendiente sin ruta asignada (por ejemplo, con fecha vencida).
 * Registra primero el acuerdo de contacto (`CONTACT`) y luego reprograma (`RESCHEDULE`) sin
 * crear un nuevo pedido ni modificar el comprobante.
 */
export function OrderRescheduleDrawer({
  order,
  schedule = DEFAULT_DELIVERY_SCHEDULE,
  onClose,
  onRescheduled,
}: OrderRescheduleDrawerProps) {
  const windowOptions = useMemo(() => timeSlotOptions(schedule), [schedule])
  const [day, setDay] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Solo horas futuras si el día elegido es hoy, y siempre dejando al menos un bloque posterior para «Hasta».
  const fromOptions = useMemo(() => {
    const candidates = windowOptions.slice(0, -1)
    if (!day) return candidates
    const nowMs = Date.now()
    return candidates.filter((option) => {
      const iso = localDateTimeToIso(`${day}T${option.value}`)
      return iso !== null && Date.parse(iso) > nowMs
    })
  }, [windowOptions, day])

  // «Hasta» solo permite horas estrictamente posteriores a «Desde».
  const toOptions = useMemo(() => {
    if (!from) return []
    return windowOptions.filter((option) => option.value > from)
  }, [windowOptions, from])

  useEffect(() => {
    setDay('')
    setFrom('')
    setTo('')
    setReason('')
    setErrors({})
    setSubmitError(null)
    setIsSaving(false)
  }, [order?.id])

  const handleDayChange = (nextDay: string) => {
    setDay(nextDay)
    if (from) {
      const iso = localDateTimeToIso(`${nextDay}T${from}`)
      if (!iso || Date.parse(iso) <= Date.now()) {
        setFrom('')
        setTo('')
      }
    }
    setErrors((prev) => ({ ...prev, window: '' }))
  }

  const handleFromChange = (nextFrom: string) => {
    setFrom(nextFrom)
    if (to && to <= nextFrom) {
      setTo('')
    }
    setErrors((prev) => ({ ...prev, window: '' }))
  }

  const recipient = order?.recipientName ?? order?.user?.name ?? 'Sin nombre'
  const overdue = order ? isOverduePendingOrder(order) : false

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!order || isSaving) return

    const found: Record<string, string> = {}
    const trimmed = reason.trim()
    if (trimmed === '') {
      found.reason = 'Escribe un motivo breve del acuerdo con el cliente'
    } else if (trimmed.length > REASON_MAX_LENGTH) {
      found.reason = `El motivo no puede superar ${REASON_MAX_LENGTH} caracteres`
    }

    const start = localDateTimeToIso(`${day}T${from}`)
    const end = localDateTimeToIso(`${day}T${to}`)
    if (!start || !end) {
      found.window = 'Indica el día y la franja horaria acordados'
    } else if (end <= start) {
      found.window = 'La hora final debe ser posterior a la inicial'
    } else if (Date.parse(start) <= Date.now()) {
      found.window = 'La franja acordada debe ser futura'
    }

    setErrors(found)
    setSubmitError(null)
    if (Object.keys(found).length > 0 || !start || !end) return

    setIsSaving(true)
    try {
      await dispatchService.reschedule({
        orderId: order.id,
        scheduledDeliveryDate: start,
        deliveryWindowStart: start,
        deliveryWindowEnd: end,
        reason: trimmed,
      })
      onRescheduled(order)
    } catch (error) {
      setSubmitError(describeDispatchError(error))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Drawer
      open={order !== null}
      onClose={isSaving ? () => {} : onClose}
      title="Reprogramar pedido"
      titleId="order-reschedule-title"
      className="drawer__panel--narrow"
    >
      {order && (
        <form className="order-reschedule" onSubmit={handleSubmit} noValidate>
          <div className="order-reschedule__summary">
            <p className="order-reschedule__recipient">
              <strong>{recipient}</strong>
              {overdue && <span className="badge badge--warning">Vencido</span>}
            </p>
            <p className="text-muted">{order.deliveryAddress}</p>
            <p className="text-muted">
              Entrega actual: {formatDateTime(order.scheduledDeliveryDate)}
            </p>
          </div>

          <p className="text-muted">
            Acuerda la nueva fecha y franja horaria con el cliente antes de guardar. El pedido
            conservará su comprobante e historial y quedará listo para planificar.
          </p>

          {submitError && <Alert>{submitError}</Alert>}

          <fieldset className="order-reschedule__fields" disabled={isSaving}>
            <legend className="visually-hidden">Nueva fecha y franja acordadas</legend>

            <div className="order-reschedule__window">
              <TextField
                label="Día acordado"
                type="date"
                min={todayInGuayaquil()}
                value={day}
                onChange={(event) => handleDayChange(event.target.value)}
              />
              <SelectMenu
                id={`reschedule-from-${order.id}`}
                label="Desde"
                value={from}
                placeholder={
                  day && fromOptions.length === 0 ? 'Sin horarios hoy' : 'Elige la hora'
                }
                options={fromOptions}
                onChange={handleFromChange}
              />
              <SelectMenu
                id={`reschedule-to-${order.id}`}
                label="Hasta"
                value={to}
                placeholder={from ? 'Elige la hora' : 'Elige «Desde»'}
                options={toOptions}
                error={errors.window || undefined}
                errorId={`reschedule-to-${order.id}-error`}
                onChange={(value) => {
                  setTo(value)
                  setErrors((prev) => ({ ...prev, window: '' }))
                }}
              />
              {errors.window && (
                <p
                  id={`reschedule-to-${order.id}-error`}
                  className="field__error order-reschedule__window-error"
                >
                  {errors.window}
                </p>
              )}
            </div>

            <TextField
              label="Acuerdo con el cliente"
              placeholder="Ej.: Se llamó al cliente y acordó entrega mañana en la mañana"
              value={reason}
              maxLength={REASON_MAX_LENGTH}
              error={errors.reason || undefined}
              onChange={(event) => {
                setReason(event.target.value)
                setErrors((prev) => ({ ...prev, reason: '' }))
              }}
            />

            <div className="order-reschedule__actions">
              <Button type="submit" isLoading={isSaving} loadingText="Reprogramando...">
                Guardar nueva fecha
              </Button>
              <Button type="button" variant="secondary" disabled={isSaving} onClick={onClose}>
                Cancelar
              </Button>
            </div>
          </fieldset>
        </form>
      )}
    </Drawer>
  )
}
