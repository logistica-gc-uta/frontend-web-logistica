/** Roles definidos en el backend (enum Role del contrato Prisma). */
export type Role = 'ADMIN' | 'DRIVER' | 'CLIENT'

export interface AuthUser {
  id: string
  name: string
  email: string
  role: Role
}

export interface Session {
  token: string
  user: AuthUser
}
