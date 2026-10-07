import type { AuthUser, Session } from '../../types/auth'

const TOKEN_KEY = 'logistica.token'
const USER_KEY = 'logistica.user'

function readUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

/** Persistencia de la sesión (token JWT + usuario). Único punto que toca localStorage. */
export const authStorage = {
  getToken: (): string | null => localStorage.getItem(TOKEN_KEY),

  getSession: (): Session | null => {
    const token = localStorage.getItem(TOKEN_KEY)
    const user = readUser()
    return token && user ? { token, user } : null
  },

  save: ({ token, user }: Session): void => {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(USER_KEY, JSON.stringify(user))
  },

  clear: (): void => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  },
}
