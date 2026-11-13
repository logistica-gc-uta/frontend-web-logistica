import { screen, waitFor, within } from '@testing-library/react'
import { AxiosError } from 'axios'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../../app/App'
import { orderReceiptPath } from '../../app/paths'
import { apiClient } from '../../lib/http/apiClient'
import { adminSession, guestOrder } from '../../test/fixtures'
import { createHttpError, createHttpResponse } from '../../test/http'
import { mockLossesPanel, preparedLoss } from '../../test/lossFixtures'
import { adminReceipt, orderContact } from '../../test/purchaseFixtures'
import { renderWithProviders } from '../../test/renderWithProviders'
import { dispatchService } from '../dispatch/dispatchService'
import { ordersService } from '../orders/ordersService'
import { describeLossError } from './lossErrors'
import type { OrderItemLoss } from './types'

const conflict = (code: string) =>
  createHttpError(409, { data: { statusCode: 409, code, message: 'x', error: 'Conflict' } })

const pendingLoss = (overrides: Partial<OrderItemLoss> = {}) =>
  preparedLoss({
    id: 'loss-2',
    orderItemId: 'item-2',
    unitNumber: 2,
    replacement: { state: 'PENDING', preparedAt: null, preparedById: null },
    movements: [],
    ...overrides,
  })

const renderPage = (search = '', losses: OrderItemLoss[] = [], order = guestOrder) => {
  vi.spyOn(ordersService, 'receipt').mockResolvedValue(adminReceipt())
  vi.spyOn(ordersService, 'contact').mockResolvedValue(orderContact())
  vi.spyOn(ordersService, 'contactHistory').mockResolvedValue([])
  const api = mockLossesPanel(order, losses)
  const rendered = renderWithProviders(<App />, {
    route: `${orderReceiptPath(order.id)}${search}`,
    session: adminSession,
  })
  return { ...rendered, ...api }
}

const panel = async () =>
  within(await screen.findByRole('region', { name: 'Pérdidas y reemplazos' }))

describe('pérdidas y reemplazos · lógica (#39, backend #52)', () => {
  it('traduce los conflictos sin presentarlos como éxito', () => {
    expect(describeLossError(conflict('NO_FREE_STOCK'), 'f')).toMatch(/no se descontó nada/)
    expect(describeLossError(conflict('LOSS_ALREADY_DECLARED'), 'f')).toMatch(
      /ya tiene una pérdida/,
    )
    expect(describeLossError(conflict('REPLACEMENT_ALREADY_PREPARED'), 'f')).toMatch(/ya estaba/)
    expect(describeLossError(conflict('ORIGINAL_ALREADY_RECOVERED'), 'f')).toMatch(/no se volvió/)
  })

  it('envía las acciones con el ítem, la unidad, el intento y la condición', async () => {
    const post = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValue(createHttpResponse({ id: 'x', outcome: 'APPLIED' }))

    await dispatchService.declareLoss({
      orderId: 'o1',
      orderItemId: 'i1',
      unitNumber: 2,
      attemptId: 'a1',
      reason: 'Se cayó',
    })
    await dispatchService.recoverOriginal('l1', 'DAMAGED', 'Llegó roto')

    expect(post.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        action: 'LOSS_DECLARE',
        orderId: 'o1',
        orderItemId: 'i1',
        unitNumber: 2,
        attemptId: 'a1',
      }),
    )
    expect(post.mock.calls[1][1]).toEqual(
      expect.objectContaining({
        action: 'ORIGINAL_RECOVER',
        lossId: 'l1',
        recoveryCondition: 'DAMAGED',
      }),
    )
  })
})

describe('pérdidas y reemplazos · página del pedido', () => {
  it('declara la pérdida de una unidad elegida, ligada al intento, y vuelve a leer el estado', async () => {
    const declare = vi.spyOn(dispatchService, 'declareLoss').mockResolvedValue({ id: 'x' } as never)
    const { user, losses } = renderPage('?intento=a1')
    const box = await panel()

    await user.click(
      await box.findByRole('button', { name: 'Declarar pérdida de Mouse Inalámbrico Logitech' }),
    )
    await user.click(box.getByRole('button', { name: 'Confirmar' }))
    expect(box.getByText('Elige qué unidad se perdió')).toBeInTheDocument()
    expect(box.getByText('Escribe un motivo breve')).toBeInTheDocument()
    expect(declare).not.toHaveBeenCalled()

    await user.selectOptions(box.getByLabelText('Unidad perdida'), '2')
    await user.type(box.getByLabelText(/Motivo: declarar pérdida/), 'Se cayó del camión')
    await user.click(box.getByRole('button', { name: 'Confirmar' }))

    expect(declare).toHaveBeenCalledWith({
      orderId: guestOrder.id,
      orderItemId: 'item-2',
      unitNumber: 2,
      attemptId: 'a1',
      reason: 'Se cayó del camión',
    })
    expect(await box.findByText(/Pérdida declarada/)).toBeInTheDocument()
    await waitFor(() => expect(losses).toHaveBeenCalledTimes(2))
  })

  it('muestra reemplazo y original por separado, con el stock que devolvió el servidor', async () => {
    renderPage('', [preparedLoss()])
    const loss = within(
      await (
        await panel()
      ).findByRole('listitem', { name: 'Pérdida de Laptop HP Pavilion 15 (unidad 1)' }),
    )

    expect(loss.getByText(/^Preparado el/)).toBeInTheDocument()
    expect(loss.getByText('Perdido: todavía no aparece')).toBeInTheDocument()
    expect(loss.getByText(/Salida por reemplazo \(-1\) · stock después: 4/)).toBeInTheDocument()
    expect(loss.queryByRole('button', { name: /Preparar reemplazo/ })).not.toBeInTheDocument()
    expect(loss.getByRole('button', { name: /Registrar recuperación del original/ })).toBeEnabled()
  })

  it('sin stock libre el reemplazo sigue pendiente y no se simula preparado', async () => {
    const prepare = vi
      .spyOn(dispatchService, 'prepareReplacement')
      .mockRejectedValue(conflict('NO_FREE_STOCK'))
    const { user, losses } = renderPage('', [pendingLoss()])
    const box = await panel()
    const loss = within(
      await box.findByRole('listitem', {
        name: 'Pérdida de Mouse Inalámbrico Logitech (unidad 2)',
      }),
    )

    expect(loss.getByText('Pendiente: no había stock libre')).toBeInTheDocument()
    await user.click(loss.getByRole('button', { name: /Preparar reemplazo/ }))
    await user.type(loss.getByLabelText(/Motivo: preparar reemplazo/), 'Llegó mercadería')
    await user.click(loss.getByRole('button', { name: 'Confirmar' }))

    expect(prepare).toHaveBeenCalledWith('loss-2', 'Llegó mercadería')
    expect(
      await box.findByText(/el reemplazo sigue pendiente y no se descontó nada/),
    ).toBeInTheDocument()
    expect(box.getByText('Pendiente: no había stock libre')).toBeInTheDocument()
    await waitFor(() => expect(losses).toHaveBeenCalledTimes(2))
  })

  it('la recuperación exige revisar el original y elegir vendible o dañado', async () => {
    const recover = vi
      .spyOn(dispatchService, 'recoverOriginal')
      .mockResolvedValue({ id: 'x' } as never)
    const { user } = renderPage('', [preparedLoss()])
    const loss = within(
      await (
        await panel()
      ).findByRole('listitem', { name: 'Pérdida de Laptop HP Pavilion 15 (unidad 1)' }),
    )

    await user.click(loss.getByRole('button', { name: /Registrar recuperación del original/ }))
    await user.type(loss.getByLabelText(/Motivo: recuperación del original/), 'Apareció')
    await user.click(loss.getByRole('button', { name: 'Confirmar' }))
    expect(loss.getByText('Indica cómo está el original tras revisarlo')).toBeInTheDocument()
    expect(recover).not.toHaveBeenCalled()

    await user.click(loss.getByLabelText('Vendible: vuelve al stock'))
    await user.click(loss.getByRole('button', { name: 'Confirmar' }))

    expect(recover).toHaveBeenCalledWith('loss-1', 'SELLABLE', 'Apareció')
    expect(await screen.findByText(/volvió una unidad al stock/)).toBeInTheDocument()
  })

  it('un original ya recuperado no se vuelve a registrar', async () => {
    renderPage('', [
      preparedLoss({
        original: {
          state: 'RECOVERED',
          condition: 'DAMAGED',
          recoveredAt: '2030-02-15T10:00:00Z',
          recoveredById: 'admin-1',
        },
      }),
    ])
    const loss = within(
      await (
        await panel()
      ).findByRole('listitem', { name: 'Pérdida de Laptop HP Pavilion 15 (unidad 1)' }),
    )

    expect(loss.getByText(/^Recuperado dañado el/)).toBeInTheDocument()
    expect(loss.queryByRole('button', { name: /Registrar recuperación/ })).not.toBeInTheDocument()
  })

  it('un pedido entregado no admite pérdidas nuevas', async () => {
    renderPage('', [], { ...guestOrder, status: 'DELIVERED' })
    const box = await panel()

    expect(
      await box.findByText(/ya está entregado: no se declaran pérdidas nuevas/),
    ).toBeInTheDocument()
    expect(box.queryByRole('button', { name: /Declarar pérdida/ })).not.toBeInTheDocument()
  })

  it('si la red falla no muestra éxito y vuelve a leer', async () => {
    vi.spyOn(dispatchService, 'declareLoss').mockRejectedValue(new AxiosError('Network Error'))
    const { user, losses } = renderPage()
    const box = await panel()

    await user.click(
      await box.findByRole('button', { name: 'Declarar pérdida de Laptop HP Pavilion 15' }),
    )
    await user.type(box.getByLabelText(/Motivo: declarar pérdida/), 'Se perdió')
    await user.click(box.getByRole('button', { name: 'Confirmar' }))

    expect(await box.findByText(/No se pudo conectar con el servidor/)).toBeInTheDocument()
    expect(box.queryByText(/Pérdida declarada/)).not.toBeInTheDocument()
    await waitFor(() => expect(losses).toHaveBeenCalledTimes(2))
  })
})
