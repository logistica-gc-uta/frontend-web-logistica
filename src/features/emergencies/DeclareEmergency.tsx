import { useState } from 'react'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Drawer } from '../../components/ui/Drawer'
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
  open,
  onClose,
  onDeclared,
}: {
  routeId: string
  name: string
  /** El botón que lo abre vive en la cabecera de la tarjeta de la ruta. */
  open: boolean
  onClose: () => void
  /** Se llama tras la respuesta del servidor (con éxito o no) para volver a leer el estado. */
  onDeclared: () => void
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const confirm = async () => {
    if (reason.trim() === '') {
      setError('Escribe qué pasó')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await dispatchService.declareEmergency(routeId, reason.trim())
      onClose()
      setReason('')
    } catch (failure) {
      setError(describeEmergencyError(failure, 'No se pudo declarar la emergencia'))
    } finally {
      setSaving(false)
      onDeclared()
    }
  }

  return (
    <Drawer
      open={open}
      onClose={() => {
        if (!saving) onClose()
      }}
      title="Declarar emergencia"
      titleId={`emergency-title-${routeId}`}
      className="drawer__panel--form"
    >
      <div className="emergency-declare" role="group" aria-label={`Declarar emergencia en ${name}`}>
        <p className="emergency-declare__route">{name}</p>
        <ul className="emergency-declare__effects">
          <li>La ruta se detiene.</li>
          <li>Lo entregado y las visitas fallidas se conservan.</li>
          <li>
            Los pedidos pendientes salen de la ruta y sus productos quedan en custodia hasta
            confirmar que volvieron.
          </li>
          <li>No cancela pedidos ni libera al repartidor.</li>
        </ul>
        <TextField
          label={`Qué pasó en ${name}`}
          placeholder="Ej.: choque leve en la vía"
          value={reason}
          maxLength={REASON_MAX_LENGTH}
          disabled={saving}
          onChange={(event) => setReason(event.target.value)}
        />
        {error && <Alert>{error}</Alert>}
        <div className="emergency-declare__buttons">
          <Button isLoading={saving} loadingText="Declarando..." onClick={() => void confirm()}>
            Confirmar emergencia
          </Button>
          <Button variant="secondary" disabled={saving} onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </div>
    </Drawer>
  )
}
