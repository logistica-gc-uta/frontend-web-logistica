import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../../app/App'
import { orderReceiptPath } from '../../app/paths'
import { adminSession } from '../../test/fixtures'
import { createHttpError } from '../../test/http'
import { adminReceipt, contactAudit, orderContact } from '../../test/purchaseFixtures'
import { renderWithProviders } from '../../test/renderWithProviders'
import { mockLossesPanel } from '../../test/lossFixtures'
import { ordersService } from './ordersService'

const ORDER_ID = orderContact().id

const mockApi = () => ({
  ...mockLossesPanel(),
  receipt: vi.spyOn(ordersService, 'receipt').mockResolvedValue(adminReceipt()),
  contact: vi.spyOn(ordersService, 'contact').mockResolvedValue(orderContact()),
  history: vi.spyOn(ordersService, 'contactHistory').mockResolvedValue([]),
})

const renderReceipt = () =>
  renderWithProviders(<App />, { route: orderReceiptPath(ORDER_ID), session: adminSession })

const contactForm = () => within(screen.getByRole('form', { name: 'Corregir contacto' }))

describe('ADMIN · comprobante de venta', () => {
  it('muestra el desglose del servidor y el pago como declarado, sin tarjeta', async () => {
    mockApi()
    renderReceipt()

    const receipt = await screen.findByRole('article', { name: 'Comprobante RG-2030-0007' })
    expect(within(receipt).getByText(/SIN VALIDEZ TRIBUTARIA/)).toBeInTheDocument()
    expect(within(receipt).getByText('María Pérez · 0991234567')).toBeInTheDocument()
    expect(within(receipt).getByText('Ana Regalo · 0987654321')).toBeInTheDocument()
    expect(within(receipt).getByText('Ramo de rosas')).toBeInTheDocument()
    expect(within(receipt).getByText('IVA simulado 15 %')).toBeInTheDocument()
    expect(within(receipt).getByText('$10,95')).toBeInTheDocument()
    expect(within(receipt).getByText('Envío (incluido en el precio)')).toBeInTheDocument()
    expect(within(receipt).getByText('$83,95')).toBeInTheDocument()
    expect(within(receipt).getByText(/Pago declarado: Transferencia\./)).toBeInTheDocument()
    expect(within(receipt).getByText(/no es una verificación bancaria/)).toBeInTheDocument()
    expect(within(receipt).queryByText(/••••/)).not.toBeInTheDocument()
    expect(
      await within(receipt).findByText(/Av\. Cevallos y Montalvo · hora aproximada/),
    ).toBeInTheDocument()
  })

  it('el botón de imprimir abre la impresión del navegador', async () => {
    mockApi()
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined)
    const { user } = renderReceipt()

    await user.click(await screen.findByRole('button', { name: 'Imprimir comprobante' }))

    expect(print).toHaveBeenCalledTimes(1)
  })

  it('un pedido antiguo sin comprobante lo dice sin inventar importes', async () => {
    mockApi().receipt.mockRejectedValue(createHttpError(404))
    renderReceipt()

    expect(await screen.findByText(/Este pedido no tiene comprobante/)).toBeInTheDocument()
    expect(screen.queryByText('$83,95')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Imprimir comprobante' })).not.toBeInTheDocument()
  })
})

describe('ADMIN · corrección de contacto', () => {
  it('envía solo lo que cambió con la versión actual y avisa que el comprobante no cambia', async () => {
    const api = mockApi()
    const update = vi
      .spyOn(ordersService, 'updateContact')
      .mockResolvedValue(orderContact({ recipientPhone: '0999999999', contactRevision: 1 }))
    const { user } = renderReceipt()
    await screen.findByRole('form', { name: 'Corregir contacto' })
    api.history.mockResolvedValue([contactAudit()])

    const phone = contactForm().getByLabelText('Teléfono de quien recibe')
    await user.clear(phone)
    await user.type(phone, '0999999999')
    await user.click(contactForm().getByRole('button', { name: 'Guardar corrección' }))

    expect(update).toHaveBeenCalledWith(ORDER_ID, {
      contactRevision: 0,
      recipientPhone: '0999999999',
    })
    expect(
      await screen.findByText(
        'Contacto corregido. El comprobante y los importes de la venta no cambian.',
      ),
    ).toBeInTheDocument()
    expect(
      await screen.findByText('Teléfono de quien recibe', { selector: 'strong' }),
    ).toBeInTheDocument()
    // El comprobante conserva el teléfono de la venta.
    expect(screen.getByText('Ana Regalo · 0987654321')).toBeInTheDocument()
  })

  it('sin cambios no llama al servidor', async () => {
    mockApi()
    const update = vi.spyOn(ordersService, 'updateContact')
    const { user } = renderReceipt()
    await screen.findByRole('form', { name: 'Corregir contacto' })

    await user.click(contactForm().getByRole('button', { name: 'Guardar corrección' }))

    expect(screen.getByText('No hay cambios para guardar.')).toBeInTheDocument()
    expect(update).not.toHaveBeenCalled()
  })

  it('si otro ADMIN corrigió antes, no guarda nada y permite recargar los datos actuales', async () => {
    const api = mockApi()
    vi.spyOn(ordersService, 'updateContact').mockRejectedValue(
      createHttpError(409, {
        data: { error: { code: 'CONTACT_REVISION_CONFLICT', message: 'x', details: {} } },
      }),
    )
    const { user } = renderReceipt()
    await screen.findByRole('form', { name: 'Corregir contacto' })
    const phone = contactForm().getByLabelText('Teléfono del comprador')
    await user.clear(phone)
    await user.type(phone, '0990000000')
    await user.click(contactForm().getByRole('button', { name: 'Guardar corrección' }))

    expect(await screen.findByText(/Otro administrador corrigió este contacto/)).toBeInTheDocument()
    api.contact.mockResolvedValue(orderContact({ buyerPhone: '0981111111', contactRevision: 1 }))
    await user.click(screen.getByRole('button', { name: 'Recargar datos actuales' }))

    await waitFor(() =>
      expect(contactForm().getByLabelText('Teléfono del comprador')).toHaveValue('0981111111'),
    )
  })

  it('el nombre del comprador solo se corrige en ventas de invitado', async () => {
    mockApi().contact.mockResolvedValue(
      orderContact({ userId: 'client-1', recipientType: 'REGISTERED_CLIENT' }),
    )
    renderReceipt()
    await screen.findByRole('form', { name: 'Corregir contacto' })

    expect(contactForm().queryByLabelText('Nombre del comprador')).not.toBeInTheDocument()
    expect(contactForm().getByLabelText('Teléfono del comprador')).toBeInTheDocument()
  })

  it('muestra el historial de correcciones', async () => {
    mockApi().history.mockResolvedValue([contactAudit()])
    renderReceipt()

    expect(await screen.findByText(/0987654321/, { selector: 'li' })).toHaveTextContent(
      'Teléfono de quien recibe: 0987654321 → 0999999999',
    )
  })
})
