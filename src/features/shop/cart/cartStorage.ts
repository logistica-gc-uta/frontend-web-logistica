export interface CartItem {
  productId: string
  quantity: number
}

/** Carrito guardado con su dueño: `null` es el de un visitante sin sesión. */
interface StoredCart {
  ownerId: string | null
  items: CartItem[]
}

const STORAGE_KEY = 'regalia.cart'

const isCartItem = (value: unknown): value is CartItem =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as CartItem).productId === 'string' &&
  Number.isInteger((value as CartItem).quantity) &&
  (value as CartItem).quantity > 0

function read(): StoredCart {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    // Formato anterior (#19): una lista sin dueño, que pertenece al visitante.
    if (Array.isArray(parsed)) return { ownerId: null, items: parsed.filter(isCartItem) }
    const stored = parsed as Partial<StoredCart> | null
    if (stored && Array.isArray(stored.items)) {
      return {
        ownerId: typeof stored.ownerId === 'string' ? stored.ownerId : null,
        items: stored.items.filter(isCartItem),
      }
    }
  } catch {
    // Datos dañados: se empieza con un carrito vacío.
  }
  return { ownerId: null, items: [] }
}

/**
 * Carrito en el navegador: solo productos y cantidades (nunca precios, stock ni datos de pago).
 * Precio y stock se revalidan con la API; el checkout los confirma.
 */
export const cartStorage = {
  /**
   * Carrito de `ownerId`. El de un visitante pasa al cliente que inicia sesión; el de otra cuenta
   * no se muestra nunca (se descarta).
   */
  load(ownerId: string | null = null): CartItem[] {
    const stored = read()
    if (stored.ownerId === ownerId || stored.ownerId === null) return stored.items
    return []
  },

  save(items: CartItem[], ownerId: string | null = null): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ownerId, items } satisfies StoredCart))
    } catch {
      // Sin almacenamiento (modo privado o bloqueado) el carrito vive solo en memoria.
    }
  },

  clear(): void {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Nada que limpiar.
    }
  },
}
