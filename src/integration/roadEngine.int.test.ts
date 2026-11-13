import { beforeEach, describe, expect, it } from 'vitest'
import { planningService } from '../features/planning/planningService'
import { zonesService } from '../features/zones/zonesService'
import { expectHttpError } from './support/assertions'
import { loginAsAdmin, loginAsClient } from './support/session'

/**
 * #37 · Motor vial (backend #47) contra la API real. El backend local y el de CI no encienden OSRM
 * (`ROAD_ENGINE` vacío): se comprueba que la web sabe que las distancias son en línea recta y que,
 * aunque pida el trazado, no recibe uno inventado. El modo con OSRM se cubre con pruebas de
 * componentes y, si se levanta el motor a mano, con la verificación en el navegador.
 */
const FAR_DAY = '2099-12-30'

describe('Integración real · motor vial (/route-proposals/road-engine, #37)', () => {
  beforeEach(loginAsAdmin)

  it('informa el estado del motor sin exponer su dirección', async () => {
    const status = await planningService.roadEngine()

    expect(['HAVERSINE', 'OSRM']).toContain(status.engine)
    expect(status).toEqual(
      expect.objectContaining({
        configured: expect.any(Boolean),
        available: expect.any(Boolean),
        checkedAt: expect.any(String),
        message: expect.any(String),
      }),
    )
    expect(JSON.stringify(status)).not.toMatch(/https?:\/\//)
  })

  it('las propuestas dicen cómo se midieron y sin motor no traen trazado ni duraciones', async () => {
    const status = await planningService.roadEngine()
    const zone = (await zonesService.list()).find((candidate) => candidate.depotLocation !== null)

    const result = await planningService.getProposals({ date: FAR_DAY, zoneId: zone?.id })

    if (status.engine === 'HAVERSINE') {
      expect(result.distanceMethod).toBe('HAVERSINE_STRAIGHT_LINE')
      expect(result.roadMetrics).toBeUndefined()
      for (const proposal of result.proposals) {
        expect(proposal.geometry).toBeUndefined()
        expect(proposal.totalDurationSeconds).toBeUndefined()
      }
    } else {
      expect(result.distanceMethod).toBe('OSRM_ROAD_NETWORK')
    }
    expect(result.date).toBe(FAR_DAY)
  })

  it('un CLIENT no puede consultar el motor vial (403)', async () => {
    await loginAsClient()

    await expectHttpError(planningService.roadEngine(), 403)
  })
})
