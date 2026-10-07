import { describe, expect, it } from 'vitest'
import { toCreateProductInput, validateProduct } from './productValidation'

const validValues = { name: 'Mouse', description: '', price: '25.50', stock: '10' }

describe('validateProduct', () => {
  it('no devuelve errores con datos válidos (descripción opcional)', () => {
    expect(validateProduct(validValues)).toEqual({})
  })

  it('exige nombre, precio y stock', () => {
    expect(validateProduct({ name: ' ', description: '', price: '', stock: '' })).toEqual({
      name: 'El nombre es obligatorio',
      price: 'El precio es obligatorio',
      stock: 'El stock es obligatorio',
    })
  })

  it('exige un precio mayor a 0', () => {
    expect(validateProduct({ ...validValues, price: '0' })).toEqual({
      price: 'El precio debe ser mayor a 0',
    })
  })

  it.each(['-1', '2.5'])('rechaza el stock %j', (stock) => {
    expect(validateProduct({ ...validValues, stock })).toEqual({
      stock: 'El stock debe ser un número entero mayor o igual a 0',
    })
  })

  it('acepta stock 0', () => {
    expect(validateProduct({ ...validValues, stock: '0' })).toEqual({})
  })
})

describe('toCreateProductInput', () => {
  it('convierte los campos numéricos y limpia los espacios', () => {
    expect(
      toCreateProductInput({
        name: ' Mouse ',
        description: ' Inalámbrico ',
        price: '25.50',
        stock: '10',
      }),
    ).toEqual({ name: 'Mouse', description: 'Inalámbrico', price: 25.5, stock: 10 })
  })

  it('omite la descripción cuando está vacía', () => {
    expect(toCreateProductInput({ ...validValues, description: '   ' })).toEqual({
      name: 'Mouse',
      price: 25.5,
      stock: 10,
    })
  })
})
