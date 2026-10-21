import { describe, expect, it, vi } from 'vitest'
import { apiClient } from '../../lib/http/apiClient'
import { createHttpResponse } from '../../test/http'
import { proposalsResponse, savedDraft } from '../../test/planningFixtures'
import { planningService } from './planningService'

describe('planningService', () => {
  it('getProposals consulta GET /route-proposals con la fecha, la zona y un tiempo máximo', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue(createHttpResponse(proposalsResponse))
    const query = { date: '2030-02-14', zoneId: 'zone-1' }

    await expect(planningService.getProposals(query)).resolves.toEqual(proposalsResponse)
    expect(get).toHaveBeenCalledWith('/route-proposals', { params: query, timeout: 30_000 })
  })

  it('confirmRoute envía la propuesta a POST /routes y devuelve la ruta DRAFT', async () => {
    const input = { zoneId: 'zone-1', routeDate: '2030-02-14T15:00:00Z', orderIds: ['a', 'b'] }
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue(createHttpResponse(savedDraft()))

    await expect(planningService.confirmRoute(input)).resolves.toEqual(savedDraft())
    expect(post).toHaveBeenCalledWith('/routes', input, { timeout: 30_000 })
  })
})
