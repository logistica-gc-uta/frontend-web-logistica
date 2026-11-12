import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../../app/App'
import { paths } from '../../app/paths'
import { adminSession } from '../../test/fixtures'
import { createHttpError } from '../../test/http'
import { renderWithProviders } from '../../test/renderWithProviders'
import { todayInGuayaquil } from '../../lib/time/guayaquil'
import { driversAdminService } from './driversAdminService'
import type { DriverAbsence, DriverDayAvailability, DriverProfile } from './types'

const profile = (id: string, name: string, patch: Partial<DriverProfile> = {}): DriverProfile => ({
  id,
  userId: `u-${id}`,
  vehicle: 'Camioneta blanca',
  createdAt: '2030-01-01T00:00:00Z',
  user: { id: `u-${id}`, name, email: `${id}@delivery.com` },
  effectiveAvailability: {
    isAvailable: true,
    hasPersistedHolds: false,
    compatibilityFlagBlocks: false,
    blockingRouteIds: [],
  },
  ...patch,
})

const ANA = profile('ana', 'Ana Ruta')
const LUIS = profile('luis', 'Luis Moto')
const today = todayInGuayaquil()

const dayOf = (patch: Partial<DriverDayAvailability> = {}): DriverDayAvailability => ({
  isAvailable: true,
  hasPersistedHolds: false,
  compatibilityFlagBlocks: false,
  blockingRouteIds: [],
  date: today,
  absence: null,
  ...patch,
})

const absence = (patch: Partial<DriverAbsence> = {}): DriverAbsence => ({
  id: 'ab-1',
  driverId: 'ana',
  startDate: '2099-03-10',
  endDate: '2099-03-11',
  reason: 'Cita médica',
  status: 'ACTIVE',
  createdAt: '2030-01-01T00:00:00Z',
  cancelledAt: null,
  cancelReason: null,
  conflicts: [],
  ...patch,
})

function mockApi() {
  return {
    list: vi.spyOn(driversAdminService, 'list').mockResolvedValue([ANA, LUIS]),
    availabilityOn: vi
      .spyOn(driversAdminService, 'availabilityOn')
      .mockImplementation(async (id) =>
        id === 'ana'
          ? dayOf({
              isAvailable: false,
              absence: { id: 'ab-1', startDate: today, endDate: today, reason: 'Cita médica' },
            })
          : dayOf({ isAvailable: false, hasPersistedHolds: true, blockingRouteIds: ['r1'] }),
      ),
    absences: vi.spyOn(driversAdminService, 'absences').mockResolvedValue([]),
  }
}

const renderPage = () =>
  renderWithProviders(<App />, { route: paths.drivers, session: adminSession })

const findList = () => screen.findByRole('list', { name: 'Repartidores registrados' })

describe('ADMIN · repartidores (#36)', () => {
  it('aparece en el menú y muestra la disponibilidad del día distinguiendo ausente de ocupado', async () => {
    mockApi()
    renderPage()

    const list = within(await findList())
    expect(await list.findByText('Ausente · Cita médica')).toBeInTheDocument()
    expect(list.getByText('Ocupado con una ruta')).toBeInTheDocument()
    expect(list.getByText('ana@delivery.com · Camioneta blanca')).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Principal' })
    expect(within(nav).getByRole('link', { name: 'Repartidores' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.queryByRole('button', { name: /Eliminar|Dar de baja/ })).not.toBeInTheDocument()
  })

  it('una ausencia de mañana no lo marca ocupado hoy: la disponibilidad depende del día', async () => {
    const api = mockApi()
    api.availabilityOn.mockImplementation(async (_id, date) =>
      date === '2099-03-10'
        ? dayOf({
            date,
            isAvailable: false,
            absence: { id: 'ab-1', startDate: date, endDate: date, reason: null },
          })
        : dayOf({ date }),
    )
    renderPage()
    const list = within(await findList())
    await waitFor(() => expect(list.getAllByText('Disponible')).toHaveLength(2))

    fireEvent.change(screen.getByLabelText('Disponibilidad del día'), {
      target: { value: '2099-03-10' },
    })

    await waitFor(() => expect(list.getAllByText('Ausente')).toHaveLength(2))
    expect(api.availabilityOn).toHaveBeenCalledWith('ana', '2099-03-10')
  })

  it('crea un repartidor y muestra su contraseña temporal una sola vez', async () => {
    const api = mockApi()
    const create = vi.spyOn(driversAdminService, 'create').mockResolvedValue({
      ...profile('nuevo', 'Nuevo Chofer'),
      temporaryPassword: 'Temporal-ABC123xyz',
    })
    const { user } = renderPage()
    await findList()
    const form = within(screen.getByRole('form', { name: 'Nuevo repartidor' }))

    await user.type(form.getByLabelText('Nombre'), '  Nuevo Chofer ')
    await user.type(form.getByLabelText('Correo'), 'nuevo@delivery.com')
    await user.type(form.getByLabelText('Vehículo'), 'Moto roja')
    await user.click(form.getByRole('button', { name: 'Crear repartidor' }))

    expect(create).toHaveBeenCalledWith({
      name: 'Nuevo Chofer',
      email: 'nuevo@delivery.com',
      vehicle: 'Moto roja',
    })
    expect(await screen.findByText('Temporal-ABC123xyz')).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent(/No se puede volver a ver ni recuperar/)
    expect(api.list).toHaveBeenCalledTimes(2)

    await user.click(screen.getByRole('button', { name: 'Ya la entregué' }))

    expect(screen.queryByText('Temporal-ABC123xyz')).not.toBeInTheDocument()
    expect(screen.getByRole('form', { name: 'Nuevo repartidor' })).toBeInTheDocument()
  })

  it('un correo repetido se explica y no se pierde lo escrito', async () => {
    mockApi()
    vi.spyOn(driversAdminService, 'create').mockRejectedValue(
      createHttpError(409, {
        data: { statusCode: 409, code: 'EMAIL_ALREADY_EXISTS', message: 'x' },
      }),
    )
    const { user } = renderPage()
    await findList()
    const form = within(screen.getByRole('form', { name: 'Nuevo repartidor' }))
    await user.type(form.getByLabelText('Nombre'), 'Ana Ruta')
    await user.type(form.getByLabelText('Correo'), 'ana@delivery.com')
    await user.type(form.getByLabelText('Vehículo'), 'Moto')

    await user.click(form.getByRole('button', { name: 'Crear repartidor' }))

    expect(await form.findByText('Ya existe una cuenta con ese correo.')).toBeInTheDocument()
    expect(form.getByLabelText('Correo')).toHaveValue('ana@delivery.com')
  })

  it('corrige solo los datos que cambiaron y avisa que sus rutas no cambian', async () => {
    mockApi()
    const update = vi.spyOn(driversAdminService, 'update').mockResolvedValue(ANA)
    const { user } = renderPage()
    await findList()

    await user.click(screen.getByRole('button', { name: 'Editar datos de Ana Ruta' }))
    const form = within(screen.getByRole('form', { name: 'Corregir datos de Ana Ruta' }))
    await user.clear(form.getByLabelText('Vehículo'))
    await user.type(form.getByLabelText('Vehículo'), 'Furgoneta')
    await user.click(form.getByRole('button', { name: 'Guardar cambios' }))

    expect(update).toHaveBeenCalledWith('ana', { vehicle: 'Furgoneta' })
    expect(
      await screen.findByText(
        'Datos corregidos. Sus rutas, reservas y disponibilidad no cambiaron.',
      ),
    ).toBeInTheDocument()
  })

  it('una ausencia que choca con rutas se guarda, avisa y no reasigna nada', async () => {
    const api = mockApi()
    const add = vi.spyOn(driversAdminService, 'addAbsence').mockResolvedValue(
      absence({
        conflicts: [
          {
            routeId: 'r1',
            status: 'ASSIGNED',
            date: '2099-03-10T15:00:00Z',
            orderIds: ['o1', 'o2'],
          },
        ],
      }),
    )
    const { user } = renderPage()
    await findList()
    await user.click(screen.getByRole('button', { name: 'Ausencias de Ana Ruta' }))
    const form = within(await screen.findByRole('form', { name: 'Registrar ausencia de Ana Ruta' }))

    fireEvent.change(form.getByLabelText('Desde'), { target: { value: '2099-03-10' } })
    fireEvent.change(form.getByLabelText('Hasta'), { target: { value: '2099-03-11' } })
    await user.type(form.getByLabelText('Motivo (opcional)'), 'Cita médica')
    await user.click(form.getByRole('button', { name: 'Registrar ausencia' }))

    expect(add).toHaveBeenCalledWith('ana', {
      startDate: '2099-03-10',
      endDate: '2099-03-11',
      reason: 'Cita médica',
    })
    expect(
      await screen.findByText(/Ausencia registrada del 10\/03\/2099 al 11\/03\/2099/),
    ).toBeInTheDocument()
    const conflicts = screen.getByText(/La ausencia afecta una ruta/).closest('div')!
    expect(conflicts).toHaveTextContent('No se canceló ni se reasignó nada')
    expect(conflicts).toHaveTextContent('Ruta del 10/03/2099 · asignada, sin iniciar · 2 pedidos')
    expect(within(conflicts).getByRole('link', { name: 'Planificación' })).toBeInTheDocument()
    expect(api.absences).toHaveBeenCalledTimes(2)
  })

  it('no registra una ausencia en el pasado ni con el rango al revés', async () => {
    mockApi()
    const add = vi.spyOn(driversAdminService, 'addAbsence')
    const { user } = renderPage()
    await findList()
    await user.click(screen.getByRole('button', { name: 'Ausencias de Ana Ruta' }))
    const form = within(await screen.findByRole('form', { name: 'Registrar ausencia de Ana Ruta' }))

    fireEvent.change(form.getByLabelText('Desde'), { target: { value: '2000-01-01' } })
    fireEvent.change(form.getByLabelText('Hasta'), { target: { value: '1999-12-31' } })
    await user.click(form.getByRole('button', { name: 'Registrar ausencia' }))

    expect(form.getByText('Solo hoy o fechas futuras')).toBeInTheDocument()
    expect(form.getByText('No puede ser anterior al primer día')).toBeInTheDocument()
    expect(add).not.toHaveBeenCalled()
  })

  it('un solape del backend se explica sin cambios', async () => {
    mockApi()
    vi.spyOn(driversAdminService, 'addAbsence').mockRejectedValue(
      createHttpError(409, { data: { statusCode: 409, code: 'ABSENCE_OVERLAP', message: 'x' } }),
    )
    const { user } = renderPage()
    await findList()
    await user.click(screen.getByRole('button', { name: 'Ausencias de Ana Ruta' }))
    const form = within(await screen.findByRole('form', { name: 'Registrar ausencia de Ana Ruta' }))
    fireEvent.change(form.getByLabelText('Desde'), { target: { value: '2099-03-10' } })
    fireEvent.change(form.getByLabelText('Hasta'), { target: { value: '2099-03-10' } })

    await user.click(form.getByRole('button', { name: 'Registrar ausencia' }))

    expect(
      await form.findByText('Ya hay una ausencia activa que se cruza con esas fechas.'),
    ).toBeInTheDocument()
  })

  it('anula una ausencia con su motivo, sin tocar rutas', async () => {
    const api = mockApi()
    api.absences.mockResolvedValue([absence()])
    const cancel = vi
      .spyOn(driversAdminService, 'cancelAbsence')
      .mockResolvedValue(absence({ status: 'CANCELLED' }))
    const { user } = renderPage()
    await findList()
    await user.click(screen.getByRole('button', { name: 'Ausencias de Ana Ruta' }))
    const list = within(await screen.findByRole('list', { name: 'Ausencias vigentes de Ana Ruta' }))

    await user.click(list.getByRole('button', { name: 'Anular' }))
    await user.type(
      list.getByLabelText('Motivo de la anulación (del 10/03/2099 al 11/03/2099)'),
      'Se recuperó',
    )
    await user.click(list.getByRole('button', { name: 'Confirmar anulación' }))

    expect(cancel).toHaveBeenCalledWith('ana', 'ab-1', 'Se recuperó')
    expect(
      await screen.findByText(
        'Ausencia del 10/03/2099 al 11/03/2099 anulada. Las rutas y reservas existentes no cambian.',
      ),
    ).toBeInTheDocument()
  })
})
