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
