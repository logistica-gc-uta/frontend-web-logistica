import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../app/App'
import { authStorage } from '../../../lib/auth/authStorage'
import { customer, customerSession, signInCustomer } from '../../../test/checkoutFixtures'
import { adminSession, adminUser } from '../../../test/fixtures'
import { createHttpError, createHttpResponse } from '../../../test/http'
import { renderWithProviders } from '../../../test/renderWithProviders'
import { productPage, shopProduct, shopSettings } from '../../../test/shopFixtures'
import { cartStorage } from '../cart/cartStorage'
import { shopService } from '../shopService'
import { customerApiClient } from './customerApiClient'
import { customerService } from './customerService'
import { customerStorage } from './customerStorage'
import { savedCoverage } from '../../../test/coverageFixtures'

const renderShop = (route: string) => renderWithProviders(<App />, { route })

function mockCatalog() {
  vi.spyOn(shopService, 'categories').mockResolvedValue([])
  vi.spyOn(shopService, 'products').mockResolvedValue(productPage([]))
  vi.spyOn(shopService, 'settings').mockResolvedValue(shopSettings())
}

afterEach(() => sessionStorage.clear())

describe('Shop · acceso de cliente', () => {
  it('usa los títulos del boceto en login y registro', async () => {
    const { user } = renderShop('/ingresar')
    expect(screen.getByRole('heading', { name: 'Un detalle empieza contigo.' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Qué bueno verte.' })).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Crear cuenta' }))
    expect(await screen.findByRole('heading', { name: 'Tu primer detalle.' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Un detalle empieza contigo.' })).toBeInTheDocument()
  })
})

describe('Shop · visibilidad de contraseña', () => {
  it.each([
    { route: '/ingresar', field: 'Contraseña', action: 'Mostrar contraseña' },
    { route: '/registro', field: /^Contraseña \(/, action: 'Mostrar contraseña' },
    { route: '/registro', field: 'Confirmar contraseña', action: 'Mostrar confirmación' },
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
    const { user } = renderShop('/registro')

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

  it('envía solo nombre, correo y contraseña (sin rol) e inicia sesión conservando el paso pendiente', async () => {
    mockCatalog()
    vi.spyOn(shopService, 'product').mockResolvedValue(shopProduct({ id: 'p-rosas' }))
    vi.spyOn(shopService, 'storeCoverage').mockResolvedValue(savedCoverage())
    const post = vi.spyOn(customerApiClient, 'post').mockResolvedValue(createHttpResponse({}))
    vi.spyOn(customerService, 'login').mockResolvedValue(customerSession)
    cartStorage.save([{ productId: 'p-rosas', quantity: 1 }])
    const { user } = renderShop('/checkout')
    await user.click(await screen.findByRole('link', { name: 'Crear cuenta' }))

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
    expect(await screen.findByRole('form', { name: 'Datos de entrega' })).toBeInTheDocument()
  })

  it('un correo ya registrado se informa sin revelar más datos', async () => {
    vi.spyOn(customerApiClient, 'post').mockRejectedValue(
      createHttpError(409, {
        data: { statusCode: 409, code: 'EMAIL_ALREADY_EXISTS', message: 'El correo ya existe' },
      }),
    )
    const { user } = renderShop('/registro')
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
    const { user } = renderShop('/ingresar')

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

  it('con sesión muestra el menú de la cuenta y al cerrarla conserva el carrito', async () => {
    mockCatalog()
    signInCustomer()
    cartStorage.save([{ productId: 'p1', quantity: 2 }], customer.id)
    const { user } = renderShop('/')

    const account = screen.getByRole('navigation', { name: 'Cuenta' })
    expect(within(account).getByRole('button', { name: 'Hola, Kerly Cliente' })).toBeInTheDocument()
    expect(within(account).queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Carrito: 2 unidades' })).toBeInTheDocument()

    await user.click(within(account).getByRole('button', { name: 'Hola, Kerly Cliente' }))
    await user.click(within(account).getByRole('button', { name: 'Cerrar sesión' }))

    expect(
      within(screen.getByRole('navigation', { name: 'Cuenta' })).getByRole('link', {
        name: 'Ingresar a Mi cuenta',
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Carrito: 2 unidades' })).toBeInTheDocument()
    expect(customerStorage.get()).toBeNull()
  })

  it('el ADMIN conectado en el panel no aparece como cliente en el Shop', () => {
    mockCatalog()
    authStorage.save(adminSession)
    renderShop('/')

    expect(screen.getByRole('link', { name: 'Ingresar a Mi cuenta' })).toBeInTheDocument()
    expect(screen.queryByText(/Hola,/)).not.toBeInTheDocument()
  })
})

describe('Shop · rutas protegidas y sesión vencida', () => {
  it.each([
    '/checkout',
    '/checkout/pago',
    '/mi-cuenta/pedidos',
    '/mi-cuenta/pedidos/p1/comprobante',
  ])('%s exige iniciar sesión', async (route) => {
    renderShop(route)
    expect(await screen.findByRole('heading', { name: 'Qué bueno verte.' })).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('Inicia sesión o crea una cuenta')
  })

  it('un 401 cierra la sesión y lleva al login avisando que terminó', async () => {
    signInCustomer()
    const originalAdapter = customerApiClient.defaults.adapter
    // El backend rechaza el token (vencido): se prueba el interceptor real del cliente HTTP.
    customerApiClient.defaults.adapter = () =>
      Promise.reject(createHttpError(401, { requestHeaders: { Authorization: 'Bearer x' } }))
    try {
      renderShop('/mi-cuenta/pedidos')

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
    const { user } = renderShop('/ingresar')

    await user.type(screen.getByLabelText('Correo electrónico'), customer.email)
    await user.type(screen.getByLabelText('Contraseña'), 'Clave12345')
    await user.click(screen.getByRole('button', { name: 'Ingresar' }))

    await waitFor(() =>
      expect(cartStorage.load(customer.id)).toEqual([{ productId: 'p1', quantity: 3 }]),
    )
    expect(screen.getByRole('link', { name: 'Carrito: 3 unidades' })).toBeInTheDocument()
  })

  it('no muestra el carrito guardado de otra cuenta', () => {
    mockCatalog()
    cartStorage.save([{ productId: 'p1', quantity: 5 }], 'otra-cuenta')
    signInCustomer()
    renderShop('/')

    expect(screen.getByRole('link', { name: 'Carrito' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Carrito: / })).not.toBeInTheDocument()
  })
})
