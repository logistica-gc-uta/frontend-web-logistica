import { describe, expect, it, vi } from 'vitest'
import { apiClient } from '../../lib/http/apiClient'
import { zones } from '../../test/fixtures'
import { createHttpResponse } from '../../test/http'
import { zonesService } from './zonesService'

describe('zonesService', () => {
  it('list consulta GET /zones', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue(createHttpResponse(zones))

    await expect(zonesService.list()).resolves.toEqual(zones)
    expect(get).toHaveBeenCalledWith('/zones')
  })

  it('create envía los datos a POST /zones', async () => {
    const input = { name: 'Huachi', code: 'HUA-03' }
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue(createHttpResponse(zones[1]))

    await expect(zonesService.create(input)).resolves.toEqual(zones[1])
    expect(post).toHaveBeenCalledWith('/zones', input)
  })
})
