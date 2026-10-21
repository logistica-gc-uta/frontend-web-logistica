import { useState } from 'react'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { SelectField } from '../../components/ui/SelectField'
import { TextField } from '../../components/ui/TextField'
import type { KeyedActionState } from '../../hooks/useKeyedActions'
import { DRIVER_UNAVAILABLE_LABELS } from './routeLabels'
import type { Driver } from './types'

/** El backend audita el motivo y admite hasta 500 caracteres. */
const REASON_MAX_LENGTH = 500

interface DriverPickerProps {
  /** Etiqueta del selector; debe distinguirse de la de otras rutas. */
  label: string
  submitLabel: string
  loadingText: string
  drivers: Driver[]
  /** Chofer actual de la ruta: no se ofrece para "cambiar" a él mismo. */
  currentDriverId?: string | null
  /** Pide un motivo (por ejemplo, para cambiar el chofer de una ruta ya asignada). */
  reasonLabel?: string
  state: KeyedActionState | undefined
  onSubmit: (driverId: string, reason: string) => void
}

/**
 * Selector de chofer. Solo se pueden elegir los choferes **efectivamente disponibles**; los demás
 * se muestran deshabilitados con el motivo (por ejemplo, ocupados hasta regresar al depósito).
 */
export function DriverPicker({
  label,
  submitLabel,
  loadingText,
  drivers,
  currentDriverId = null,
  reasonLabel,
  state,
  onSubmit,
}: DriverPickerProps) {
  const [driverId, setDriverId] = useState('')
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | undefined>()
  const candidates = drivers.filter((driver) => driver.id !== currentDriverId)

  if (!candidates.some((driver) => driver.isAvailable)) {
    return <p className="text-muted">No hay choferes disponibles en este momento.</p>
  }

  const submit = () => {
    const trimmed = reason.trim()
    if (reasonLabel && trimmed === '') {
      setReasonError('Escribe el motivo')
      return
    }
    onSubmit(driverId, trimmed)
  }

  return (
    <div className="saved-route__assign">
      <SelectField
        label={label}
        value={driverId}
        onChange={(event) => setDriverId(event.target.value)}
      >
        <option value="">Selecciona un chofer disponible</option>
        {candidates.map((driver) => (
          <option key={driver.id} value={driver.id} disabled={!driver.isAvailable}>
            {driver.unavailableReason
              ? `${driver.name} · ${DRIVER_UNAVAILABLE_LABELS[driver.unavailableReason]}`
              : `${driver.name} · ${driver.vehicle}`}
          </option>
        ))}
      </SelectField>
      {reasonLabel && (
        <TextField
          label={reasonLabel}
          value={reason}
          maxLength={REASON_MAX_LENGTH}
          error={reasonError}
          onChange={(event) => {
            setReason(event.target.value)
            setReasonError(undefined)
          }}
        />
      )}
      <Button
        disabled={driverId === ''}
        isLoading={state?.status === 'saving'}
        loadingText={loadingText}
        onClick={submit}
      >
        {submitLabel}
      </Button>
      {state?.status === 'failed' && <Alert>{state.error}</Alert>}
    </div>
  )
}
