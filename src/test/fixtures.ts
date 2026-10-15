import type { CreatedOrder, Order } from '../features/orders/types'
import type { Product } from '../features/products/types'
import type { Zone } from '../features/zones/types'
import type { AuthUser, Session } from '../types/auth'
import type { GeoPoint } from '../types/geo'

export const adminUser: AuthUser = {
  id: 'admin-1',
  name: 'Administrador General',
  email: 'admin@delivery.com',
  role: 'ADMIN',
}

export const driverUser: AuthUser = {
  id: 'driver-1',
  name: 'Carlos Chofer',
  email: 'driver1@delivery.com',
  role: 'DRIVER',
}

export const clientUser: AuthUser = {
  id: 'client-1',
  name: 'Ana Cliente',
  email: 'cliente@delivery.com',
  role: 'CLIENT',
}

export const adminSession: Session = { token: 'token-admin', user: adminUser }
export const driverSession: Session = { token: 'token-driver', user: driverUser }
export const clientSession: Session = { token: 'token-client', user: clientUser }

export const ficoaDepot: GeoPoint = { lat: -1.249, lng: -78.632 }

/** `zone-1` tiene depósito configurado; `zone-2` todavía no. */
export const zones: Zone[] = [
  {
    id: 'zone-1',
    name: 'Ficoa',
    code: 'FIC-02',
    createdAt: '2026-10-07T12:00:00Z',
    depotLat: ficoaDepot.lat,
    depotLng: ficoaDepot.lng,
    depotLocation: ficoaDepot,
  },
  {
    id: 'zone-2',
    name: 'Huachi',
    code: 'HUA-03',
    createdAt: '2026-10-08T12:00:00Z',
    depotLat: null,
    depotLng: null,
    depotLocation: null,
  },
]

export const products: Product[] = [
  {
    id: 'product-1',
    name: 'Laptop HP Pavilion 15',
    description: 'Laptop para trabajo y estudio',
    price: 750,
    stock: 15,
    createdAt: '2026-10-07T12:00:00Z',
  },
  {
    id: 'product-2',
    name: 'Mouse Inalámbrico Logitech',
    description: null,
    price: 25.5,
    stock: 50,
    createdAt: '2026-10-07T12:00:00Z',
  },
]

/** Pedido apto para planificación, a nombre de un invitado. */
export const guestOrder: Order = {
  id: 'order-1',
  userId: null,
  recipientType: 'GUEST',
  recipientName: 'María Pérez',
  recipientPhone: '0991234567',
  zoneId: 'zone-1',
  deliveryAddress: 'Av. Los Chasquis y Río Guayllabamba',
  deliveryLat: -1.2491,
  deliveryLng: -78.6317,
  scheduledDeliveryDate: '2030-02-14T15:00:00Z',
  status: 'PENDING',
  total: 801,
  routeId: null,
  createdAt: '2026-10-12T12:00:00Z',
  items: [
    {
      id: 'item-1',
      productId: 'product-1',
      quantity: 1,
      price: 750,
      product: { id: 'product-1', name: 'Laptop HP Pavilion 15' },
    },
    {
      id: 'item-2',
      productId: 'product-2',
      quantity: 2,
      price: 25.5,
      product: { id: 'product-2', name: 'Mouse Inalámbrico Logitech' },
    },
  ],
  zone: { id: 'zone-1', name: 'Ficoa', code: 'FIC-02' },
  deliveryLocation: { lat: -1.2491, lng: -78.6317 },
  planningEligibility: { eligible: true, reasons: [] },
}

/** Pedido de un cliente registrado, todavía sin coordenadas: no es apto para planificación. */
export const clientOrderWithoutLocation: Order = {
  ...guestOrder,
  id: 'order-2',
  userId: 'client-1',
  recipientType: null,
  recipientName: null,
  recipientPhone: null,
  deliveryAddress: 'Calle Bolívar 123',
  deliveryLat: null,
  deliveryLng: null,
  deliveryLocation: null,
  status: 'ASSIGNED',
  total: 25.5,
  user: { id: 'client-1', name: 'Ana Cliente' },
  planningEligibility: { eligible: false, reasons: ['MISSING_DELIVERY_COORDINATES'] },
}

export const orders: Order[] = [guestOrder, clientOrderWithoutLocation]

/** Lo que devuelve `POST /orders/admin` para `guestOrder`: sin productos, zona ni aptitud. */
export const createdGuestOrder: CreatedOrder = {
  id: guestOrder.id,
  userId: guestOrder.userId,
  recipientType: guestOrder.recipientType,
  recipientName: guestOrder.recipientName,
  recipientPhone: guestOrder.recipientPhone,
  zoneId: guestOrder.zoneId,
  deliveryAddress: guestOrder.deliveryAddress,
  deliveryLat: guestOrder.deliveryLat,
  deliveryLng: guestOrder.deliveryLng,
  scheduledDeliveryDate: guestOrder.scheduledDeliveryDate,
  status: guestOrder.status,
  total: guestOrder.total,
  routeId: guestOrder.routeId,
  createdAt: guestOrder.createdAt,
}
