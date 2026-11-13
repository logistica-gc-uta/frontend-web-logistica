import { useState } from 'react'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { dispatchService } from '../dispatch/dispatchService'
import { describeEmergencyError } from './emergencyErrors'

const REASON_MAX_LENGTH = 500

/**
 * Declarar una emergencia en una ruta en curso (backend #51). Pide motivo y confirmación: la ruta
 * queda interrumpida, lo entregado se conserva y los pendientes pasan a custodia.
 */
export function DeclareEmergency({
  routeId,
  name,
  onDeclared,
}: {
  routeId: string
  name: string
  /** Se llama tras la respuesta del servidor (con éxito o no) para volver a leer el estado. */
  onDeclared: () => void
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Declarar emergencia
      </Button>
    )
  }

  const confirm = async () => {
    if (reason.trim() === '') {
      setError('Escribe qué pasó')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await dispatchService.declareEmergency(routeId, reason.trim())
      setOpen(false)
      setReason('')
    } catch (failure) {
      setError(describeEmergencyError(failure, 'No se pudo declarar la emergencia'))
    } finally {
      setSaving(false)
      onDeclared()
    }
  }

  return (
    <fieldset className="emergency-declare" disabled={saving}>
      <legend>Declarar emergencia en {name}</legend>
      <p>
        La ruta se detiene. Lo entregado y las visitas fallidas se conservan; los pedidos pendientes
        salen de la ruta y sus productos quedan en custodia hasta confirmar que volvieron. No
        cancela pedidos ni libera al repartidor.
      </p>
      <TextField
        label={`Qué pasó en ${name}`}
        value={reason}
        maxLength={REASON_MAX_LENGTH}
        onChange={(event) => setReason(event.target.value)}
      />
      {error && <Alert>{error}</Alert>}
      <div className="emergency-declare__buttons">
        <Button isLoading={saving} loadingText="Declarando..." onClick={() => void confirm()}>
          Confirmar emergencia
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </fieldset>
  )
}
