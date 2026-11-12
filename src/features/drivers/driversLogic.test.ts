import { describe, expect, it, vi } from 'vitest'
import { apiClient } from '../../lib/http/apiClient'
import { createHttpError, createHttpResponse } from '../../test/http'
import { describeAssignError } from '../planning/confirmError'
import { driversService } from '../planning/driversService'
import { describeDriverError } from './driverErrors'
import {
  availabilityLabel,
  profileChanges,
  validateAbsence,
  validateProfile,
} from './driverValidation'
import type { DriverDayAvailability } from './types'

const TODAY = '2030-02-10'

const day = (patch: Partial<DriverDayAvailability> = {}): DriverDayAvailability => ({
  isAvailable: true,
  hasPersistedHolds: false,
  compatibilityFlagBlocks: false,
  blockingRouteIds: [],
  date: TODAY,
  absence: null,
  ...patch,
})

describe('repartidores · validación del perfil', () => {
  it('exige nombre y vehículo de 2 a 120 caracteres y un correo válido', () => {
    expect(validateProfile({ name: 'A', email: 'no-es-correo', vehicle: ' ' })).toEqual({
      name: 'Nombre: escribe al menos 2 caracteres',
      email: 'Escribe un correo válido',
      vehicle: 'Vehículo: escribe al menos 2 caracteres',
    })
    expect(validateProfile({ name: 'a'.repeat(121), email: 'a@b.ec', vehicle: 'Moto' }).name).toBe(
      'Nombre: máximo 120 caracteres',
    )
    expect(validateProfile({ name: 'Ana', email: 'ana@delivery.com', vehicle: 'Moto' })).toEqual({})
  })

  it('al corregir envía solo lo que cambió', () => {
    const current = { name: 'Ana', email: 'ana@delivery.com', vehicle: 'Moto' }
    expect(profileChanges({ ...current, vehicle: ' Camioneta ' }, current)).toEqual({
      vehicle: 'Camioneta',
    })
    expect(profileChanges(current, current)).toEqual({})
  })
})

describe('repartidores · validación de ausencias', () => {
  it('solo hoy o futuro, con el rango en orden', () => {
    expect(
      validateAbsence({ startDate: '2030-02-09', endDate: '2030-02-09', reason: '' }, TODAY),
    ).toEqual({ startDate: 'Solo hoy o fechas futuras' })
    expect(
      validateAbsence({ startDate: '2030-02-12', endDate: '2030-02-11', reason: '' }, TODAY),
    ).toEqual({ endDate: 'No puede ser anterior al primer día' })
    expect(validateAbsence({ startDate: '', endDate: '', reason: '' }, TODAY)).toEqual({
      startDate: 'Elige el primer día de la ausencia',
      endDate: 'Elige el último día de la ausencia',
    })
    expect(
      validateAbsence({ startDate: TODAY, endDate: TODAY, reason: 'r'.repeat(301) }, TODAY).reason,
    ).toBe('Máximo 300 caracteres')
    expect(
      validateAbsence({ startDate: TODAY, endDate: '2030-02-12', reason: 'Cita' }, TODAY),
    ).toEqual({})
  })
})

describe('repartidores · disponibilidad de un día', () => {
  it('distingue ausente de ocupado y de disponible', () => {
    expect(
      availabilityLabel(
        day({
          isAvailable: false,
          absence: { id: 'a1', startDate: TODAY, endDate: TODAY, reason: 'Cita médica' },
        }),
      ),
    ).toEqual({ text: 'Ausente · Cita médica', tone: 'danger' })
    expect(availabilityLabel(day({ isAvailable: false, hasPersistedHolds: true })).text).toBe(
      'Ocupado con una ruta',
    )
    expect(availabilityLabel(day({ isAvailable: false, compatibilityFlagBlocks: true })).text).toBe(
      'Marcado como no disponible',
    )
    expect(availabilityLabel(day())).toEqual({ text: 'Disponible', tone: 'success' })
  })
})

describe('repartidores · errores', () => {
  it('explica los códigos del backend', () => {
    const coded = (status: number, code: string) =>
      createHttpError(status, { data: { statusCode: status, code, message: 'x' } })
    expect(describeDriverError(coded(409, 'EMAIL_ALREADY_EXISTS'), 'f')).toBe(
      'Ya existe una cuenta con ese correo.',
    )
    expect(describeDriverError(coded(409, 'ABSENCE_OVERLAP'), 'f')).toMatch(/se cruza/)
    expect(describeDriverError(coded(409, 'ABSENCE_ALREADY_ELAPSED'), 'f')).toMatch(/ya terminó/)
    expect(describeDriverError(createHttpError(403), 'f')).toMatch(/Solo un ADMIN/)
    expect(describeAssignError(coded(409, 'DRIVER_ABSENT'))).toBe(
      'Ese chofer está ausente el día de la ruta: elige otro.',
    )
  })
})

describe('planificación · choferes del día', () => {
  it('un chofer ausente ese día no se ofrece aunque no tenga reservas', async () => {
    vi.spyOn(driversService, 'list').mockResolvedValue([
      { id: 'd1', name: 'Ana', vehicle: 'Moto', isAvailable: true, unavailableReason: null },
      { id: 'd2', name: 'Luis', vehicle: 'Auto', isAvailable: true, unavailableReason: null },
    ])
    const get = vi
      .spyOn(apiClient, 'get')
      .mockImplementation(async (url) =>
        createHttpResponse(
          url.includes('d1')
            ? { isAvailable: false, absence: { id: 'a1' } }
            : { isAvailable: true, absence: null },
        ),
      )

    const drivers = await driversService.listForDay('2099-01-15')

    expect(drivers).toEqual([
      expect.objectContaining({ id: 'd1', isAvailable: false, unavailableReason: 'ABSENT' }),
      expect.objectContaining({ id: 'd2', isAvailable: true, unavailableReason: null }),
    ])
    expect(get).toHaveBeenCalledWith('/drivers/d1/availability', {
      params: { date: '2099-01-15' },
    })
  })

  it('si no se puede consultar el día, deja el listado como está (el backend igual valida)', async () => {
    vi.spyOn(driversService, 'list').mockResolvedValue([
      { id: 'd1', name: 'Ana', vehicle: 'Moto', isAvailable: true, unavailableReason: null },
    ])
    vi.spyOn(apiClient, 'get').mockRejectedValue(createHttpError(500))

    await expect(driversService.listForDay('2099-01-15')).resolves.toEqual([
      expect.objectContaining({ id: 'd1', isAvailable: true }),
    ])
  })
})
