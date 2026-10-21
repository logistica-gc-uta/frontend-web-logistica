import { dayInGuayaquil, todayInGuayaquil } from '../../lib/time/guayaquil'
import { ordersService } from '../orders/ordersService'
import { dispatchService } from './dispatchService'
import type { DispatchAudit } from './types'

/** Decisiones de hoy con la dirección de cada pedido, para nombrarlo aunque ya no sea de hoy. */
export interface TodayAuditLog {
  records: DispatchAudit[]
  /** Dirección de entrega por pedido; falta si no se pudo consultar. */
  addresses: Record<string, string>
}

/**
 * Carga las decisiones registradas hoy y la dirección de sus pedidos. Un pedido reprogramado deja de
 * ser de hoy, así que se consulta por su id. Si una consulta falla, ese pedido se nombra por su id.
 */
export async function loadTodayAuditLog(now: Date = new Date()): Promise<TodayAuditLog> {
  const today = todayInGuayaquil(now)
  const records = (await dispatchService.audit()).filter(
    (record) => dayInGuayaquil(new Date(record.recordedAt)) === today,
  )
  const orderIds = [
    ...new Set(records.flatMap((record) => (record.orderId ? [record.orderId] : []))),
  ]
  const found = await Promise.all(
    orderIds.map((id) => ordersService.get(id).catch(() => undefined)),
  )
  return {
    records,
    addresses: Object.fromEntries(
      found.flatMap((order) => (order ? [[order.id, order.deliveryAddress]] : [])),
    ),
  }
}
