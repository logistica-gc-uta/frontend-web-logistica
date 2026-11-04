import type { AuthUser, Session } from '../../../types/auth'

/** Clave propia del Shop: nunca se mezcla con la sesión del panel administrativo. */
const SESSION_KEY = 'regalia.session'

const isSession = (value: unknown): value is Session => {
  const session = value as Session
  return (
    typeof session?.token === 'string' &&
    typeof session.user?.id === 'string' &&
    session.user.role === 'CLIENT'
  )
}

/** Sesión del cliente (token JWT + usuario CLIENT). Solo se restaura si el rol es CLIENT. */
export const customerStorage = {
  get(): Session | null {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null')
      return isSession(parsed) ? parsed : null
    } catch {
      return null
    }
  },

  getToken: (): string | null => customerStorage.get()?.token ?? null,

  getUser: (): AuthUser | null => customerStorage.get()?.user ?? null,

  save(session: Session): void {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  },

  clear(): void {
    localStorage.removeItem(SESSION_KEY)
  },
}
