import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAuth } from './useAuth'

describe('useAuth', () => {
  it('lanza un error descriptivo si se usa fuera de AuthProvider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => renderHook(() => useAuth())).toThrow(
      'useAuth debe usarse dentro de <AuthProvider>',
    )
  })
})
