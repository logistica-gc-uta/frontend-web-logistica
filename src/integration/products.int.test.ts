import { beforeEach, describe, expect, it } from 'vitest'
import { toCreateProductInput } from '../features/products/productValidation'
import { productsService } from '../features/products/productsService'
import { expectHttpError } from './support/assertions'
import { loginAsAdmin, uniqueSuffix } from './support/session'

describe('Integración real · productos (/products)', () => {
  beforeEach(loginAsAdmin)

  it('lista solo productos con stock disponible', async () => {
    const products = await productsService.list()

    expect(products.length).toBeGreaterThan(0)
    expect(products.every((product) => product.stock > 0)).toBe(true)
  })

  it('crea un producto desde los valores del formulario y aparece al volver a consultar la API', async () => {
    const formValues = {
      name: `IT Producto ${uniqueSuffix()}`,
      description: 'Creado por la suite de integración',
      price: '12.50',
      stock: '3',
    }

    const created = await productsService.create(toCreateProductInput(formValues))
    const products = await productsService.list()

    expect(created).toEqual(
      expect.objectContaining({ name: formValues.name, price: 12.5, stock: 3 }),
    )
    expect(products).toContainEqual(expect.objectContaining({ id: created.id }))
  })

  it('un producto creado con stock 0 se guarda pero no aparece en el listado', async () => {
    const created = await productsService.create({
      name: `IT Sin stock ${uniqueSuffix()}`,
      price: 1,
      stock: 0,
    })
    const products = await productsService.list()

    expect(created.stock).toBe(0)
    expect(products.map((product) => product.id)).not.toContain(created.id)
  })

  it('rechaza precio y stock inválidos con 400 y los mensajes de validación del backend', async () => {
    const message = await expectHttpError(
      productsService.create({ name: 'Inválido', price: 0, stock: -1 }),
      400,
    )

    expect(message).toContain('El precio debe ser mayor a 0')
    expect(message).toContain('El stock no puede ser negativo')
  })
})
