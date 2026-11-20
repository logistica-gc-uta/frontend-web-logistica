import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { AxiosError } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../app/App'
import { paths } from '../../app/paths'
import { todayInGuayaquil } from '../../lib/time/guayaquil'
import { adminSession, zones } from '../../test/fixtures'
import { createHttpError } from '../../test/http'
import {
  availableDriver,
  emptyProposalsResponse,
  proposalsResponse,
  savedDraft,
  savedRouteDetail,
} from '../../test/planningFixtures'
import { auditRecord } from '../../test/dispatchFixtures'
import { renderWithProviders } from '../../test/renderWithProviders'
import { zonesService } from '../zones/zonesService'
import { driversService } from './driversService'
import { dispatchService } from '../dispatch/dispatchService'
import { planningService } from './planningService'
import type { RouteProposalsResponse } from './types'

/** El mapa real no se dibuja en jsdom (se prueba aparte): aquí se simula con botones. */
vi.mock('../../components/map/RoutesMap', () => ({
  RoutesMap: ({
    routes,
    selectedId,
    onSelect,
  }: {
    routes: { id: string; label: string }[]
    selectedId: string | null
    onSelect: (id: string) => void
  }) => (
    <div data-testid="routes-map" data-selected={selectedId ?? ''}>
      {routes.map((route) => (
        <button key={route.id} type="button" onClick={() => onSelect(route.id)}>
          {`Mapa: ${route.label}`}
        </button>
      ))}
    </div>
  ),
}))

const HAVERSINE_ENGINE = {
  engine: 'HAVERSINE' as const,
  configured: false,
  available: true,
  profile: null,
  latencyMs: null,
  checkedAt: '2030-02-14T12:00:00Z',
  message: 'Motor vial desactivado',
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

const mockApi = (response: RouteProposalsResponse = proposalsResponse) => {
  vi.spyOn(zonesService, 'list').mockResolvedValue(zones)
  vi.spyOn(planningService, 'listRoutes').mockResolvedValue([])
  vi.spyOn(driversService, 'list').mockResolvedValue([])
  vi.spyOn(planningService, 'roadEngine').mockResolvedValue(HAVERSINE_ENGINE)
  return vi.spyOn(planningService, 'getProposals').mockResolvedValue(response)
}

const renderPlanningPage = () =>
  renderWithProviders(<App />, { route: paths.planning, session: adminSession })

type User = ReturnType<typeof renderPlanningPage>['user']

const setDate = async (value = '2030-02-14') =>
  fireEvent.change(await screen.findByLabelText('Día a planificar'), { target: { value } })

const preview = async (user: User) => {
  await setDate()
  await user.click(screen.getByRole('button', { name: 'Previsualizar rutas' }))
  await screen.findByRole('heading', { name: /Rutas propuestas/ })
}

/** Las rutas guardadas viven en un panel lateral que se abre desde la cabecera de la página. */
const openSaved = (user: User) =>
  user.click(screen.getByRole('button', { name: 'Ver rutas guardadas' }))

const card = (label: string) => within(screen.getByRole('article', { name: label }))

// La disponibilidad por día (#36) se prueba aparte: aquí alcanza con el listado simulado.
beforeEach(() => {
  vi.spyOn(driversService, 'listForDay').mockImplementation(() => driversService.list())
})

describe('PlanningPage · previsualizar', () => {
  it('propone el día de hoy sin depender de zonas', async () => {
    mockApi()
    renderPlanningPage()

    expect(await screen.findByLabelText('Día a planificar')).toHaveValue(todayInGuayaquil())
    expect(screen.queryByLabelText('Zona')).not.toBeInTheDocument()
    expect(zonesService.list).not.toHaveBeenCalled()
  })

  it('exige elegir el día y no calcula sin él', async () => {
    const getProposals = mockApi()
    const { user } = renderPlanningPage()
    await setDate('')

    await user.click(screen.getByRole('button', { name: 'Previsualizar rutas' }))

    expect(screen.getByText('Elige el día a planificar')).toBeInTheDocument()
    expect(getProposals).not.toHaveBeenCalled()
  })

  it('calcula la propuesta solo con el día elegido', async () => {
    const getProposals = mockApi()
    const { user } = renderPlanningPage()
    await setDate()

    await user.click(screen.getByRole('button', { name: 'Previsualizar rutas' }))

    await waitFor(() => expect(getProposals).toHaveBeenCalledWith({ date: '2030-02-14' }))
  })

  it('muestra una indicación de carga mientras se calcula', async () => {
    const pending = deferred<RouteProposalsResponse>()
    mockApi()
    vi.spyOn(planningService, 'getProposals').mockReturnValue(pending.promise)
    const { user } = renderPlanningPage()
    await setDate()

    await user.click(screen.getByRole('button', { name: 'Previsualizar rutas' }))

    expect(await screen.findByText('Calculando la propuesta de rutas...')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Calculando...' })).toBeDisabled()
    pending.resolve(proposalsResponse)
    expect(await screen.findByRole('heading', { name: /Rutas propuestas/ })).toBeInTheDocument()
  })

  it('deja claro que es una vista previa y que las distancias son estimadas en línea recta', async () => {
    mockApi()
    const { user } = renderPlanningPage()

    await preview(user)

    expect(screen.getByText(/Las rutas no se guardan hasta que confirmes/)).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('Km geodésicos estimados')
    expect(screen.getByRole('note')).toHaveTextContent('en línea recta')
  })

  it('muestra el resumen del día con el ahorro frente a no optimizar', async () => {
    mockApi()
    const { user } = renderPlanningPage()

    await preview(user)

    const summary = within(screen.getByLabelText('Resumen de la propuesta del día'))
    expect(summary.getByText('Pedidos planificados').nextSibling).toHaveTextContent('5')
    expect(summary.getByText('Km sin optimizar (en línea recta)').nextSibling).toHaveTextContent(
      '8,40 km',
    )
    expect(summary.getByText('Ahorro estimado').nextSibling).toHaveTextContent(/4,70 km/)
  })

  it('lista las rutas con su capacidad, paradas y ahorro, y las envía al mapa', async () => {
    mockApi()
    const { user } = renderPlanningPage()

    await preview(user)

    expect(card('Ruta 1').getByText('3/4 paradas')).toBeInTheDocument()
    expect(card('Ruta 1').getByText('Dirección de order-a', { exact: false })).toBeInTheDocument()
    expect(card('Ruta 2').getByText('2/4 paradas')).toBeInTheDocument()
    expect(card('Ruta 2').getByText('Ahorro estimado').nextSibling).toHaveTextContent(
      '1,20 km (50 %)',
    )
    expect(screen.getByRole('button', { name: 'Mapa: Ruta 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mapa: Ruta 2' })).toBeInTheDocument()
  })

  it('lista los pedidos excluidos con el motivo en español', async () => {
    mockApi()
    const { user } = renderPlanningPage()

    await preview(user)

    await user.click(screen.getByRole('button', { name: 'Ver pedidos excluidos' }))
    expect(screen.getByRole('heading', { name: 'Pedidos excluidos (1)' })).toBeInTheDocument()
    expect(screen.getByText(/La zona no tiene depósito configurado/)).toBeInTheDocument()
  })

  it('indica cuando no hay pedidos que planificar', async () => {
    mockApi(emptyProposalsResponse)
    const { user } = renderPlanningPage()
    await setDate()

    await user.click(screen.getByRole('button', { name: 'Previsualizar rutas' }))

    expect(
      await screen.findByText('No hay pedidos pendientes para planificar en esta fecha.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Confirmar/ })).not.toBeInTheDocument()
  })

  it('muestra el error si no se puede calcular y no deja resultados anteriores', async () => {
    const getProposals = mockApi()
    const { user } = renderPlanningPage()
    await preview(user)
    getProposals.mockRejectedValueOnce(new AxiosError('timeout', 'ECONNABORTED'))

    await user.click(screen.getByRole('button', { name: 'Previsualizar rutas' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El servidor tardó demasiado en responder',
    )
    expect(screen.queryByRole('heading', { name: /Rutas propuestas/ })).not.toBeInTheDocument()
  })

  it('calcular dos veces solo vuelve a consultar: no confirma ni guarda nada', async () => {
    const getProposals = mockApi()
    const confirmRoute = vi.spyOn(planningService, 'confirmRoute')
    const { user } = renderPlanningPage()

    await preview(user)
    await user.click(screen.getByRole('button', { name: 'Previsualizar rutas' }))
    await screen.findByRole('heading', { name: /Rutas propuestas/ })

    expect(getProposals).toHaveBeenCalledTimes(2)
    expect(confirmRoute).not.toHaveBeenCalled()
  })

  it('al calcular de nuevo se descartan las confirmaciones del resultado anterior', async () => {
    mockApi()
    vi.spyOn(planningService, 'confirmRoute').mockResolvedValue(savedDraft())
    const { user } = renderPlanningPage()
    await preview(user)
    await user.click(card('Ruta 1').getByRole('button', { name: 'Confirmar ruta' }))
    await card('Ruta 1').findByText('Guardada como borrador')

    await user.click(screen.getByRole('button', { name: 'Previsualizar rutas' }))

    expect(
      await card('Ruta 1').findByRole('button', { name: 'Confirmar ruta' }),
    ).toBeInTheDocument()
  })

  it('resalta una ruta desde la lista y desde el mapa', async () => {
    mockApi()
    const { user } = renderPlanningPage()
    await preview(user)

    await user.click(card('Ruta 1').getByRole('button', { name: 'Resaltar en el mapa' }))
    expect(card('Ruta 1').getByRole('button', { name: 'Quitar resaltado' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await user.click(screen.getByRole('button', { name: 'Mapa: Ruta 2' }))
    expect(card('Ruta 2').getByRole('button', { name: 'Quitar resaltado' })).toBeInTheDocument()
    expect(card('Ruta 1').getByRole('button', { name: 'Resaltar en el mapa' })).toBeInTheDocument()

    await user.click(card('Ruta 2').getByRole('button', { name: 'Quitar resaltado' }))
    expect(screen.getByTestId('routes-map')).toHaveAttribute('data-selected', '')
  })
})

describe('PlanningPage · confirmar', () => {
  it('confirma una ruta: persiste un DRAFT y no vuelve a ofrecer confirmarla', async () => {
    mockApi()
    const confirmRoute = vi.spyOn(planningService, 'confirmRoute').mockResolvedValue(savedDraft())
    const { user } = renderPlanningPage()
    await preview(user)

    await user.click(card('Ruta 1').getByRole('button', { name: 'Confirmar ruta' }))

    expect(await card('Ruta 1').findByText('Guardada como borrador')).toBeInTheDocument()
    expect(confirmRoute).toHaveBeenCalledOnce()
    expect(confirmRoute).toHaveBeenCalledWith({
      zoneId: 'zone-1',
      routeDate: '2030-02-14T15:00:00Z',
      orderIds: ['order-a', 'order-b', 'order-c'],
    })
    expect(card('Ruta 1').queryByRole('button', { name: 'Confirmar ruta' })).not.toBeInTheDocument()
    expect(card('Ruta 2').getByRole('button', { name: 'Confirmar ruta' })).toBeInTheDocument()
  })

  it('un doble clic confirma la ruta una sola vez', async () => {
    mockApi()
    const pending = deferred<ReturnType<typeof savedDraft>>()
    const confirmRoute = vi.spyOn(planningService, 'confirmRoute').mockReturnValue(pending.promise)
    const { user } = renderPlanningPage()
    await preview(user)

    await user.dblClick(card('Ruta 1').getByRole('button', { name: 'Confirmar ruta' }))

    expect(confirmRoute).toHaveBeenCalledOnce()
    expect(card('Ruta 1').getByRole('button', { name: 'Guardando...' })).toBeDisabled()
    pending.resolve(savedDraft())
    await card('Ruta 1').findByText('Guardada como borrador')
  })

  it.each([
    {
      caso: 'un conflicto (409)',
      error: createHttpError(409, { data: { message: 'Pedido ya reservado' } }),
      mensaje: /Conflicto: Pedido ya reservado\. Vuelve a previsualizar/,
    },
    {
      caso: 'falta de permisos (403)',
      error: createHttpError(403),
      mensaje: 'No tienes permisos para confirmar rutas.',
    },
    {
      caso: 'un tiempo de espera agotado',
      error: new AxiosError('timeout', 'ECONNABORTED'),
      mensaje: 'El servidor tardó demasiado en responder',
    },
  ])(
    'ante $caso muestra el error, no marca la ruta como guardada y deja reintentar',
    async ({ error, mensaje }) => {
      mockApi()
      const confirmRoute = vi
        .spyOn(planningService, 'confirmRoute')
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(savedDraft())
      const { user } = renderPlanningPage()
      await preview(user)

      await user.click(card('Ruta 1').getByRole('button', { name: 'Confirmar ruta' }))

      expect(await card('Ruta 1').findByRole('alert')).toHaveTextContent(mensaje)
      expect(card('Ruta 1').queryByText('Guardada como borrador')).not.toBeInTheDocument()

      await user.click(card('Ruta 1').getByRole('button', { name: 'Confirmar ruta' }))

      expect(await card('Ruta 1').findByText('Guardada como borrador')).toBeInTheDocument()
      expect(confirmRoute).toHaveBeenCalledTimes(2)
    },
  )

  it('confirma todas las rutas y luego indica que están guardadas', async () => {
    mockApi()
    const confirmRoute = vi.spyOn(planningService, 'confirmRoute').mockResolvedValue(savedDraft())
    const { user } = renderPlanningPage()
    await preview(user)

    await user.click(screen.getByRole('button', { name: 'Confirmar todas (2)' }))

    expect(
      await screen.findByRole('button', { name: 'Todas las rutas están guardadas' }),
    ).toBeDisabled()
    expect(confirmRoute).toHaveBeenCalledTimes(2)
    expect(screen.getAllByText('Guardada como borrador')).toHaveLength(2)
  })

  it('si una de varias falla, las demás se guardan y solo queda pendiente la fallida', async () => {
    mockApi()
    vi.spyOn(planningService, 'confirmRoute')
      .mockResolvedValueOnce(savedDraft())
      .mockRejectedValueOnce(createHttpError(409, { data: { message: 'reservado' } }))
    const { user } = renderPlanningPage()
    await preview(user)

    await user.click(screen.getByRole('button', { name: 'Confirmar todas (2)' }))

    expect(await screen.findByRole('button', { name: 'Confirmar todas (1)' })).toBeEnabled()
    expect(card('Ruta 1').getByText('Guardada como borrador')).toBeInTheDocument()
    expect(card('Ruta 2').getByRole('alert')).toHaveTextContent('Conflicto: reservado')
  })
})

describe('PlanningPage · rutas guardadas', () => {
  const FIRST = 'Ruta guardada 1 · FIC-02'
  const savedItem = (name: string) => within(screen.getByRole('listitem', { name }))

  it('tras confirmar, la ruta aparece entre las guardadas del día como borrador', async () => {
    mockApi()
    // Lectura inicial y relectura al abrir el panel: ambas sin rutas; después de confirmar, ya hay una.
    vi.spyOn(planningService, 'listRoutes')
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValue([savedRouteDetail('route-1')])
    vi.spyOn(planningService, 'confirmRoute').mockResolvedValue(savedDraft())
    const { user } = renderPlanningPage()
    await preview(user)
    await openSaved(user)
    expect(await screen.findByText('Aún no hay rutas guardadas para este día.')).toBeInTheDocument()

    await user.click(card('Ruta 1').getByRole('button', { name: 'Confirmar ruta' }))

    expect(await screen.findByRole('listitem', { name: FIRST })).toHaveTextContent(
      'Borrador (DRAFT)',
    )
  })

  it('asigna un chofer disponible a un borrador y muestra la ruta como asignada', async () => {
    mockApi()
    vi.spyOn(driversService, 'list').mockResolvedValue([availableDriver])
    const listRoutes = vi
      .spyOn(planningService, 'listRoutes')
      .mockResolvedValueOnce([savedRouteDetail('route-1')])
      .mockResolvedValueOnce([savedRouteDetail('route-1')])
      .mockResolvedValue([
        savedRouteDetail('route-1', { status: 'ASSIGNED', driverName: 'Carlos Chofer' }),
      ])
    const assignDriver = vi.spyOn(planningService, 'assignDriver').mockResolvedValue(savedDraft())
    const { user } = renderPlanningPage()
    await preview(user)
    await openSaved(user)

    await user.selectOptions(
      await screen.findByLabelText('Chofer para Ruta guardada 1 · FIC-02'),
      'driver-1',
    )
    await user.click(savedItem(FIRST).getByRole('button', { name: 'Asignar chofer' }))

    expect(await savedItem(FIRST).findByText('Asignada (ASSIGNED)')).toBeInTheDocument()
    expect(savedItem(FIRST).getByText('Chofer: Carlos Chofer')).toBeInTheDocument()
    expect(assignDriver).toHaveBeenCalledWith('route-1', 'driver-1')
    expect(listRoutes).toHaveBeenCalledTimes(3)
  })

  it('si la asignación falla lo explica y la ruta sigue como borrador', async () => {
    mockApi()
    vi.spyOn(driversService, 'list').mockResolvedValue([availableDriver])
    vi.spyOn(planningService, 'listRoutes').mockResolvedValue([savedRouteDetail('route-1')])
    vi.spyOn(planningService, 'assignDriver').mockRejectedValue(
      createHttpError(409, { data: { message: 'Driver is not available' } }),
    )
    const { user } = renderPlanningPage()
    await preview(user)
    await openSaved(user)

    await user.selectOptions(
      await screen.findByLabelText('Chofer para Ruta guardada 1 · FIC-02'),
      'driver-1',
    )
    await user.click(savedItem(FIRST).getByRole('button', { name: 'Asignar chofer' }))

    expect(await savedItem(FIRST).findByRole('alert')).toHaveTextContent(
      'Conflicto: Driver is not available. El chofer o la ruta cambiaron',
    )
    expect(savedItem(FIRST).getByText('Borrador (DRAFT)')).toBeInTheDocument()
  })

  it('libera un borrador de hoy sin chofer: relee las rutas guardadas y recalcula los pedidos disponibles (#70)', async () => {
    const getProposals = mockApi()
    vi.spyOn(driversService, 'list').mockResolvedValue([availableDriver])
    const listRoutes = vi
      .spyOn(planningService, 'listRoutes')
      .mockResolvedValueOnce([savedRouteDetail('route-1')])
      .mockResolvedValueOnce([savedRouteDetail('route-1')])
      .mockResolvedValue([savedRouteDetail('route-1', { orders: [] })])
    const releaseDraft = vi
      .spyOn(dispatchService, 'releaseDraft')
      .mockResolvedValue(auditRecord({ action: 'RELEASE_DRAFT', outcome: 'APPLIED' }))
    const { user } = renderPlanningPage()
    await preview(user)
    expect(getProposals).toHaveBeenCalledTimes(1)
    await openSaved(user)

    await user.click(await savedItem(FIRST).findByRole('button', { name: 'Liberar borrador' }))
    await user.type(
      savedItem(FIRST).getByLabelText('Motivo para liberar Ruta guardada 1 · FIC-02'),
      'El cliente cambió la hora',
    )
    await user.click(savedItem(FIRST).getByRole('button', { name: 'Confirmar liberación' }))

    await waitFor(() => expect(getProposals).toHaveBeenCalledTimes(2))
    expect(releaseDraft).toHaveBeenCalledTimes(1)
    expect(releaseDraft).toHaveBeenCalledWith('route-1', 'El cliente cambió la hora')
    expect(getProposals).toHaveBeenLastCalledWith(getProposals.mock.calls[0][0])
    expect(listRoutes).toHaveBeenCalledTimes(3)
    // Sigue siendo un borrador (no se cancela la ruta) pero ya sin paradas.
    expect(await savedItem(FIRST).findByText('Borrador (DRAFT)')).toBeInTheDocument()
    expect(savedItem(FIRST).queryByText('Parada 1 de route-1')).not.toBeInTheDocument()
  })

  it('si la API rechaza liberar el borrador lo explica, no recalcula y no lo da por liberado (#70)', async () => {
    const getProposals = mockApi()
    vi.spyOn(driversService, 'list').mockResolvedValue([availableDriver])
    vi.spyOn(planningService, 'listRoutes').mockResolvedValue([savedRouteDetail('route-1')])
    vi.spyOn(dispatchService, 'releaseDraft').mockRejectedValue(
      createHttpError(409, {
        data: { statusCode: 409, code: 'DRAFT_NOT_RELEASABLE', message: 'x', error: 'Conflict' },
      }),
    )
    const { user } = renderPlanningPage()
    await preview(user)
    await openSaved(user)

    await user.click(await savedItem(FIRST).findByRole('button', { name: 'Liberar borrador' }))
    await user.type(
      savedItem(FIRST).getByLabelText('Motivo para liberar Ruta guardada 1 · FIC-02'),
      'El cliente cambió la hora',
    )
    await user.click(savedItem(FIRST).getByRole('button', { name: 'Confirmar liberación' }))

    expect(await savedItem(FIRST).findByRole('alert')).toHaveTextContent(
      'Este borrador ya no se puede liberar',
    )
    expect(savedItem(FIRST).getByRole('button', { name: 'Confirmar liberación' })).toBeInTheDocument()
    expect(savedItem(FIRST).getByText('Parada 1 de route-1')).toBeInTheDocument()
    expect(getProposals).toHaveBeenCalledTimes(1)
  })

  it('al abrir el panel se vuelve a leer: una ruta que el chofer ya terminó deja de ser editable', async () => {
    mockApi()
    vi.spyOn(driversService, 'list').mockResolvedValue([availableDriver])
    vi.spyOn(planningService, 'listRoutes')
      .mockResolvedValueOnce([
        savedRouteDetail('route-1', { status: 'ASSIGNED', driverName: 'Carlos Chofer' }),
      ])
      .mockResolvedValue([
        savedRouteDetail('route-1', { status: 'COMPLETED', driverName: 'Carlos Chofer' }),
      ])
    const { user } = renderPlanningPage()
    await preview(user)

    await openSaved(user)

    const item = await screen.findByRole('listitem', { name: FIRST })
    await within(item).findByText('Completada (COMPLETED)')
    expect(within(item).queryByRole('button')).not.toBeInTheDocument()
    expect(within(item).queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('las rutas en curso o completadas se muestran sin ninguna acción', async () => {
    mockApi()
    vi.spyOn(driversService, 'list').mockResolvedValue([availableDriver])
    vi.spyOn(planningService, 'listRoutes').mockResolvedValue([
      savedRouteDetail('r1', { zoneCode: 'HUA-03', status: 'IN_PROGRESS', driverName: 'Ana' }),
      savedRouteDetail('r2', { zoneCode: 'CEN-01', status: 'COMPLETED', driverName: 'Ana' }),
    ])
    const { user } = renderPlanningPage()
    await preview(user)
    await openSaved(user)

    for (const name of ['Ruta guardada 1 · HUA-03', 'Ruta guardada 2 · CEN-01']) {
      const item = await screen.findByRole('listitem', { name })
      expect(within(item).queryByRole('button')).not.toBeInTheDocument()
      expect(within(item).queryByRole('combobox')).not.toBeInTheDocument()
    }
  })

  it('corrige el orden de una ruta guardada y muestra la lista actualizada', async () => {
    mockApi()
    const listRoutes = vi
      .spyOn(planningService, 'listRoutes')
      .mockResolvedValueOnce([savedRouteDetail('route-1')])
      .mockResolvedValueOnce([savedRouteDetail('route-1')])
      .mockResolvedValue([
        savedRouteDetail('route-1', {
          orders: [
            { id: 'route-1-o2', deliveryAddress: 'Parada 2 de route-1', stopOrder: 1 },
            { id: 'route-1-o1', deliveryAddress: 'Parada 1 de route-1', stopOrder: 2 },
          ],
        }),
      ])
    const reorderStops = vi.spyOn(dispatchService, 'reorderStops').mockResolvedValue(auditRecord())
    const { user } = renderPlanningPage()
    await preview(user)
    await openSaved(user)

    await user.click(await screen.findByRole('button', { name: 'Corregir paradas' }))
    const panel = within(screen.getByRole('group', { name: `Corregir ${FIRST}` }))
    await user.click(panel.getByRole('button', { name: 'Bajar Parada 1 de route-1' }))
    await user.type(panel.getByLabelText(`Motivo de la corrección de ${FIRST}`), 'Calle cerrada')
    await user.click(panel.getByRole('button', { name: 'Guardar nuevo orden' }))

    await waitFor(() =>
      expect(
        within(savedItem(FIRST).getByRole('list'))
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual(['Parada 2 de route-1', 'Parada 1 de route-1']),
    )
    expect(reorderStops).toHaveBeenCalledWith({
      routeId: 'route-1',
      orderIds: ['route-1-o2', 'route-1-o1'],
      reason: 'Calle cerrada',
    })
    expect(listRoutes).toHaveBeenCalledTimes(3)
  })

  it('mueve un pedido a otra ruta guardada del mismo día y zona', async () => {
    mockApi()
    vi.spyOn(planningService, 'listRoutes').mockResolvedValue([
      savedRouteDetail('route-1'),
      savedRouteDetail('route-2', {
        orders: [{ id: 'route-2-o1', deliveryAddress: 'Parada 1 de route-2', stopOrder: 1 }],
      }),
    ])
    const moveOrder = vi
      .spyOn(dispatchService, 'moveOrder')
      .mockResolvedValue(auditRecord({ id: 'audit-2', action: 'MOVE' }))
    const { user } = renderPlanningPage()
    await preview(user)
    await openSaved(user)

    await user.click((await screen.findAllByRole('button', { name: 'Corregir paradas' }))[0])
    const panel = within(screen.getByRole('group', { name: `Corregir ${FIRST}` }))
    await user.selectOptions(panel.getByLabelText(`Pedido a mover de ${FIRST}`), 'route-1-o2')
    await user.selectOptions(
      panel.getByLabelText(`Ruta destino para ${FIRST}`),
      'Ruta guardada 2 · FIC-02',
    )
    await user.type(panel.getByLabelText(`Motivo de la corrección de ${FIRST}`), 'Equilibrar')
    await user.click(panel.getByRole('button', { name: 'Mover pedido' }))

    await waitFor(() =>
      expect(screen.queryByRole('group', { name: `Corregir ${FIRST}` })).not.toBeInTheDocument(),
    )
    expect(moveOrder).toHaveBeenCalledWith({
      routeId: 'route-1',
      orderId: 'route-1-o2',
      targetRouteId: 'route-2',
      reason: 'Equilibrar',
    })
  })

  it('si la ruta ya se inició, la corrección se rechaza, se explica y no se da por hecha', async () => {
    mockApi()
    vi.spyOn(planningService, 'listRoutes').mockResolvedValue([savedRouteDetail('route-1')])
    vi.spyOn(dispatchService, 'reorderStops').mockRejectedValue(
      createHttpError(409, { data: { message: 'Route structure is frozen' } }),
    )
    const { user } = renderPlanningPage()
    await preview(user)
    await openSaved(user)

    await user.click(await screen.findByRole('button', { name: 'Corregir paradas' }))
    const panel = within(screen.getByRole('group', { name: `Corregir ${FIRST}` }))
    await user.click(panel.getByRole('button', { name: 'Bajar Parada 1 de route-1' }))
    await user.type(panel.getByLabelText(`Motivo de la corrección de ${FIRST}`), 'x')
    await user.click(panel.getByRole('button', { name: 'Guardar nuevo orden' }))

    expect(await panel.findByRole('alert')).toHaveTextContent(
      'Conflicto: Route structure is frozen. La ruta cambió o ya no se puede modificar',
    )
    expect(screen.getByRole('group', { name: `Corregir ${FIRST}` })).toBeInTheDocument()
  })
})

describe('PlanningPage · capacidad del vehículo', () => {
  it('carga los choferes del día elegido antes de previsualizar, reenvía driverId a GET y POST borrador, muestra loadUnits y sugiere alternativas', async () => {
    const driverCap4 = {
      ...availableDriver,
      id: 'd-4',
      name: 'Ana Moto',
      vehicle: 'Moto',
      vehicleCapacity: null,
    }
    const driverCap6 = {
      ...availableDriver,
      id: 'd-6',
      name: 'Carlos Furgón',
      vehicle: 'Furgón',
      vehicleCapacity: 6,
    }
    const listForDay = vi
      .spyOn(driversService, 'listForDay')
      .mockResolvedValue([driverCap4, driverCap6])
    const response: RouteProposalsResponse = {
      ...proposalsResponse,
      capacity: 4,
      proposals: [{ ...proposalsResponse.proposals[0], stops: proposalsResponse.proposals[0].stops.slice(0, 1), orderIds: ['order-a'], loadUnits: 3 }],
      excluded: [
        {
          orderId: 'order-big-5555',
          zoneId: 'zone-1',
          reasons: ['VEHICLE_CAPACITY_EXCEEDED'],
          requiredUnits: 5,
        },
      ],
    }
    const getProposals = mockApi(response)
    const confirmRoute = vi.spyOn(planningService, 'confirmRoute').mockResolvedValue(savedDraft())
    const { user } = renderPlanningPage()

    await setDate('2030-02-14')
    await waitFor(() => expect(listForDay).toHaveBeenCalledWith('2030-02-14'))

    const driverSelect = await screen.findByLabelText('Chofer para planificar')
    await waitFor(() => expect(within(driverSelect).getByText(/Ana Moto/)).toBeInTheDocument())
    await user.selectOptions(driverSelect, 'd-4')
    await user.click(screen.getByRole('button', { name: 'Previsualizar rutas' }))

    await waitFor(() =>
      expect(getProposals).toHaveBeenCalledWith({ date: '2030-02-14', driverId: 'd-4' }),
    )
    expect(card('Ruta 1').getByText('3/4 unidades')).toBeInTheDocument()

    await user.click(card('Ruta 1').getByRole('button', { name: 'Confirmar ruta' }))
    expect(confirmRoute).toHaveBeenCalledWith({
      zoneId: 'zone-1',
      routeDate: '2030-02-14T15:00:00Z',
      orderIds: ['order-a'],
      driverId: 'd-4',
    })
    expect(await card('Ruta 1').findByText('Guardada como borrador')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Ver pedidos excluidos' }))
    const dialog = await screen.findByRole('dialog', { name: 'Pedidos excluidos (1)' })
    const excludedItem = within(dialog).getByRole('listitem')
    expect(excludedItem).toHaveTextContent(/5 unidades/)
    expect(excludedItem).toHaveTextContent(/Carlos Furgón/)
    expect(excludedItem).toHaveTextContent(/no garantiza/)
  })

  it('si confirmar borrador responde 409 VEHICLE_CAPACITY_EXCEEDED explica capacidad y unidades sin guardar', async () => {
    vi.spyOn(driversService, 'listForDay').mockResolvedValue([
      { ...availableDriver, id: 'd-4', name: 'Ana Moto', vehicleCapacity: 4 },
    ])
    mockApi()
    vi.spyOn(planningService, 'confirmRoute').mockRejectedValue(
      createHttpError(409, {
        data: {
          statusCode: 409,
          code: 'VEHICLE_CAPACITY_EXCEEDED',
          message: 'Vehicle capacity exceeded',
          capacity: 4,
          requiredUnits: 6,
        },
      }),
    )
    const { user } = renderPlanningPage()
    await setDate('2030-02-14')
    const driverSelect = await screen.findByLabelText('Chofer para planificar')
    await waitFor(() => expect(within(driverSelect).getByText(/Ana Moto/)).toBeInTheDocument())
    await user.selectOptions(driverSelect, 'd-4')
    await user.click(screen.getByRole('button', { name: 'Previsualizar rutas' }))
    await screen.findByRole('heading', { name: /Rutas propuestas/ })

    await user.click(card('Ruta 1').getByRole('button', { name: 'Confirmar ruta' }))

    expect(await card('Ruta 1').findByRole('alert')).toHaveTextContent(/6 unidades.*4 unidades/)
    expect(card('Ruta 1').queryByText('Guardada como borrador')).not.toBeInTheDocument()
  })
})

describe('PlanningPage · cancelar ruta asignada', () => {
  const FIRST = 'Ruta guardada 1 · FIC-02'
  const assignedRoute = () =>
    savedRouteDetail('route-1', {
      status: 'ASSIGNED',
      driverId: 'driver-1',
      driverName: 'Carlos Chofer',
      startedAt: null,
    })

  it('cancela una ruta ASSIGNED con motivo y recarga rutas y choferes', async () => {
    mockApi()
    const assigned = assignedRoute()
    const listRoutes = vi
      .spyOn(planningService, 'listRoutes')
      .mockResolvedValueOnce([assigned])
      .mockResolvedValueOnce([assigned])
      .mockResolvedValueOnce([{ ...assigned, status: 'CANCELLED' }])
    const listDrivers = vi.spyOn(driversService, 'list').mockResolvedValue([availableDriver])
    const cancelRoute = vi
      .spyOn(dispatchService, 'cancelRoute')
      .mockResolvedValue(auditRecord({ action: 'CANCEL_ROUTE', routeId: 'route-1' }))
    const { user } = renderPlanningPage()
    await preview(user)
    await openSaved(user)

    const item = within(await screen.findByRole('listitem', { name: FIRST }))
    await user.click(item.getByRole('button', { name: 'Cancelar ruta' }))
    const dialog = within(item.getByRole('group', { name: `Cancelar ${FIRST}` }))
    await user.type(dialog.getByLabelText(`Motivo para cancelar ${FIRST}`), 'Camión con falla')
    await user.click(dialog.getByRole('button', { name: 'Confirmar cancelación' }))

    await waitFor(() =>
      expect(cancelRoute).toHaveBeenCalledWith('route-1', 'Camión con falla'),
    )
    await waitFor(() => expect(listRoutes).toHaveBeenCalledTimes(3))
    expect(listDrivers.mock.calls.length).toBeGreaterThanOrEqual(3)
    expect(await item.findByText('Cancelada (CANCELLED)')).toBeInTheDocument()
    expect(item.queryByRole('button', { name: 'Cancelar ruta' })).not.toBeInTheDocument()
  })

  it('si cancelar responde 409 ROUTE_ALREADY_STARTED revalida rutas y choferes, quita controles al pasar a IN_PROGRESS y conserva el error en la tarjeta', async () => {
    mockApi()
    const assigned = assignedRoute()
    const listRoutes = vi
      .spyOn(planningService, 'listRoutes')
      .mockResolvedValueOnce([assigned])
      .mockResolvedValueOnce([assigned])
      .mockResolvedValueOnce([
        { ...assigned, status: 'IN_PROGRESS', startedAt: '2030-02-14T15:10:00Z' },
      ])
    const listDrivers = vi.spyOn(driversService, 'list').mockResolvedValue([availableDriver])
    vi.spyOn(dispatchService, 'cancelRoute').mockRejectedValue(
      createHttpError(409, {
        data: { statusCode: 409, code: 'ROUTE_ALREADY_STARTED', message: 'Route already started' },
      }),
    )
    const { user } = renderPlanningPage()
    await preview(user)
    await openSaved(user)

    const item = within(await screen.findByRole('listitem', { name: FIRST }))
    await user.click(item.getByRole('button', { name: 'Cancelar ruta' }))
    const dialog = within(item.getByRole('group', { name: `Cancelar ${FIRST}` }))
    await user.type(dialog.getByLabelText(`Motivo para cancelar ${FIRST}`), 'Reorganización de salida')
    await user.click(dialog.getByRole('button', { name: 'Confirmar cancelación' }))

    await waitFor(() => expect(listRoutes).toHaveBeenCalledTimes(3))
    expect(listDrivers.mock.calls.length).toBeGreaterThanOrEqual(3)
    expect(await item.findByText('En curso (IN_PROGRESS)')).toBeInTheDocument()
    expect(item.queryByRole('group', { name: `Cancelar ${FIRST}` })).not.toBeInTheDocument()
    expect(item.queryByRole('button', { name: 'Cancelar ruta' })).not.toBeInTheDocument()
    expect(item.queryByRole('button', { name: 'Confirmar cancelación' })).not.toBeInTheDocument()
    expect(item.getByRole('alert')).toHaveTextContent(/ya se inició/)
  })

  it('si cancelar responde 409 ROUTE_ALREADY_CANCELLED revalida rutas y choferes, muestra CANCELLED sin reintento y conserva el error en la tarjeta', async () => {
    mockApi()
    const assigned = assignedRoute()
    const listRoutes = vi
      .spyOn(planningService, 'listRoutes')
      .mockResolvedValueOnce([assigned])
      .mockResolvedValueOnce([assigned])
      .mockResolvedValueOnce([
        {
          ...assigned,
          status: 'CANCELLED',
          cancelledAt: '2030-02-14T15:12:00Z',
          cancelledById: 'admin-2',
          cancellationReason: 'Anulada desde otra sesión',
        },
      ])
    const listDrivers = vi.spyOn(driversService, 'list').mockResolvedValue([availableDriver])
    vi.spyOn(dispatchService, 'cancelRoute').mockRejectedValue(
      createHttpError(409, {
        data: {
          statusCode: 409,
          code: 'ROUTE_ALREADY_CANCELLED',
          message: 'Route already cancelled',
        },
      }),
    )
    const { user } = renderPlanningPage()
    await preview(user)
    await openSaved(user)

    const item = within(await screen.findByRole('listitem', { name: FIRST }))
    await user.click(item.getByRole('button', { name: 'Cancelar ruta' }))
    const dialog = within(item.getByRole('group', { name: `Cancelar ${FIRST}` }))
    await user.type(dialog.getByLabelText(`Motivo para cancelar ${FIRST}`), 'Duplicada')
    await user.click(dialog.getByRole('button', { name: 'Confirmar cancelación' }))

    await waitFor(() => expect(listRoutes).toHaveBeenCalledTimes(3))
    expect(listDrivers.mock.calls.length).toBeGreaterThanOrEqual(3)
    expect(await item.findByText('Cancelada (CANCELLED)')).toBeInTheDocument()
    expect(item.getByText(/Cancelada por: admin-2/)).toBeInTheDocument()
    expect(item.queryByRole('group', { name: `Cancelar ${FIRST}` })).not.toBeInTheDocument()
    expect(item.queryByRole('button')).not.toBeInTheDocument()
    expect(item.getByRole('alert')).toHaveTextContent(/ya estaba cancelada/)
  })

  it('si cancelar responde 404 revalida rutas y choferes, quita la ruta inexistente y muestra el error en la superficie', async () => {
    mockApi()
    const assigned = assignedRoute()
    const listRoutes = vi
      .spyOn(planningService, 'listRoutes')
      .mockResolvedValueOnce([assigned])
      .mockResolvedValueOnce([assigned])
      .mockResolvedValueOnce([])
    const listDrivers = vi.spyOn(driversService, 'list').mockResolvedValue([availableDriver])
    vi.spyOn(dispatchService, 'cancelRoute').mockRejectedValue(createHttpError(404))
    const { user } = renderPlanningPage()
    await preview(user)
    await openSaved(user)

    const item = within(await screen.findByRole('listitem', { name: FIRST }))
    await user.click(item.getByRole('button', { name: 'Cancelar ruta' }))
    const dialog = within(item.getByRole('group', { name: `Cancelar ${FIRST}` }))
    await user.type(dialog.getByLabelText(`Motivo para cancelar ${FIRST}`), 'Ruta ya eliminada')
    await user.click(dialog.getByRole('button', { name: 'Confirmar cancelación' }))

    await waitFor(() => expect(listRoutes).toHaveBeenCalledTimes(3))
    expect(listDrivers.mock.calls.length).toBeGreaterThanOrEqual(3)
    await waitFor(() =>
      expect(screen.queryByRole('listitem', { name: FIRST })).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/No se encontró la ruta/)
  })

  it('ante una falla reintentable (red/500) conserva el diálogo abierto, el motivo y no recarga innecesariamente', async () => {
    mockApi()
    const assigned = assignedRoute()
    const listRoutes = vi.spyOn(planningService, 'listRoutes').mockResolvedValue([assigned])
    vi.spyOn(dispatchService, 'cancelRoute').mockRejectedValue(new AxiosError('Network Error'))
    const { user } = renderPlanningPage()
    await preview(user)
    await openSaved(user)
    const callsBeforeSubmit = listRoutes.mock.calls.length

    const item = within(await screen.findByRole('listitem', { name: FIRST }))
    await user.click(item.getByRole('button', { name: 'Cancelar ruta' }))
    const dialog = within(item.getByRole('group', { name: `Cancelar ${FIRST}` }))
    const input = dialog.getByLabelText(`Motivo para cancelar ${FIRST}`)
    await user.type(input, 'Reorganización de salida')
    await user.click(dialog.getByRole('button', { name: 'Confirmar cancelación' }))

    expect(await dialog.findByRole('alert')).toHaveTextContent(/No se pudo conectar/)
    expect(input).toHaveValue('Reorganización de salida')
    expect(listRoutes).toHaveBeenCalledTimes(callsBeforeSubmit)
  })
})
