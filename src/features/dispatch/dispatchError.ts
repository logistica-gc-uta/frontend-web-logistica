import { describeActionError } from '../../lib/http/describeActionError'

/** Explica por qué no se registró una decisión sobre una urgencia (nunca se presenta como éxito). */
export const describeDispatchError = (error: unknown): string =>
  describeActionError(error, {
    fallback: 'No se pudo registrar la decisión',
    forbidden: 'No tienes permisos para despachar urgencias.',
    conflictHint:
      'La propuesta, la ruta o el chofer cambiaron: actualiza las propuestas y vuelve a intentarlo.',
  })
