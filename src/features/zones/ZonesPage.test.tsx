import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../../app/App'
import { paths } from '../../app/paths'
import { adminSession, zones } from '../../test/fixtures'
import { createHttpError } from '../../test/http'
import { renderWithProviders } from '../../test/renderWithProviders'
import { zonesService } from './zonesService'

const newZone = { id: 'zone-3', name: 'Centro', code: 'CEN-01', createdAt: '2026-10-09T12:00:00Z' }

const renderZonesPage = () =>
  renderWithProviders(<App />, { route: paths.zones, session: adminSession })

const getTable = () => screen.findByRole('table', { name: 'Zonas de entrega registradas' })
const getForm = () => screen.getByRole('form', { name: 'Nueva zona' })

const fillAndSubmit = async (user: ReturnType<typeof renderZonesPage>['user']) => {
  const form = getForm()
  await user.type(within(form).getByLabelText('Nombre'), ' Centro ')
  await user.type(within(form).getByLabelText('Código'), 'CEN-01')
  await user.click(within(form).getByRole('button', { name: 'Crear zona' }))
}

describe('ZonesPage', () => {
  it('lista las zonas registradas', async () => {
    vi.spyOn(zonesService, 'list').mockResolvedValue(zones)
    renderZonesPage()

    expect(screen.getByRole('status')).toHaveTextContent('Cargando zonas...')
    const table = await getTable()
    expect(within(table).getByText('Ficoa')).toBeInTheDocument()
    expect(within(table).getByText('HUA-03')).toBeInTheDocument()
    expect(within(table).getByText('07/10/2026')).toBeInTheDocument()
  })

  it('indica cuando no hay zonas registradas', async () => {
    vi.spyOn(zonesService, 'list').mockResolvedValue([])
    renderZonesPage()

    expect(await screen.findByText('Aún no hay zonas registradas')).toBeInTheDocument()
  })

  it('muestra un error si no se pueden cargar las zonas y permite reintentar', async () => {
    const list = vi
      .spyOn(zonesService, 'list')
      .mockRejectedValueOnce(createHttpError(500))
      .mockResolvedValueOnce(zones)
    const { user } = renderZonesPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar las zonas')
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await getTable()).toBeInTheDocument()
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('valida los campos obligatorios sin llamar al backend', async () => {
    vi.spyOn(zonesService, 'list').mockResolvedValue(zones)
    const create = vi.spyOn(zonesService, 'create')
    const { user } = renderZonesPage()

    await user.click(within(getForm()).getByRole('button', { name: 'Crear zona' }))

    expect(screen.getByText('El nombre de la zona es obligatorio')).toBeInTheDocument()
    expect(screen.getByText('El código de la zona es obligatorio')).toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
  })

  it('crea una zona, muestra confirmación, limpia el formulario y actualiza la lista', async () => {
    vi.spyOn(zonesService, 'list')
      .mockResolvedValueOnce(zones)
      .mockResolvedValueOnce([...zones, newZone])
    const create = vi.spyOn(zonesService, 'create').mockResolvedValue(newZone)
    const { user } = renderZonesPage()
    await getTable()

    await fillAndSubmit(user)

    expect(create).toHaveBeenCalledWith({ name: 'Centro', code: 'CEN-01' })
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Zona "Centro" creada correctamente',
    )
    expect(await within(await getTable()).findByText('CEN-01')).toBeInTheDocument()
    expect(within(getForm()).getByLabelText('Nombre')).toHaveValue('')
  })

  it('muestra el error del backend cuando la zona ya existe', async () => {
    vi.spyOn(zonesService, 'list').mockResolvedValue(zones)
    vi.spyOn(zonesService, 'create').mockRejectedValue(
      createHttpError(409, {
        data: { message: "Ya existe una zona registrada con el código 'CEN-01'" },
      }),
    )
    const { user } = renderZonesPage()
    await getTable()

    await fillAndSubmit(user)

    expect(await within(getForm()).findByRole('alert')).toHaveTextContent(
      "Ya existe una zona registrada con el código 'CEN-01'",
    )
    expect(within(getForm()).getByLabelText('Código')).toHaveValue('CEN-01')
  })
})
