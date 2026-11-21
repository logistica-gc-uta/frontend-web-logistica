import { useId } from 'react'
import { todayInGuayaquil } from '../../lib/time/guayaquil'
import type { DeliverySchedule } from '../shop/types'
import { SelectMenu } from './SelectMenu'
import { formatTimeLabel, joinScheduledAt, splitScheduledAt, timeSlotOptions } from './orderInput'

interface DeliveryDateTimeProps {
  /** Valor `AAAA-MM-DDTHH:mm`, vacío mientras no se elija nada. */
  value: string
  schedule: DeliverySchedule
  onChange: (value: string) => void
  error?: string
}

/**
 * Día y hora de entrega: un calendario para el día y una lista de horas (cada 30 minutos, dentro
 * del horario de la tienda) escritas con a. m./p. m., así no se puede elegir una hora fuera de horario.
 */
export function DeliveryDateTime({ value, schedule, onChange, error }: DeliveryDateTimeProps) {
  const id = useId()
  const errorId = `${id}-error`
  const { date, time } = splitScheduledAt(value)
  const describedBy = error ? errorId : undefined

  return (
    <div className="delivery-datetime">
      <div className="field">
        <label htmlFor={`${id}-date`} className="field__label">
          Fecha de entrega
        </label>
        <input
          id={`${id}-date`}
          className="field__input"
          type="date"
          min={todayInGuayaquil()}
          value={date}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange(joinScheduledAt(event.target.value, time))}
          onClick={(event) => {
            // Abre el calendario al tocar cualquier parte del campo, no solo el icono.
            try {
              event.currentTarget.showPicker()
            } catch {
              // Navegador sin showPicker o sin gesto de usuario: queda el campo editable.
            }
          }}
        />
      </div>
      <SelectMenu
        id={`${id}-time`}
        label="Hora de entrega"
        value={time}
        placeholder="Elige la hora"
        options={timeSlotOptions(schedule)}
        onChange={(chosen) => onChange(joinScheduledAt(date, chosen))}
        error={error}
        errorId={errorId}
      />
      <p className="delivery-datetime__hint text-muted">
        Entregas de {formatTimeLabel(schedule.startTime)} a {formatTimeLabel(schedule.endTime)},
        hora de Ecuador. Es una hora aproximada.
      </p>
      {error && (
        <p id={errorId} className="field__error delivery-datetime__error">
          {error}
        </p>
      )}
    </div>
  )
}
