import { describeActionError } from '../../lib/http/describeActionError'

/** Explica por qué no se registró una gestión de entrega fallida (nunca se presenta como éxito). */
export const describeIncidentError = (error: unknown): string =>
  describeActionError(error, {
    fallback: 'No se pudo registrar la gestión',
    forbidden: 'No tienes permisos para gestionar entregas fallidas.',
    conflictHint:
      'El intento, la ruta o el acuerdo cambiaron (por ejemplo, otra persona ya lo gestionó): actualiza la bandeja.',
  })
