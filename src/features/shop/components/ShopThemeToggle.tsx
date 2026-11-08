interface ShopThemeToggleProps {
  dark: boolean
  onToggle: () => void
}

/** Preferencia visual local; no modifica el tema del panel ni la sesión del cliente. */
export function ShopThemeToggle({ dark, onToggle }: ShopThemeToggleProps) {
  return (
    <button
      id="theme-toggle"
      type="button"
      className="shop-theme-toggle"
      aria-label="Modo oscuro"
      aria-pressed={dark}
      title={dark ? 'Cambiar a modo claro' : 'Cambiar al tema vino'}
      onClick={onToggle}
    >
      <svg className="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <title>{dark ? 'Tema vino' : 'Tema claro'}</title>
        {dark ? (
          <path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z" />
        ) : (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
          </>
        )}
      </svg>
    </button>
  )
}
