import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../app/App'
import { authStorage } from '../../../lib/auth/authStorage'
import { customer, customerSession, signInCustomer } from '../../../test/checkoutFixtures'
import { adminSession, adminUser } from '../../../test/fixtures'
import { createHttpError, createHttpResponse } from '../../../test/http'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { productPage, shopSettings } from '../../../test/shopFixtures'
import { cartStorage } from '../cart/cartStorage'
import { shopService } from '../shopService'
import { customerApiClient } from './customerApiClient'
import { customerService } from './customerService'
import { customerStorage } from './customerStorage'

const renderShop = (route: string) => renderWithProviders(<App />, { route })

function mockCatalog() {
  vi.spyOn(shopService, 'categories').mockResolvedValue([])
  vi.spyOn(shopService, 'products').mockResolvedValue(productPage([]))
  vi.spyOn(shopService, 'settings').mockResolvedValue(shopSettings())
}

afterEach(() => sessionStorage.clear())

describe('Shop · visibilidad de contraseña', () => {
  it.each([
    { route: '/shop/login', field: 'Contraseña', action: 'Mostrar contraseña' },
    { route: '/shop/registro', field: /^Contraseña \(/, action: 'Mostrar contraseña' },
    { route: '/shop/registro', field: 'Confirmar contraseña', action: 'Mostrar confirmación' },
  ])(
    '$route permite revelar y ocultar $field sin enviar el formulario',
    async ({ route, field, action }) => {
      const login = vi.spyOn(customerService, 'login')
      const register = vi.spyOn(customerService, 'register')
      const { user } = renderShop(route)
      const input = screen.getByLabelText(field)
      await user.type(input, 'Clave12345')
      expect(input).toHaveAttribute('type', 'password')
      const toggle = screen.getByRole('button', { name: action })
      await user.click(toggle)
      expect(input).toHaveAttribute('type', 'text')
      expect(input).toHaveValue('Clave12345')
      expect(toggle).toHaveAttribute('aria-pressed', 'true')
      await user.click(toggle)
      expect(input).toHaveAttribute('type', 'password')
      expect(toggle).toHaveAttribute('aria-pressed', 'false')
      expect(login).not.toHaveBeenCalled()
      expect(register).not.toHaveBeenCalled()
    },
  )
})

describe('Shop · registro CLIENT', () => {
  it('valida cada campo antes de enviar', async () => {
    const register = vi.spyOn(customerService, 'register')
    const { user } = renderShop('/shop/registro')

    await user.type(screen.getByLabelText('Nombre completo'), 'K')
    await user.type(screen.getByLabelText('Correo electrónico'), 'no-es-correo')
    await user.type(screen.getByLabelText(/^Contraseña \(/), 'corta')
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'otra')
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    expect(screen.getByText('El nombre debe tener entre 2 y 120 caracteres')).toBeInTheDocument()
    expect(screen.getByText('El correo electrónico no es válido')).toBeInTheDocument()
    expect(
      screen.getByText('La contraseña debe tener entre 8 y 128 caracteres'),
    ).toBeInTheDocument()
    expect(screen.getByText('Las contraseñas no coinciden')).toBeInTheDocument()
    expect(register).not.toHaveBeenCalled()
  })

  it('envía solo nombre, correo y contraseña (sin rol) y lleva al login conservando el paso pendiente', async () => {
    const post = vi.spyOn(customerApiClient, 'post').mockResolvedValue(createHttpResponse({}))
    const { user } = renderShop('/shop/checkout')
    await user.click(await screen.findByRole('link', { name: 'Crear una cuenta' }))

    await user.type(screen.getByLabelText('Nombre completo'), '  Kerly Cliente ')
    await user.type(screen.getByLabelText('Correo electrónico'), 'kerly@regalia.test')
    await user.type(screen.getByLabelText(/^Contraseña \(/), 'Clave12345')
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'Clave12345')
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    expect(post).toHaveBeenCalledWith('/auth/register', {
      name: 'Kerly Cliente',
      email: 'kerly@regalia.test',
      password: 'Clave12345',
    })
    expect(await screen.findByText(/Tu cuenta se creó/)).toBeInTheDocument()
    expect(screen.getByLabelText('Correo electrónico')).toHaveValue('kerly@regalia.test')

    vi.spyOn(customerService, 'login').mockResolvedValue(customerSession)
    vi.spyOn(shopService, 'settings').mockResolvedValue(shopSettings())
    cartStorage.save([{ productId: 'p-rosas', quantity: 1 }])
    await user.type(screen.getByLabelText('Contraseña'), 'Clave12345')
    await user.click(screen.getByRole('button', { name: 'Ingresar' }))
    expect(await screen.findByRole('form', { name: 'Datos de entrega' })).toBeInTheDocument()
  })

  it('un correo ya registrado se informa sin revelar más datos', async () => {
    vi.spyOn(customerApiClient, 'post').mockRejectedValue(
      createHttpError(409, {
        data: { statusCode: 409, code: 'EMAIL_ALREADY_EXISTS', message: 'El correo ya existe' },
      }),
    )
    const { user } = renderShop('/shop/registro')
    await user.type(screen.getByLabelText('Nombre completo'), 'Kerly')
    await user.type(screen.getByLabelText('Correo electrónico'), 'kerly@regalia.test')
    await user.type(screen.getByLabelText(/^Contraseña \(/), 'Clave12345')
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'Clave12345')
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    expect(
      await screen.findByText('Ya existe una cuenta con este correo. Inicia sesión.'),
    ).toBeInTheDocument()
  })
})

describe('Shop · login CLIENT', () => {
  it('rechaza credenciales incorrectas y cuentas que no son de cliente', async () => {
    const post = vi
      .spyOn(customerApiClient, 'post')
      .mockRejectedValueOnce(
        createHttpError(401, {
          data: { code: 'INVALID_CREDENTIALS', message: 'Credenciales inválidas' },
        }),
      )
      .mockResolvedValueOnce(createHttpResponse({ access_token: 't', user: adminUser }))
    const { user } = renderShop('/shop/login')

    await user.type(screen.getByLabelText('Correo electrónico'), 'admin@delivery.com')
    await user.type(screen.getByLabelText('Contraseña'), 'mala')
    await user.click(screen.getByRole('button', { name: 'Ingresar' }))
    expect(await screen.findByText('Correo o contraseña incorrectos.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Ingresar' }))
    expect(await screen.findByText(/Esta cuenta no es de cliente/)).toBeInTheDocument()
    expect(post).toHaveBeenCalledTimes(2)
    expect(customerStorage.get()).toBeNull()
  })

  it('la sesión del Shop no abre el panel administrativo ni se mezcla con la del ADMIN', async () => {
    signInCustomer()
    renderShop('/pedidos')

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(screen.getByText('Panel administrativo de logística')).toBeInTheDocument()
    expect(authStorage.getSession()).toBeNull()
  })

  it('con sesión muestra el menú de la cuenta y al cerrarla vacía el carrito', async () => {
    mockCatalog()
    signInCustomer()
    cartStorage.save([{ productId: 'p1', quantity: 2 }], customer.id)
    const { user } = renderShop('/shop')

    const account = screen.getByRole('navigation', { name: 'Cuenta' })
    expect(within(account).getByText('Hola, Kerly Cliente')).toBeInTheDocument()
    expect(screen.getByText(/Carrito: 2 unidades/)).toBeInTheDocument()

    await user.click(within(account).getByRole('button', { name: 'Cerrar sesión' }))

    expect(
      within(screen.getByRole('navigation', { name: 'Cuenta' })).getByRole('link', {
        name: 'Ingresar',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Carrito: 0 unidades/)).toBeInTheDocument()
    expect(customerStorage.get()).toBeNull()
  })

  it('el ADMIN conectado en el panel no aparece como cliente en el Shop', () => {
    mockCatalog()
    authStorage.save(adminSession)
    renderShop('/shop')

    expect(screen.getByRole('link', { name: 'Ingresar' })).toBeInTheDocument()
    expect(screen.queryByText(/Hola,/)).not.toBeInTheDocument()
  })
})

describe('Shop · rutas protegidas y sesión vencida', () => {
  it.each([
    '/shop/checkout',
    '/shop/pago',
    '/shop/mis-pedidos',
    '/shop/mis-pedidos/p1/comprobante',
  ])('%s exige iniciar sesión', async (route) => {
    renderShop(route)
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('Inicia sesión o crea una cuenta')
  })

  it('un 401 cierra la sesión y lleva al login avisando que terminó', async () => {
    signInCustomer()
    const originalAdapter = customerApiClient.defaults.adapter
    // El backend rechaza el token (vencido): se prueba el interceptor real del cliente HTTP.
    customerApiClient.defaults.adapter = () =>
      Promise.reject(createHttpError(401, { requestHeaders: { Authorization: 'Bearer x' } }))
    try {
      renderShop('/shop/mis-pedidos')

      expect(
        await screen.findByText('Tu sesión terminó. Vuelve a iniciar sesión para continuar.'),
      ).toBeInTheDocument()
      expect(customerStorage.get()).toBeNull()
    } finally {
      customerApiClient.defaults.adapter = originalAdapter
    }
  })
})

describe('Shop · carrito por cuenta', () => {
  it('el carrito del visitante pasa a su cuenta al iniciar sesión', async () => {
    mockCatalog()
    cartStorage.save([{ productId: 'p1', quantity: 3 }])
    vi.spyOn(customerService, 'login').mockResolvedValue(customerSession)
    const { user } = renderShop('/shop/login')

    await user.type(screen.getByLabelText('Correo electrónico'), customer.email)
    await user.type(screen.getByLabelText('Contraseña'), 'Clave12345')
    await user.click(screen.getByRole('button', { name: 'Ingresar' }))

    await waitFor(() =>
      expect(cartStorage.load(customer.id)).toEqual([{ productId: 'p1', quantity: 3 }]),
    )
    expect(screen.getByText(/Carrito: 3 unidades/)).toBeInTheDocument()
  })

  it('no muestra el carrito guardado de otra cuenta', () => {
    mockCatalog()
    cartStorage.save([{ productId: 'p1', quantity: 5 }], 'otra-cuenta')
    signInCustomer()
    renderShop('/shop')

    expect(screen.getByText(/Carrito: 0 unidades/)).toBeInTheDocument()
  })
})
