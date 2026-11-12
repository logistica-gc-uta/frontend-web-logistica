import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { describeDriverError } from '../features/drivers/driverErrors'
import { driversAdminService } from '../features/drivers/driversAdminService'
import type { CreatedDriver } from '../features/drivers/types'
import { ordersService } from '../features/orders/ordersService'
import { describeAssignError } from '../features/planning/confirmError'
import { driversService } from '../features/planning/driversService'
import { planningService } from '../features/planning/planningService'
import { productsService } from '../features/products/productsService'
import { zonesService } from '../features/zones/zonesService'
import { apiClient } from '../lib/http/apiClient'
import { expectHttpError } from './support/assertions'
import { loginAsAdmin, loginAsClient, uniqueSuffix } from './support/session'

/**
 * Cada ejecución crea sus propios repartidores (nunca usa los del seed) y trabaja en un miércoles
 * al azar entre 2080 y 2099: las ausencias y la ruta asignada solo afectan a esos repartidores.
 */
const FIRST_WEDNESDAY = Date.UTC(2080, 0, 3)
const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const DAY = new Date(FIRST_WEDNESDAY + Math.floor(Math.random() * 1000) * WEEK_MS)
  .toISOString()
  .slice(0, 10)
const NEXT_DAY = new Date(Date.parse(`${DAY}T12:00:00Z`) + 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10)

const newDriver = (label: string) => {
  const suffix = uniqueSuffix()
  return driversAdminService.create({
    name: `IT Repartidor ${label} ${suffix}`,
    email: `it.repartidor.${suffix.toLowerCase()}@example.com`,
    vehicle: 'Moto de pruebas',
  })
}

const codeOf = async (promise: Promise<unknown>) => {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason as { response?: { data?: { code?: string } } },
  )
  return error?.response?.data?.code
}

describe(`Integración real · repartidores y ausencias (/drivers) · día ${DAY}`, () => {
  let assigned: CreatedDriver
  let spare: CreatedDriver
  let routeIds: string[]

  beforeAll(async () => {
    await loginAsAdmin()
    assigned = await newDriver('asignado')
    spare = await newDriver('libre')

    // Dos rutas DRAFT propias del día: una se asigna a `assigned`, la otra se intenta con `spare`.
    const zone = (await zonesService.list()).find((candidate) => candidate.depotLocation !== null)
    if (!zone?.depotLocation) throw new Error('Ninguna zona tiene depósito: ejecuta el seed.')
    const product = await productsService.create({
      name: `IT Producto repartidores ${uniqueSuffix()}`,
      price: 10,
      stock: 2,
    })
    routeIds = []
    for (let k = 1; k <= 2; k += 1) {
      const order = await ordersService.createPurchase(
        {
          buyer: { type: 'GUEST', name: `IT Ausencia ${k}`, contactPhone: '0990000000' },
          zoneId: zone.id,
          deliveryAddress: `IT Ausencia ${k} ${uniqueSuffix()}`,
          items: [{ productId: product.id, quantity: 1 }],
          scheduledDeliveryDate: `${DAY}T10:00:00-05:00`,
          deliveryLat: zone.depotLocation.lat + 0.001 * k,
          deliveryLng: zone.depotLocation.lng + 0.001 * k,
          payment: { method: 'CASH' },
        },
        crypto.randomUUID(),
      )
      const route = await planningService.confirmRoute({
        zoneId: zone.id,
        routeDate: `${DAY}T15:00:00Z`,
        orderIds: [order.id],
      })
      routeIds.push(route.id)
    }
  })

  beforeEach(loginAsAdmin)

  it('el alta devuelve una contraseña temporal con la que el repartidor puede entrar', async () => {
    expect(assigned.temporaryPassword).toEqual(expect.any(String))
    expect(assigned.temporaryPassword.length).toBeGreaterThanOrEqual(8)

    const { data } = await apiClient.post<{ user: { role: string } }>('/auth/login', {
      email: assigned.user.email,
      password: assigned.temporaryPassword,
    })
    expect(data.user.role).toBe('DRIVER')

    await loginAsAdmin()
    const listed = (await driversAdminService.list()).find((driver) => driver.id === assigned.id)
    expect(listed).toEqual(expect.objectContaining({ vehicle: 'Moto de pruebas' }))
    expect(listed).not.toHaveProperty('temporaryPassword')
  })

  it('un correo repetido se rechaza con un mensaje claro', async () => {
    const error = await driversAdminService
      .create({ name: 'IT Repetido', email: assigned.user.email, vehicle: 'Moto' })
      .catch((reason: unknown) => reason)

    expect(describeDriverError(error, 'f')).toBe('Ya existe una cuenta con ese correo.')
  })

  it('corregir datos cambia solo lo enviado', async () => {
    const updated = await driversAdminService.update(spare.id, { vehicle: 'Camioneta de pruebas' })

    expect(updated.vehicle).toBe('Camioneta de pruebas')
    expect(updated.user.email).toBe(spare.user.email)
    expect(updated.user.name).toBe(spare.user.name)
  })

  it('una ausencia sobre una ruta asignada se guarda y la informa sin reasignar nada', async () => {
    await planningService.assignDriver(routeIds[0], assigned.id)

    const absence = await driversAdminService.addAbsence(assigned.id, {
      startDate: DAY,
      endDate: NEXT_DAY,
      reason: 'IT cita médica',
    })

    expect(absence.status).toBe('ACTIVE')
    expect(absence.conflicts).toEqual([
      expect.objectContaining({ routeId: routeIds[0], status: 'ASSIGNED' }),
    ])
    const route = (await planningService.listRoutes()).find((item) => item.id === routeIds[0])
    expect(route).toEqual(expect.objectContaining({ status: 'ASSIGNED', driverId: assigned.id }))
    expect(await driversAdminService.absences(assigned.id)).toEqual([
      expect.objectContaining({ id: absence.id, startDate: DAY, endDate: NEXT_DAY }),
    ])
  })

  it('la disponibilidad depende del día y la planificación no ofrece al ausente', async () => {
    const absence = await driversAdminService.addAbsence(spare.id, {
      startDate: DAY,
      endDate: DAY,
    })

    const onDay = await driversAdminService.availabilityOn(spare.id, DAY)
    expect(onDay).toEqual(
      expect.objectContaining({
        isAvailable: false,
        absence: expect.objectContaining({ id: absence.id }),
      }),
    )
    expect((await driversAdminService.availabilityOn(spare.id, NEXT_DAY)).absence).toBeNull()

    const forDay = (await driversService.listForDay(DAY)).find((driver) => driver.id === spare.id)
    expect(forDay).toEqual(
      expect.objectContaining({ isAvailable: false, unavailableReason: 'ABSENT' }),
    )
  })

  it('asignar una ruta a un repartidor ausente se rechaza con DRIVER_ABSENT', async () => {
    const error = await planningService
      .assignDriver(routeIds[1], spare.id)
      .catch((reason: unknown) => reason)

    expect(describeAssignError(error)).toBe(
      'Ese chofer está ausente el día de la ruta: elige otro.',
    )
  })

  it('rechaza solapes, fechas pasadas y rangos al revés', async () => {
    expect(
      await codeOf(driversAdminService.addAbsence(spare.id, { startDate: DAY, endDate: NEXT_DAY })),
    ).toBe('ABSENCE_OVERLAP')
    expect(
      await codeOf(
        driversAdminService.addAbsence(spare.id, {
          startDate: '2000-01-01',
          endDate: '2000-01-02',
        }),
      ),
    ).toBe('ABSENCE_DATE_IN_PAST')
    expect(
      await codeOf(driversAdminService.addAbsence(spare.id, { startDate: NEXT_DAY, endDate: DAY })),
    ).toBe('ABSENCE_RANGE_INVALID')
  })

  it('anular una ausencia la libera ese día y no se puede anular dos veces', async () => {
    const [absence] = await driversAdminService.absences(spare.id)

    const cancelled = await driversAdminService.cancelAbsence(
      spare.id,
      absence.id,
      'IT se recuperó',
    )

    expect(cancelled.status).toBe('CANCELLED')
    expect((await driversAdminService.availabilityOn(spare.id, DAY)).absence).toBeNull()
    expect(await driversAdminService.absences(spare.id)).toEqual([])
    expect(await codeOf(driversAdminService.cancelAbsence(spare.id, absence.id))).toBe(
      'ABSENCE_ALREADY_CANCELLED',
    )
  })

  it('un CLIENT no puede crear repartidores ni gestionar ausencias (403)', async () => {
    await loginAsClient()

    await expectHttpError(newDriver('cliente'), 403)
    await expectHttpError(
      driversAdminService.addAbsence(spare.id, { startDate: DAY, endDate: DAY }),
      403,
    )
    await expectHttpError(driversAdminService.availabilityOn(spare.id, DAY), 403)
  })
})
