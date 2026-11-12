import { ordersService } from '../../features/orders/ordersService'
import type { AdminPurchaseResult, CreateAdminPurchaseInput } from '../../features/orders/types'
import { shopService } from '../../features/shop/shopService'
import { fromPolygon } from '../../features/store-coverage/coverageDraft'
import type { GeoPoint } from '../../types/geo'
import { uniqueSuffix } from './session'

/** Un punto dentro de la cobertura configurada (promedio de sus vértices) y un vértice (borde). */
export async function coveragePoints(): Promise<{ inside: GeoPoint; border: GeoPoint }> {
  const coverage = await shopService.storeCoverage()
  if (!coverage.configured) {
    throw new Error(
      'Configura la tienda y su cobertura (o ejecuta la semilla) antes de estas pruebas',
    )
  }
  const area = fromPolygon(coverage.coverage)
  return {
    border: area[0],
    inside: {
      lat: area.reduce((sum, p) => sum + p.lat, 0) / area.length,
      lng: area.reduce((sum, p) => sum + p.lng, 0) / area.length,
    },
  }
}

interface GuestSale {
  productId: string
  quantity?: number
  scheduledDeliveryDate: string
  location: GeoPoint
  /** Opcional desde #42: se envía para que el pedido siga siendo planificable hasta backend #49. */
  zoneId?: string
  name?: string
}

/** Cuerpo de una venta de invitado en efectivo (backend #45). */
export const guestSaleInput = ({
  productId,
  quantity = 1,
  scheduledDeliveryDate,
  location,
  zoneId,
  name = `IT Comprador ${uniqueSuffix()}`,
}: GuestSale): CreateAdminPurchaseInput & { zoneId?: string } => ({
  buyer: { type: 'GUEST', name, contactPhone: '0990000000' },
  payment: { method: 'CASH' },
  deliveryAddress: `IT Venta ${uniqueSuffix()}`,
  items: [{ productId, quantity }],
  scheduledDeliveryDate,
  deliveryLat: location.lat,
  deliveryLng: location.lng,
  ...(zoneId && { zoneId }),
})

/** Registra una venta de invitado con una clave nueva y devuelve el pedido creado. */
export const createGuestSale = (sale: GuestSale): Promise<AdminPurchaseResult> =>
  ordersService.createPurchase(guestSaleInput(sale), crypto.randomUUID())
