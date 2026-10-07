const TOKEN_KEY = 'logistica.token'

/** Persistencia del token JWT. Centralizado para poder cambiar el mecanismo en un solo lugar. */
export const tokenStorage = {
  get: (): string | null => localStorage.getItem(TOKEN_KEY),
  set: (token: string): void => localStorage.setItem(TOKEN_KEY, token),
  clear: (): void => localStorage.removeItem(TOKEN_KEY),
}
