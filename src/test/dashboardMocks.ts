import { vi } from 'vitest'
import { dispatchService } from '../features/dispatch/dispatchService'
import { monitorService } from '../features/monitor/monitorService'
import { ordersService } from '../features/orders/ordersService'
import { driversService } from '../features/planning/driversService'

/**
 * El inicio del panel consulta pedidos, bandeja y rutas al abrirse. Las pruebas que pasan por el
 * inicio sin interesarse en esos datos los simulan vacíos, para no hacer peticiones reales.
 */
export function mockDashboardServices() {
  vi.spyOn(ordersService, 'list').mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 })
  vi.spyOn(dispatchService, 'inbox').mockResolvedValue({
    date: '2030-02-14',
    urgencies: [],
    failedDeliveries: [],
  })
  vi.spyOn(monitorService, 'listRoutes').mockResolvedValue([])
  vi.spyOn(driversService, 'list').mockResolvedValue([])
  vi.spyOn(driversService, 'listForDay').mockResolvedValue([])
}
