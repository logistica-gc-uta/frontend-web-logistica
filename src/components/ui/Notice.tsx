import type { ReactNode } from 'react'

/** Tono del aviso: `info` (contexto), `success` (algo está bien), `warning` (atención), `danger` (bloquea). */
export type NoticeTone = 'info' | 'success' | 'warning' | 'danger'

interface NoticeProps {
  tone?: NoticeTone
  /**
   * `note` para información que acompaña a la pantalla; `status` si cambia sola y debe anunciarse;
   * `alert` solo si impide continuar (un error de una acción va en `Alert`, no aquí); `null` para
   * un aviso dentro de un grupo de notas que ya se anuncia como tal.
   */
  role?: 'note' | 'status' | 'alert' | null
  /** Clases del contexto (por ejemplo, la cuadrícula de avisos de Urgencias). */
  className?: string
  children: ReactNode
}

/**
 * Aviso que se queda en la pantalla: explica una situación (vista previa, ruta cancelada, motor
 * vial caído…) y puede llevar enlaces o un botón. No se usa para errores de una acción (`Alert`) ni
 * para confirmar lo que salió bien (`Alert variant="success"`, la notificación que se va sola).
 */
export function Notice({ tone = 'info', role = 'note', className, children }: NoticeProps) {
  const classes = ['notice', tone === 'info' ? null : `notice--${tone}`, className]
    .filter(Boolean)
    .join(' ')
  return (
    <div role={role ?? undefined} className={classes}>
      {children}
    </div>
  )
}
