import { paths } from '../../../app/paths'

/** Only in-app shop paths. Rejects protocol-relative URLs and the admin panel. */
export function safeShopNext(raw: string | null | undefined, fallback = paths.shop): string {
  if (!raw) return fallback
  let next = raw
  try {
    next = decodeURIComponent(raw)
  } catch {
    return fallback
  }
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/admin')) return fallback
  return next
}

export function shopLoginSearch(next: string, extra?: { reason?: 'required' | 'expired' }): string {
  const params = new URLSearchParams()
  if (next && next !== paths.shop) params.set('next', next)
  if (extra?.reason) params.set('aviso', extra.reason)
  const query = params.toString()
  return query ? `${paths.shopLogin}?${query}` : paths.shopLogin
}
