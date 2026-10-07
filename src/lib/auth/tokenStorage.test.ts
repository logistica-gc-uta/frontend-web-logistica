import { describe, expect, it } from 'vitest'
import { tokenStorage } from './tokenStorage'

describe('tokenStorage', () => {
  it('devuelve null cuando no hay token guardado', () => {
    expect(tokenStorage.get()).toBeNull()
  })

  it('guarda y recupera el token', () => {
    tokenStorage.set('abc')

    expect(tokenStorage.get()).toBe('abc')
  })

  it('elimina el token', () => {
    tokenStorage.set('abc')
    tokenStorage.clear()

    expect(tokenStorage.get()).toBeNull()
  })
})
