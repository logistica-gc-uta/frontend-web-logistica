import { apiClient } from '../../lib/http/apiClient'
import type { CreateZoneInput, Zone } from './types'

const RESOURCE = '/zones'

export const zonesService = {
  async list(): Promise<Zone[]> {
    const { data } = await apiClient.get<Zone[]>(RESOURCE)
    return data
  },

  async create(input: CreateZoneInput): Promise<Zone> {
    const { data } = await apiClient.post<Zone>(RESOURCE, input)
    return data
  },
}
