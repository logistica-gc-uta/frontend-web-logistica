import { apiClient } from '../../lib/http/apiClient'

/** Cuenta CLIENT tal como la proyecta `GET /admin/clients` (backend #64): sin teléfono ni rol. */
export interface AdminClient {
  id: string
  name: string
  email: string
}

export interface AdminClientsPage {
  items: AdminClient[]
  total: number
  page: number
  pageSize: number
}

/** Límites de `ListAdminClientsDto`. */
export const CLIENT_SEARCH_MIN = 2
export const CLIENT_SEARCH_MAX = 100
export const CLIENT_PAGE_SIZE = 20

export const adminClientsService = {
  /**
   * Busca clientes registrados por nombre o correo (sin distinguir mayúsculas), ordenados por
   * nombre. El texto se recorta y se usa solo si tiene al menos 2 caracteres.
   */
  async search(text: string, page = 1): Promise<AdminClientsPage> {
    const search = text.trim().slice(0, CLIENT_SEARCH_MAX)
    const { data } = await apiClient.get<AdminClientsPage>('/admin/clients', {
      params: {
        ...(search.length >= CLIENT_SEARCH_MIN && { search }),
        page,
        pageSize: CLIENT_PAGE_SIZE,
      },
    })
    return data
  },
}
