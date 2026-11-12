import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { toPolygon } from '../features/store-coverage/coverageDraft'
import { describeCoverageError } from '../features/store-coverage/coverageErrors'
import { coverageService } from '../features/store-coverage/coverageService'
import type { StoreCoverage } from '../features/store-coverage/types'
import { shopErrorInfo } from '../features/shop/shopError'
import { authStorage } from '../lib/auth/authStorage'
import { AREA, STORE } from '../test/coverageFixtures'
import { loginAsAdmin, loginAsClient, saveInvalidToken } from './support/session'

/** Espera que la promesa falle y devuelve estado, código y el mensaje que vería el ADMIN. */
async function rejection(promise: Promise<unknown>) {
  const error = await promise.then(
    () => {
      throw new Error('Se esperaba un rechazo del backend')
    },
    (reason: unknown) => reason,
  )
  const { status, code } = shopErrorInfo(error)
  return { status, code, message: describeCoverageError(error, 'sin mensaje') }
}

/** Área A: rectángulo de prueba en Ambato (interior, borde y exterior conocidos). */
const AREA_A = { location: STORE, coverage: toPolygon(AREA) }

/** Moño: dos lados se cruzan, el backend debe rechazarlo. */
const BOW_TIE = toPolygon([
  { lat: -1.27, lng: -78.63 },
  { lat: -1.23, lng: -78.6 },
  { lat: -1.27, lng: -78.6 },
  { lat: -1.23, lng: -78.63 },
])

describe('Integración real · tienda y cobertura (#41)', () => {
  let before: StoreCoverage

  beforeAll(async () => {
    before = await coverageService.get()
  })

  // La configuración es única: se devuelve la que había para no dejar la del test como activa.
  afterAll(async () => {
    if (!before.configured) return
    await loginAsAdmin()
    await coverageService.save({ location: before.location, coverage: before.coverage })
    authStorage.clear()
  })

  it('ADMIN guarda el área A y al volver a leer obtiene lo persistido', async () => {
    await loginAsAdmin()

    const saved = await coverageService.save(AREA_A)
    const read = await coverageService.get()

    expect(saved).toEqual(expect.objectContaining({ configured: true, ...AREA_A }))
    expect(read).toEqual(saved)
  })

  it('el servidor acepta interior y borde, y rechaza el exterior', async () => {
    await expect(coverageService.evaluate({ lat: -1.25, lng: -78.615 })).resolves.toEqual({
      accepted: true,
      position: 'INTERIOR',
    })
    await expect(coverageService.evaluate({ lat: -1.25, lng: -78.6 })).resolves.toEqual({
      accepted: true,
      position: 'BOUNDARY',
    })
    await expect(coverageService.evaluate({ lat: -1.3, lng: -78.7 })).resolves.toEqual({
      accepted: false,
      position: 'EXTERIOR',
    })
  })

  it('un área con lados cruzados se rechaza y la cobertura activa sigue siendo A', async () => {
    await loginAsAdmin()

    const result = await rejection(coverageService.save({ location: STORE, coverage: BOW_TIE }))

    expect(result).toEqual(expect.objectContaining({ status: 400, code: 'STORE_COVERAGE_INVALID' }))
    expect(result.message).toMatch(/lados no se crucen/)
    await expect(coverageService.get()).resolves.toEqual(
      expect.objectContaining({ coverage: AREA_A.coverage }),
    )
  })

  it('una ubicación fuera de rango se rechaza sin cambiar nada', async () => {
    await loginAsAdmin()

    const result = await rejection(
      coverageService.save({ location: { lat: 95, lng: -78.6 }, coverage: AREA_A.coverage }),
    )

    expect(result.status).toBe(400)
    expect(['STORE_LOCATION_INVALID', 'VALIDATION_ERROR']).toContain(result.code)
    await expect(coverageService.get()).resolves.toEqual(
      expect.objectContaining({ location: STORE }),
    )
  })

  it('un CLIENT no puede cambiar la cobertura (403) y no queda nada a medias', async () => {
    await loginAsClient()

    const result = await rejection(
      coverageService.save({ location: { lat: -1.24, lng: -78.62 }, coverage: AREA_A.coverage }),
    )

    expect(result.status).toBe(403)
    expect(result.message).toMatch(/Solo un ADMIN/)
    await expect(coverageService.get()).resolves.toEqual(
      expect.objectContaining({ location: STORE }),
    )
  })

  it('sin una sesión válida el guardado se rechaza con 401', async () => {
    saveInvalidToken()

    const result = await rejection(coverageService.save(AREA_A))

    expect(result.status).toBe(401)
  })
})
