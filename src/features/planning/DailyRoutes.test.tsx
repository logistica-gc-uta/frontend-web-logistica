import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../../app/App'
import { paths } from '../../app/paths'
import { apiClient } from '../../lib/http/apiClient'
import { areaLabel } from '../../lib/planning/routeArea'
import { adminSession, zones } from '../../test/fixtures'
import { createHttpError, createHttpResponse } from '../../test/http'
import {
  availableDriver,
  firstProposal,
  proposalsResponse,
  savedRouteDetail,
} from '../../test/planningFixtures'
import { renderWithProviders } from '../../test/renderWithProviders'
import { adminSettings } from '../../test/catalogFixtures'
import { catalogService } from '../catalog/catalogService'
import { formFromSettings, settingsChanges, validateSettings } from '../catalog/settingsForm'
import { dispatchService } from '../dispatch/dispatchService'
import { monitorService } from '../monitor/monitorService'
import { zonesService } from '../zones/zonesService'
import {
  describeAssignError,
  describeConfirmError,
  ROUTE_DATE_NOT_TODAY_MESSAGE,
} from './confirmError'
import { driversService } from './driversService'
import { planningService } from './planningService'
import { SavedRoutes } from './SavedRoutes'
import type { RouteProposalsResponse } from './types'

vi.mock('../../components/map/RoutesMap', () => ({
  RoutesMap: () => <div data-testid="routes-map" />,
}))

const notToday = (status = 409) =>
  createHttpError(status, {
    data: { statusCode: 409, code: 'ROUTE_DATE_NOT_TODAY', message: 'x', routeDay: '2030-02-15' },
  })

/** Ruta tal como la devuelve `GET /routes` para una ruta sin zona (backend #49). */
const rawStoreRoute = {
  id: 'r-store',
  status: 'DRAFT',
  date: '2030-02-14T15:00:00Z',
  createdAt: '2030-02-14T12:00:00Z',
  zoneId: null,
  zone: null,
  driverId: null,
  driver: null,
  startedAt: null,
  completedAt: null,
  returnedAt: null,
  orders: [{ id: 'o1', deliveryAddress: 'Av. Cevallos', stopOrder: 1 }],
  stops: [{ id: 's1', orderId: 'o1', sequence: 1, outcome: 'PENDING', attempts: [] }],
}

describe('rutas sin zona (#49)', () => {
  it('se muestran como «Tienda» en planificación y en el monitoreo, sin romperse', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(createHttpResponse([rawStoreRoute]))

    const [saved] = await planningService.listRoutes()
    const [monitored] = await monitorService.listRoutes()

    expect(saved).toEqual(
      expect.objectContaining({ zoneId: null, zoneCode: 'Tienda', zoneName: 'Tienda' }),
    )
    expect(monitored.zoneCode).toBe('Tienda')
    expect(areaLabel('FIC-02')).toBe('FIC-02')
  })
})

describe('regla del día (#49)', () => {
  it('confirmar o asignar fuera del día de entrega se explica en español', () => {
    expect(describeConfirmError(notToday())).toBe(ROUTE_DATE_NOT_TODAY_MESSAGE)
    expect(describeAssignError(notToday())).toBe(ROUTE_DATE_NOT_TODAY_MESSAGE)
  })

  it('liberar un borrador envía RELEASE_DRAFT con su motivo', async () => {
    const post = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValue(createHttpResponse({ id: 'a1', outcome: 'APPLIED' }))

    await dispatchService.releaseDraft('r1', 'Quedó de ayer')

    expect(post).toHaveBeenCalledWith(
      '/dispatch/interventions',
      expect.objectContaining({ action: 'RELEASE_DRAFT', routeId: 'r1', reason: 'Quedó de ayer' }),
      expect.anything(),
    )
  })

  const renderSaved = (isToday: boolean, onRelease = vi.fn().mockResolvedValue(true)) => {
    const onAssign = vi.fn()
    render(
      <SavedRoutes
        day="2030-02-14"
        routes={[savedRouteDetail('r1'), savedRouteDetail('r2', { status: 'ASSIGNED' })]}
        drivers={[availableDriver]}
        actions={{}}
        onAssign={onAssign}
        onReassign={vi.fn()}
        onReorder={vi.fn()}
        onMove={vi.fn()}
        isToday={isToday}
        onRelease={onRelease}
      />,
    )
    return { onAssign, onRelease }
  }

  it('un borrador de otro día no se puede asignar y se puede liberar con motivo', async () => {
    const user = userEvent.setup()
    const { onRelease } = renderSaved(false)
    const draft = within(screen.getByRole('listitem', { name: 'Ruta guardada 1 · FIC-02' }))

    expect(draft.getByText(/no es de hoy: ya no se puede asignar/)).toBeInTheDocument()
    expect(draft.queryByRole('button', { name: 'Asignar chofer' })).not.toBeInTheDocument()

    await user.click(draft.getByRole('button', { name: 'Liberar borrador' }))
    expect(draft.getByText(/sus pedidos volverán a pendientes/)).toBeInTheDocument()
    await user.click(draft.getByRole('button', { name: 'Confirmar liberación' }))
    expect(draft.getByText('Escribe el motivo')).toBeInTheDocument()
    expect(onRelease).not.toHaveBeenCalled()

    await user.type(draft.getByLabelText(/Motivo para liberar Ruta guardada 1/), 'Quedó de ayer')
    await user.click(draft.getByRole('button', { name: 'Confirmar liberación' }))

    expect(onRelease).toHaveBeenCalledWith('r1', 'Quedó de ayer')
    // Una ruta con chofer no se libera.
    const assigned = within(screen.getByRole('listitem', { name: 'Ruta guardada 2 · FIC-02' }))
    expect(assigned.queryByRole('button', { name: 'Liberar borrador' })).not.toBeInTheDocument()
  })

  it('hoy el borrador se asigna como siempre y no ofrece liberarlo', () => {
    renderSaved(true)
    const draft = within(screen.getByRole('listitem', { name: 'Ruta guardada 1 · FIC-02' }))

    expect(draft.getByRole('button', { name: 'Asignar chofer' })).toBeInTheDocument()
    expect(draft.queryByRole('button', { name: 'Liberar borrador' })).not.toBeInTheDocument()
  })
})

describe('planificación del día y horarios (#48, #49)', () => {
  const futureDay: RouteProposalsResponse = {
    ...proposalsResponse,
    isToday: false,
    canConfirm: false,
    timeWindowMarginMinutes: 45,
    proposals: [{ ...firstProposal, zoneId: null, zoneCode: null }],
  }

  const renderPlanning = (response: RouteProposalsResponse) => {
    vi.spyOn(zonesService, 'list').mockResolvedValue(zones)
    vi.spyOn(planningService, 'listRoutes').mockResolvedValue([])
    vi.spyOn(planningService, 'roadEngine').mockRejectedValue(createHttpError(500))
    vi.spyOn(driversService, 'list').mockResolvedValue([])
    vi.spyOn(driversService, 'listForDay').mockResolvedValue([])
    vi.spyOn(planningService, 'getProposals').mockResolvedValue(response)
    return renderWithProviders(<App />, { route: paths.planning, session: adminSession })
  }

  it('otro día es solo vista previa: avisa y no ofrece confirmar', async () => {
    const { user } = renderPlanning(futureDay)
    await screen.findByRole('option', { name: /Ficoa/ })
    await user.click(screen.getByRole('button', { name: 'Previsualizar rutas' }))

    expect(
      await screen.findByText('Solo vista previa: no es el día de entrega.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirmar ruta' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Confirmar todas/ })).not.toBeInTheDocument()
    expect(screen.getByText('Solo vista previa', { selector: '.badge' })).toBeInTheDocument()
    // Sin zona, la ruta sale de la tienda.
    expect(screen.getByRole('heading', { name: 'Ruta 1 · Tienda' })).toBeInTheDocument()
  })

  it('explica el margen vigente de agrupación sin prometer la hora de entrega', async () => {
    const { user } = renderPlanning(futureDay)
    await screen.findByRole('option', { name: /Ficoa/ })
    await user.click(screen.getByRole('button', { name: 'Previsualizar rutas' }))

    const notice = (await screen.findByText('Horarios agrupados.')).closest('p')!
    expect(notice).toHaveTextContent('se diferencian en hasta 45 minutos')
    expect(notice).toHaveTextContent('máximo de 4 paradas')
    expect(notice).toHaveTextContent('no una promesa de entregar dentro de ±45 minutos')
  })

  it('hoy sí se puede confirmar', async () => {
    const { user } = renderPlanning(proposalsResponse)
    await screen.findByRole('option', { name: /Ficoa/ })
    await user.click(screen.getByRole('button', { name: 'Previsualizar rutas' }))

    expect(await screen.findAllByRole('button', { name: 'Confirmar ruta' })).toHaveLength(2)
    expect(screen.queryByText('Solo vista previa: no es el día de entrega.')).toBeNull()
  })
})

describe('margen configurable (#48)', () => {
  it('valida de 5 a 180 minutos y envía solo el margen cuando cambia', () => {
    const settings = adminSettings()
    const values = formFromSettings(settings)

    expect(values.marginMinutes).toBe('30')
    expect(validateSettings({ ...values, marginMinutes: '4' }).marginMinutes).toBe(
      'Escribe un entero de 5 a 180 minutos',
    )
    expect(validateSettings({ ...values, marginMinutes: '181' }).marginMinutes).toBeDefined()
    expect(validateSettings({ ...values, marginMinutes: '2.5' }).marginMinutes).toBeDefined()
    expect(settingsChanges({ ...values, marginMinutes: '45' }, settings)).toEqual({
      routePlanning: { timeWindowMarginMinutes: 45 },
    })
    expect(settingsChanges(values, settings)).toEqual({})
  })

  it('lee el margen del backend y usa 30 si un backend anterior no lo envía', async () => {
    const raw = {
      version: 3,
      shipping: { status: 'FREE_INCLUDED' },
      tax: { enabled: true, rateBps: 1500 },
      limits: { maxUnitsPerSkuPerOrder: 10 },
      deliverySchedule: { timeZone: 'America/Guayaquil', startTime: '07:00', endTime: '17:00' },
      updatedAt: '2030-01-01T00:00:00Z',
      updatedById: null,
    }
    const get = vi
      .spyOn(apiClient, 'get')
      .mockResolvedValueOnce(
        createHttpResponse({ ...raw, routePlanning: { timeWindowMarginMinutes: 60 } }),
      )
      .mockResolvedValueOnce(createHttpResponse(raw))

    expect((await catalogService.getSettings()).routeTimeWindowMarginMinutes).toBe(60)
    expect((await catalogService.getSettings()).routeTimeWindowMarginMinutes).toBe(30)
    expect(get).toHaveBeenCalledWith('/admin/shop-settings')
  })

  it('la pantalla de configuración muestra el margen y lo guarda con la versión', async () => {
    vi.spyOn(catalogService, 'getSettings').mockResolvedValue(adminSettings())
    const save = vi
      .spyOn(catalogService, 'saveSettings')
      .mockResolvedValue(adminSettings({ version: 6, routeTimeWindowMarginMinutes: 45 }))
    const { user } = renderWithProviders(<App />, {
      route: paths.shopSettings,
      session: adminSession,
    })

    const field = await screen.findByLabelText('Margen para agrupar horarios (minutos)')
    expect(field).toHaveValue('30')
    expect(screen.getByText(/no garantiza entregar dentro de ese margen/)).toBeInTheDocument()
    await user.clear(field)
    await user.type(field, '45')
    await user.click(screen.getByRole('button', { name: 'Guardar configuración' }))

    expect(save).toHaveBeenCalledWith(5, { routePlanning: { timeWindowMarginMinutes: 45 } })
    expect(await screen.findByText(/Configuración guardada \(versión 6\)/)).toBeInTheDocument()
  })
})
