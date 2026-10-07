import type { Product } from '../features/products/types'
import type { Zone } from '../features/zones/types'
import type { AuthUser, Session } from '../types/auth'

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

export const adminSession: Session = { token: 'token-admin', user: adminUser }

export const zones: Zone[] = [
  { id: 'zone-1', name: 'Ficoa', code: 'FIC-02', createdAt: '2026-10-07T12:00:00Z' },
  { id: 'zone-2', name: 'Huachi', code: 'HUA-03', createdAt: '2026-10-08T12:00:00Z' },
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
