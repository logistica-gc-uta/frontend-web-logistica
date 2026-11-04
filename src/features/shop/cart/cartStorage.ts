export interface CartItem {
  productId: string
  quantity: number
}

const STORAGE_KEY = 'regalia.cart'

const isCartItem = (value: unknown): value is CartItem =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as CartItem).productId === 'string' &&
  Number.isInteger((value as CartItem).quantity) &&
  (value as CartItem).quantity > 0

/**
 * Carrito del visitante en el navegador: solo productos y cantidades. Precio y stock no se guardan
 * ni se reservan; se vuelven a validar con la API en el checkout (#20).
 */
export const cartStorage = {
  load(): CartItem[] {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
      return Array.isArray(parsed) ? parsed.filter(isCartItem) : []
    } catch {
      return []
    }
  },

  save(items: CartItem[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch {
      // Sin almacenamiento (modo privado o bloqueado) el carrito vive solo en memoria.
    }
  },
}
