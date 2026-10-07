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
