import { useState } from 'react'
import { Button } from '../../components/ui/Button'

interface TemporaryPasswordProps {
  driverName: string
  email: string
  password: string
  onDone: () => void
}

/**
 * Contraseña temporal del repartidor recién creado. El backend la devuelve UNA sola vez y no se
 * puede recuperar: se muestra aquí hasta que el ADMIN confirma que la entregó, sin guardarla.
 */
export function TemporaryPassword({ driverName, email, password, onDone }: TemporaryPasswordProps) {
  const [copied, setCopied] = useState<'ok' | 'failed' | null>(null)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password)
      setCopied('ok')
    } catch {
      setCopied('failed')
    }
  }

  return (
    <section className="temporary-password" aria-labelledby="temporary-password-title">
      <h3 id="temporary-password-title">Acceso de {driverName}</h3>
      <p>
        Correo: <strong>{email}</strong>
      </p>
      <p>
        Contraseña temporal: <code className="temporary-password__value">{password}</code>
      </p>
      <p className="temporary-password__warning" role="note">
        No se puede volver a ver ni recuperar: entrégala ahora en persona. Por ahora no hay forma de
        cambiarla desde el sistema.
      </p>
      <div className="temporary-password__actions">
        <Button variant="secondary" onClick={() => void copy()}>
          Copiar contraseña
        </Button>
        <Button onClick={onDone}>Ya la entregué</Button>
        {copied === 'ok' && <span role="status">Copiada.</span>}
        {copied === 'failed' && <span role="status">No se pudo copiar: anótala a mano.</span>}
      </div>
    </section>
  )
}
