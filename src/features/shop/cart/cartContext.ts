import { createContext, useContext } from 'react'
import type { CartItem } from './cartStorage'

export interface CartContextValue {
  items: CartItem[]
  /** Unidades en el carrito (suma de cantidades), para el contador de la cabecera. */
  count: number
  quantityOf: (productId: string) => number
  /** Suma unidades; una línea repetida del mismo producto se consolida en una sola. */
  addItem: (productId: string, quantity: number) => void
  /** Fija la cantidad de una línea (entero ≥ 1). */
  setQuantity: (productId: string, quantity: number) => void
  removeItem: (productId: string) => void
  /** Vacía el carrito: solo después de una compra confirmada por el servidor. */
  clear: () => void
}

export const CartContext = createContext<CartContextValue | null>(null)

export function useCart(): CartContextValue {
  const cart = useContext(CartContext)
  if (!cart) throw new Error('useCart debe usarse dentro de <CartProvider>')
  return cart
}
