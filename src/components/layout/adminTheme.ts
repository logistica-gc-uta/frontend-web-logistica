import { useEffect, useState } from 'react'

const STORAGE_KEY = 'regalia.admin-theme'

export function readAdminTheme(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark'
  } catch {
    return false
  }
}

/** Local visual preference for the panel. Independent from the shop toggle. */
export function useAdminTheme() {
  const [dark, setDark] = useState(readAdminTheme)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light')
    } catch {
      // Private mode: theme lives only in memory.
    }
  }, [dark])

  return { dark, toggle: () => setDark((current) => !current) }
}
