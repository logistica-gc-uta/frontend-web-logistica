import { render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../../app/App'
import { paths } from '../../app/paths'
import { apiClient } from '../../lib/http/apiClient'
import { todayInGuayaquil } from '../../lib/time/guayaquil'
import { adminSession } from '../../test/fixtures'
import { createHttpError, createHttpResponse } from '../../test/http'
import { renderWithProviders } from '../../test/renderWithProviders'
import { describeDispatchError } from '../dispatch/dispatchError'
import { describeAssignError } from '../planning/confirmError'
import { DriverPicker } from '../planning/DriverPicker'
import { driversService } from '../planning/driversService'
import { driversAdminService } from './driversAdminService'
import type { DriverDayAvailability, DriverProfile } from './types'

const today = todayInGuayaquil()

const profile = (id: string, name: string, patch: Partial<DriverProfile> = {}): DriverProfile => ({
  id,
  userId: `u-${id}`,
  vehicle: 'Camioneta blanca',
  createdAt: '2030-01-01T00:00:00Z',
  user: { id: `u-${id}`, name, email: `${id}@delivery.com` },
  isActive: true,
  statusChangedAt: null,
  statusReason: null,
  effectiveAvailability: {
    isAvailable: true,
    hasPersistedHolds: false,
    compatibilityFlagBlocks: false,
    blockingRouteIds: [],
  },
  ...patch,
})

const dayOf = (patch: Partial<DriverDayAvailability> = {}): DriverDayAvailability => ({
  isAvailable: true,
  hasPersistedHolds: false,
  compatibilityFlagBlocks: false,
  blockingRouteIds: [],
  date: today,
  absence: null,
  ...patch,
})

const ANA = profile('ana', 'Ana Ruta')
const LUIS = profile('luis', 'Luis Moto', {
  isActive: false,
  statusChangedAt: '2030-01-05T15:00:00Z',
  statusReason: 'Licencia larga',
  effectiveAvailability: {
    isAvailable: false,
    hasPersistedHolds: false,
    compatibilityFlagBlocks: false,
    blockingRouteIds: [],
  },
})

const conflict = (code: string, extra: Record<string, unknown> = {}) =>
  createHttpError(409, {
    data: { statusCode: 409, code, message: 'x', error: 'Conflict', ...extra },
  })

function mockApi(drivers: DriverProfile[] = [ANA, LUIS]) {
  return {
    list: vi.spyOn(driversAdminService, 'list').mockResolvedValue(drivers),
    availabilityOn: vi.spyOn(driversAdminService, 'availabilityOn').mockResolvedValue(dayOf()),
  }
}

const renderPage = () =>
  renderWithProviders(<App />, { route: paths.drivers, session: adminSession })

type User = ReturnType<typeof renderPage>['user']

const findList = () => screen.findByRole('table', { name: 'Repartidores registrados' })
const panel = (name: string) => within(screen.getByRole('group', { name: `Estado de ${name}` }))

async function openStatus(user: User, label: string) {
  await findList()
  await user.click(await screen.findByRole('button', { name: label }))
}

describe('ADMIN · estado activo de repartidores (#64)', () => {
  it('muestra el estado activo/inactivo y un dado de baja no figura como asignable', async () => {
    mockApi()
    renderPage()
    const list = within(await findList())

    expect(await list.findByLabelText('Estado de Ana Ruta')).toHaveTextContent('Activo')
    expect(list.getByLabelText('Estado de Luis Moto')).toHaveTextContent('Dado de baja')
    expect(list.getByLabelText('Disponibilidad de Luis Moto')).toHaveTextContent(
      'No asignable (dado de baja)',
    )
    expect(list.getByRole('button', { name: 'Dar de baja a Ana Ruta' })).toBeInTheDocument()
    expect(list.getByRole('button', { name: 'Reactivar a Luis Moto' })).toBeInTheDocument()
  })

  it('da de baja con confirmación y motivo, y la lista se actualiza sin perder al repartidor', async () => {
    const api = mockApi()
    const deactivate = vi
      .spyOn(driversAdminService, 'deactivate')
      .mockResolvedValue(profile('ana', 'Ana Ruta', { isActive: false }))
    const { user } = renderPage()
    await openStatus(user, 'Dar de baja a Ana Ruta')

    expect(panel('Ana Ruta').getByText(/no podrá iniciar sesión/)).toBeInTheDocument()
    expect(deactivate).not.toHaveBeenCalled()
    api.list.mockResolvedValue([profile('ana', 'Ana Ruta', { isActive: false }), LUIS])
    await user.type(panel('Ana Ruta').getByLabelText(/Motivo de la baja/), '  Dejó la empresa  ')
    await user.click(panel('Ana Ruta').getByRole('button', { name: 'Confirmar baja' }))

    expect(deactivate).toHaveBeenCalledTimes(1)
    expect(deactivate).toHaveBeenCalledWith('ana', 'Dejó la empresa')
    expect(await screen.findByText(/Ana Ruta quedó dado de baja/)).toBeInTheDocument()
    const list = within(await findList())
    expect(await list.findByLabelText('Estado de Ana Ruta')).toHaveTextContent('Dado de baja')
    expect(list.getByText('ana@delivery.com')).toBeInTheDocument()
  })

  it('Volver cierra sin enviar nada', async () => {
    mockApi()
    const deactivate = vi.spyOn(driversAdminService, 'deactivate')
    const { user } = renderPage()
    await openStatus(user, 'Dar de baja a Ana Ruta')

    await user.click(panel('Ana Ruta').getByRole('button', { name: 'Volver' }))

    expect(deactivate).not.toHaveBeenCalled()
    expect(screen.queryByRole('group', { name: 'Estado de Ana Ruta' })).not.toBeInTheDocument()
  })

  it('si tiene una ruta abierta conserva el estado y explica qué ruta falta resolver', async () => {
    const api = mockApi()
    vi.spyOn(driversAdminService, 'deactivate').mockRejectedValue(
      conflict('DRIVER_HAS_OPEN_ROUTE', {
        blockingRoutes: [
          { routeId: 'abcdef12-3456', status: 'IN_PROGRESS', returnConfirmed: false },
        ],
      }),
    )
    const { user } = renderPage()
    await openStatus(user, 'Dar de baja a Ana Ruta')
    const callsBefore = api.list.mock.calls.length

    await user.click(panel('Ana Ruta').getByRole('button', { name: 'Confirmar baja' }))

    const alert = await panel('Ana Ruta').findByRole('alert')
    expect(alert).toHaveTextContent('No se puede dar de baja: tiene una ruta asignada, en curso')
    expect(alert).toHaveTextContent('Ruta abcdef12')
    expect(alert).toHaveTextContent('regreso al depósito sin confirmar')
    expect(panel('Ana Ruta').getByText('Activo')).toBeInTheDocument()
    await waitFor(() => expect(api.list.mock.calls.length).toBeGreaterThan(callsBefore))
  })

  it('reactivar no lo vuelve asignable si sigue ausente hoy y así lo dice', async () => {
    const api = mockApi()
    const activate = vi
      .spyOn(driversAdminService, 'activate')
      .mockResolvedValue(profile('luis', 'Luis Moto'))
    const { user } = renderPage()
    await openStatus(user, 'Reactivar a Luis Moto')

    expect(panel('Luis Moto').getByText(/Motivo: Licencia larga/)).toBeInTheDocument()
    api.availabilityOn.mockResolvedValue(
      dayOf({
        isAvailable: false,
        absence: { id: 'ab-1', startDate: today, endDate: today, reason: 'Cita médica' },
      }),
    )
    await user.click(panel('Luis Moto').getByRole('button', { name: 'Confirmar reactivación' }))

    expect(activate).toHaveBeenCalledWith('luis', undefined)
    expect(
      await screen.findByText(
        /Luis Moto fue reactivado y ya puede iniciar sesión, pero todavía no puede recibir rutas: tiene una ausencia registrada para hoy/,
      ),
    ).toBeInTheDocument()
  })

  it('un doble clic envía la baja una sola vez y bloquea los controles mientras guarda', async () => {
    mockApi()
    let finish!: () => void
    const deactivate = vi.spyOn(driversAdminService, 'deactivate').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(profile('ana', 'Ana Ruta', { isActive: false }))
        }),
    )
    const { user } = renderPage()
    await openStatus(user, 'Dar de baja a Ana Ruta')
    const confirm = panel('Ana Ruta').getByRole('button', { name: 'Confirmar baja' })

    await user.dblClick(confirm)

    expect(deactivate).toHaveBeenCalledTimes(1)
    expect(panel('Ana Ruta').getByRole('button', { name: /Dando de baja/ })).toBeDisabled()
    expect(panel('Ana Ruta').getByRole('button', { name: 'Volver' })).toBeDisabled()
    finish()
    expect(await screen.findByText(/Ana Ruta quedó dado de baja/)).toBeInTheDocument()
  })

  it('si el estado cambió en otra sesión lo explica y relee la lista', async () => {
    const api = mockApi()
    vi.spyOn(driversAdminService, 'deactivate').mockRejectedValue(
      conflict('DRIVER_ALREADY_INACTIVE'),
    )
    const { user } = renderPage()
    await openStatus(user, 'Dar de baja a Ana Ruta')
    const callsBefore = api.list.mock.calls.length

    await user.click(panel('Ana Ruta').getByRole('button', { name: 'Confirmar baja' }))

    expect(await panel('Ana Ruta').findByRole('alert')).toHaveTextContent(
      'Este repartidor ya estaba dado de baja (cambió en otra sesión).',
    )
    await waitFor(() => expect(api.list.mock.calls.length).toBeGreaterThan(callsBefore))
  })
})

describe('Selectores de chofer con repartidores dados de baja (#64)', () => {
  const rawDriver = (id: string, name: string, isActive?: boolean) => ({
    id,
    vehicle: 'Moto',
    vehicleCapacity: null,
    user: { name },
    ...(isActive === undefined ? {} : { isActive }),
    effectiveAvailability: { isAvailable: isActive !== false, hasPersistedHolds: false },
  })

  it('un inactivo queda como «dado de baja» y no se consulta su día; sin la marca cuenta como activo', async () => {
    const get = vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/drivers') {
        return createHttpResponse([
          rawDriver('d1', 'Activa', true),
          rawDriver('d2', 'De baja', false),
          rawDriver('d3', 'Sin marca'),
        ])
      }
      return createHttpResponse({ isAvailable: true, hasPersistedHolds: false, absence: null })
    })

    const drivers = await driversService.listForDay(today)

    expect(drivers.map((d) => [d.name, d.isAvailable, d.unavailableReason])).toEqual([
      ['Activa', true, null],
      ['De baja', false, 'INACTIVE'],
      ['Sin marca', true, null],
    ])
    expect(get).not.toHaveBeenCalledWith('/drivers/d2/availability', expect.anything())
  })

  it('el selector de Planificación lo muestra deshabilitado como «dado de baja»', () => {
    render(
      <DriverPicker
        label="Chofer para Ruta 1"
        submitLabel="Asignar chofer"
        loadingText="Asignando..."
        drivers={[
          { id: 'd1', name: 'Activa', vehicle: 'Moto', isAvailable: true, unavailableReason: null },
          {
            id: 'd2',
            name: 'De baja',
            vehicle: 'Moto',
            isAvailable: false,
            unavailableReason: 'INACTIVE',
          },
        ]}
        state={undefined}
        onSubmit={vi.fn()}
      />,
    )

    const option = screen.getByRole('option', { name: 'De baja · dado de baja' })
    expect(option).toBeDisabled()
  })

  it('si lo dieron de baja con la pantalla abierta, asignar o despachar lo explica', () => {
    expect(describeAssignError(conflict('DRIVER_INACTIVE'))).toMatch(
      /está dado de baja y no puede recibir rutas/,
    )
    expect(describeDispatchError(conflict('DRIVER_INACTIVE'))).toMatch(/está dado de baja/)
  })
})
