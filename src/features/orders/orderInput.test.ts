import { describe, expect, it } from 'vitest'
import { products } from '../../test/fixtures'
import {
  buildTimeSlots,
  formatPhone,
  formatTimeLabel,
  joinScheduledAt,
  sanitizeName,
  sanitizePhone,
  splitScheduledAt,
  toInternationalPhone,
} from './orderInput'
import { itemIssues } from './orderValidation'

describe('orderInput', () => {
  it('el nombre conserva letras, tildes, espacios, apóstrofo, punto y guion; quita números y símbolos', () => {
    expect(sanitizeName("Ana-María O'Neil Ñandú Jr.")).toBe("Ana-María O'Neil Ñandú Jr.")
    expect(sanitizeName('Mar1a  P@rez #3')).toBe('Mara Prez ')
  })

  it('el teléfono solo deja dígitos, sin el 0 inicial y hasta 9', () => {
    expect(sanitizePhone('0991 234-567')).toBe('991234567')
    expect(sanitizePhone('+593 99 123 4567 89')).toBe('593991234')
    expect(sanitizePhone('abc')).toBe('')
  })

  it('arma el teléfono internacional y su forma legible', () => {
    expect(toInternationalPhone('991234567')).toBe('+593991234567')
    expect(formatPhone('991234567')).toBe('+593 991 234 567')
    expect(formatPhone('')).toBe('')
  })

  it('separa y une fecha y hora', () => {
    expect(splitScheduledAt('2030-01-02T10:30')).toEqual({ date: '2030-01-02', time: '10:30' })
    expect(splitScheduledAt('')).toEqual({ date: '', time: '' })
    expect(joinScheduledAt('2030-01-02', '10:30')).toBe('2030-01-02T10:30')
    expect(joinScheduledAt('', '')).toBe('')
  })

  it('escribe la hora con a. m. / p. m.', () => {
    expect(formatTimeLabel('00:00')).toBe('12:00 a. m.')
    expect(formatTimeLabel('07:00')).toBe('7:00 a. m.')
    expect(formatTimeLabel('12:30')).toBe('12:30 p. m.')
    expect(formatTimeLabel('17:00')).toBe('5:00 p. m.')
    expect(formatTimeLabel('xx')).toBe('xx')
  })

  it('ofrece horas cada 30 minutos dentro del horario, extremos incluidos', () => {
    const slots = buildTimeSlots({
      timeZone: 'America/Guayaquil',
      startTime: '07:00',
      endTime: '09:00',
    })
    expect(slots).toEqual(['07:00', '07:30', '08:00', '08:30', '09:00'])
  })
})

describe('itemIssues', () => {
  const [laptop] = products

  it('avisa del stock en la línea que lo excede, sumando las líneas del mismo producto', () => {
    const issues = itemIssues(
      [
        { productId: laptop.id, quantity: String(laptop.stock) },
        { productId: laptop.id, quantity: '1' },
      ],
      products,
    )
    expect(issues[0].quantity).toBe(`Solo hay ${laptop.stock} en stock`)
    expect(issues[1].quantity).toBe(`Solo hay ${laptop.stock} en stock`)
  })

  it('los campos vacíos o inválidos solo se señalan cuando se piden', () => {
    const items = [{ productId: '', quantity: '0' }]
    expect(itemIssues(items, products)).toEqual([{}])
    expect(itemIssues(items, products, true)).toEqual([
      { product: 'Elige un producto', quantity: 'Mínimo 1' },
    ])
  })
})
