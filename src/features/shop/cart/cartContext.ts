import { createContext, useContext } from 'react'
import type { CartItem } from './cartStorage'

export interface CartContextValue {
  items: CartItem[]
  /** Unidades en el carrito (suma de cantidades), para el contador de la cabecera. */
  count: number
  quantityOf: (productId: string) => number
  addItem: (productId: string, quantity: number) => void
}

export const CartContext = createContext<CartContextValue | null>(null)

export function useCart(): CartContextValue {
  const cart = useContext(CartContext)
  if (!cart) throw new Error('useCart debe usarse dentro de <CartProvider>')
  return cart
}
