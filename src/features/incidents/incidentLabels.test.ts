import { AxiosError } from 'axios'
import { describe, expect, it } from 'vitest'
import { AppError } from '../../lib/errors/AppError'
import { createHttpError } from '../../test/http'
import {
  describeActionDisabledReason,
  describeIncidentMutationError,
  incidentStatusBadge,
} from './incidentLabels'

const conflict = (code: string, message = 'Raw internal English message') =>
  createHttpError(409, { data: { statusCode: 409, code, message, error: 'Conflict' } })

describe('incidentLabels · reasonCode en español', () => {
  it.each([
    ['INCIDENT_NOT_READY_AT_STORE', /disponible en tienda/i],
    ['INCIDENT_ALREADY_READY', /ya fue confirmada/i],
    ['RESCHEDULE_AGREEMENT_REQUIRED', /acordad/i],
    ['DELIVERY_COORDINATES_REQUIRED', /coordenadas/i],
    ['CLAIM_NOT_RELEASED', /retenido|ruta original/i],
    ['ORDER_CLAIMED_BY_ANOTHER_ROUTE', /otra ruta/i],
    ['RECOVERY_PENDING', /recuperaci[oó]n|Emergencias/i],
    ['EMERGENCY_CUSTODY_SEPARATE', /Emergencias/i],
    ['FAILED_ATTEMPT_NOT_FOUND', /intento fallido/i],
    ['INVALID_FAILED_ATTEMPT', /intento fallido/i],
    ['PICKUP_ALREADY_AGREED', /retiro en tienda acordado/i],
    ['PICKUP_NOT_AGREED', /no hay un retiro/i],
    ['PICKUP_ALREADY_CONFIRMED', /ya fue confirmado/i],
    ['ORDER_COMMERCIALLY_RESOLVED', /entregado o cancelado/i],
  ])('traduce %s a un motivo claro en español', (code, expected) => {
    expect(describeActionDisabledReason(code)).toMatch(expected)
  })

  it('usa un respaldo genérico en español para códigos desconocidos o ausentes sin exponer texto interno', () => {
    const unknown = describeActionDisabledReason('UNEXPECTED_INTERNAL_CODE')
    const missing = describeActionDisabledReason(null)
    expect(unknown).toMatch(/no est[aá] disponible/i)
    expect(missing).toBe(unknown)
    expect(unknown).not.toContain('UNEXPECTED_INTERNAL_CODE')
  })
})

describe('incidentLabels · estado e insignias', () => {
  it('etiqueta cada estado proyectado por el servidor', () => {
    expect(incidentStatusBadge('WAITING_STORE_READINESS').label).toMatch(/disponibilidad en tienda/i)
    expect(incidentStatusBadge('CONTACTED').label).toMatch(/contactado/i)
    expect(incidentStatusBadge('READY_AT_STORE').label).toMatch(/disponible en tienda/i)
    expect(incidentStatusBadge('PENDING_PICKUP').label).toMatch(/pendiente de retiro/i)
    expect(incidentStatusBadge('PICKED_UP').label).toMatch(/retirado en tienda/i)
    expect(incidentStatusBadge('EMERGENCY_CUSTODY').label).toMatch(/emergencia/i)
    expect(incidentStatusBadge('REVIEW_WITHOUT_FAILED_ATTEMPT').label).toMatch(/revisi[oó]n/i)
  })
})

describe('incident labels · inherited object keys', () => {
  it.each(['__proto__', 'constructor', 'toString'])('uses a safe fallback for %s', (code) => {
    expect(describeActionDisabledReason(code)).toBe(describeActionDisabledReason(null))
    expect(describeIncidentMutationError(conflict(code))).toBe(
      describeIncidentMutationError(conflict('UNKNOWN_CONFLICT_CODE')),
    )
  })
})

describe('describeIncidentMutationError', () => {
  it('traduce conflictos de disponibilidad y estado obsoleto en español accionable', () => {
    const notReady = describeIncidentMutationError(conflict('INCIDENT_NOT_READY_AT_STORE'))
    expect(notReady).toMatch(/disponible en tienda/i)
    expect(notReady).not.toContain('Raw internal English message')

    const alreadyReady = describeIncidentMutationError(conflict('INCIDENT_ALREADY_READY'))
    expect(alreadyReady).toMatch(/ya fue confirmada/i)
    expect(alreadyReady).toMatch(/bandeja/i)

    const emergency = describeIncidentMutationError(conflict('EMERGENCY_CUSTODY_SEPARATE'))
    expect(emergency).toMatch(/Emergencias/i)
  })

  it('conserva la traducción existente de conflictos de retiro y permisos', () => {
    expect(describeIncidentMutationError(conflict('PICKUP_ALREADY_AGREED'))).toMatch(
      /ya tiene un retiro/,
    )
    expect(describeIncidentMutationError(createHttpError(403))).toBe(
      'No tienes permisos para gestionar entregas fallidas.',
    )
  })

  it('usa mensajes seguros en español por estado/red sin propagar textos crudos ni arreglos del servidor', () => {
    const unknownConflict = describeIncidentMutationError(
      createHttpError(409, {
        data: { code: 'UNKNOWN_CONFLICT_CODE', message: 'Raw SQL conflict detail' },
      }),
    )
    expect(unknownConflict).toMatch(/actualiza la bandeja/i)
    expect(unknownConflict).not.toContain('Raw SQL conflict detail')
    expect(unknownConflict).not.toContain('UNKNOWN_CONFLICT_CODE')

    const validationArray = describeIncidentMutationError(
      createHttpError(400, {
        data: { message: ['attemptId must be a UUID', 'reason should not be empty'] },
      }),
    )
    expect(validationArray).toMatch(/datos enviados no son v[aá]lidos/i)
    expect(validationArray).not.toContain('attemptId must be a UUID')
    expect(validationArray).not.toContain('reason should not be empty')

    const serverError = describeIncidentMutationError(
      createHttpError(500, { data: { message: 'Internal postgres exception' } }),
    )
    expect(serverError).toMatch(/servidor no pudo completar/i)
    expect(serverError).not.toContain('Internal postgres exception')

    const notFound = describeIncidentMutationError(
      createHttpError(404, { data: { message: 'Order row missing' } }),
    )
    expect(notFound).toMatch(/ya no est[aá] disponible/i)
    expect(notFound).not.toContain('Order row missing')

    const unauthorized = describeIncidentMutationError(
      createHttpError(401, { data: { message: 'jwt expired' } }),
    )
    expect(unauthorized).toMatch(/sesi[oó]n expir[oó]/i)
    expect(unauthorized).not.toContain('jwt expired')

    expect(describeIncidentMutationError(new AxiosError('Network Error', 'ERR_NETWORK'))).toBe(
      'No se pudo conectar con el servidor',
    )
    expect(describeIncidentMutationError(new AxiosError('timeout', 'ECONNABORTED'))).toBe(
      'El servidor tardó demasiado en responder',
    )
    expect(
      describeIncidentMutationError(
        new AppError('El servidor no aplicó la decisión. Revisa la lista actualizada.'),
      ),
    ).toBe('El servidor no aplicó la decisión. Revisa la lista actualizada.')

    const unknownError = describeIncidentMutationError(new Error('Sensitive stack trace'))
    expect(unknownError).toMatch(/no se pudo registrar/i)
    expect(unknownError).not.toContain('Sensitive stack trace')
  })
})
