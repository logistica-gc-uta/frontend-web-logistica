import { describe, expect, it } from 'vitest'
import { adminSession } from '../../test/fixtures'
import { authStorage } from './authStorage'

describe('authStorage', () => {
  it('no devuelve token ni sesión cuando no hay nada guardado', () => {
    expect(authStorage.getToken()).toBeNull()
    expect(authStorage.getSession()).toBeNull()
  })

  it('guarda y recupera la sesión completa', () => {
    authStorage.save(adminSession)

    expect(authStorage.getToken()).toBe(adminSession.token)
    expect(authStorage.getSession()).toEqual(adminSession)
  })

  it('elimina la sesión', () => {
    authStorage.save(adminSession)
    authStorage.clear()

    expect(authStorage.getToken()).toBeNull()
    expect(authStorage.getSession()).toBeNull()
  })

  it('ignora un usuario guardado con formato inválido', () => {
    localStorage.setItem('logistica.token', 'abc')
    localStorage.setItem('logistica.user', '{no es json')

    expect(authStorage.getSession()).toBeNull()
  })
})
