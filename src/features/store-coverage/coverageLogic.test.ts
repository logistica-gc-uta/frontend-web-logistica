import { AxiosError } from 'axios'
import { describe, expect, it, vi } from 'vitest'
import { apiClient } from '../../lib/http/apiClient'
import { AREA, STORE, savedCoverage } from '../../test/coverageFixtures'
import { createHttpError, createHttpResponse } from '../../test/http'
import {
  MAX_VERTICES,
  draftFrom,
  draftProblem,
  fromPolygon,
  hasChanges,
  toPolygon,
  toSaveInput,
} from './coverageDraft'
import { describeCoverageError } from './coverageErrors'
import { coverageService } from './coverageService'

const errorBody = (code: string) => ({ data: { error: { code, message: 'x', details: {} } } })

describe('cobertura · conversión GeoJSON', () => {
  it('convierte vértices {lat, lng} a un anillo cerrado de [lng, lat]', () => {
    expect(toPolygon(AREA)).toEqual(savedCoverage().coverage)
  })

  it('lee el polígono del backend sin repetir el punto de cierre', () => {
    expect(fromPolygon(savedCoverage().coverage)).toEqual(AREA)
  })

  it('sin configuración el borrador queda vacío: no se inventa tienda ni área', () => {
    expect(draftFrom({ configured: false })).toEqual({ store: null, vertices: [] })
  })

  it('el borrador de lo guardado no tiene cambios; mover un punto sí', () => {
    const saved = savedCoverage()
    const draft = draftFrom(saved)

    expect(hasChanges(draft, saved)).toBe(false)
    expect(hasChanges({ ...draft, store: { lat: -1.25, lng: -78.62 } }, saved)).toBe(true)
    expect(hasChanges({ ...draft, vertices: draft.vertices.slice(1) }, saved)).toBe(true)
    expect(hasChanges({ store: null, vertices: [] }, { configured: false })).toBe(false)
  })
})

describe('cobertura · revisión antes de enviar', () => {
  it('pide la tienda y al menos 3 puntos; acepta un área completa', () => {
    expect(draftProblem({ store: null, vertices: AREA })).toMatch(/Ubica la tienda/)
    expect(draftProblem({ store: STORE, vertices: AREA.slice(0, 2) })).toMatch(/al menos 3/)
    expect(draftProblem({ store: STORE, vertices: AREA })).toBeNull()
  })

  it('no permite más de 256 puntos', () => {
    const many = Array.from({ length: MAX_VERTICES + 1 }, (_, i) => ({
      lat: -1.2,
      lng: -78 - i / 1000,
    }))
    expect(draftProblem({ store: STORE, vertices: many })).toMatch(/como máximo 256/)
  })

  it('arma el cuerpo del PUT con la tienda y el polígono cerrado', () => {
    expect(toSaveInput({ store: STORE, vertices: AREA })).toEqual({
      location: STORE,
      coverage: savedCoverage().coverage,
    })
  })
})

describe('coverageService', () => {
  it('lee GET /store-coverage, guarda con PUT /admin/store-coverage y evalúa con POST', async () => {
    const get = vi
      .spyOn(apiClient, 'get')
      .mockResolvedValue(createHttpResponse({ configured: false }))
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue(createHttpResponse(savedCoverage()))
    const post = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValue(createHttpResponse({ accepted: true, position: 'BOUNDARY' }))
    const input = toSaveInput({ store: STORE, vertices: AREA })

    await expect(coverageService.get()).resolves.toEqual({ configured: false })
    await expect(coverageService.save(input)).resolves.toEqual(savedCoverage())
    await expect(coverageService.evaluate(STORE)).resolves.toEqual({
      accepted: true,
      position: 'BOUNDARY',
    })
    expect(get).toHaveBeenCalledWith('/store-coverage')
    expect(put).toHaveBeenCalledWith('/admin/store-coverage', input)
    expect(post).toHaveBeenCalledWith('/store-coverage/evaluate', STORE)
  })
})

describe('cobertura · errores', () => {
  it('explica cada error por su código, no por el texto del backend', () => {
    expect(
      describeCoverageError(createHttpError(400, errorBody('STORE_COVERAGE_INVALID')), 'f'),
    ).toMatch(/lados no se crucen/)
    expect(
      describeCoverageError(createHttpError(400, errorBody('STORE_LOCATION_INVALID')), 'f'),
    ).toMatch(/ubicación de la tienda/)
    expect(
      describeCoverageError(createHttpError(409, errorBody('STORE_NOT_CONFIGURED')), 'f'),
    ).toMatch(/guárdalas antes/)
  })

  it('distingue sesión vencida, falta de permisos, red caída y errores desconocidos', () => {
    expect(describeCoverageError(createHttpError(401), 'f')).toMatch(/sesión venció/)
    expect(describeCoverageError(createHttpError(403), 'f')).toMatch(/Solo un ADMIN/)
    expect(describeCoverageError(new AxiosError('Network Error'), 'f')).toMatch(/conectar/)
    expect(describeCoverageError(createHttpError(500), 'Falló')).toBe('Falló')
  })
})
