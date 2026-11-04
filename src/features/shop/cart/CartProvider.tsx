import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { CartContext, type CartContextValue } from './cartContext'
import { cartStorage, type CartItem } from './cartStorage'

/**
 * Carrito compartido del Shop. Es la única fuente del contador y de `addItem(productId, quantity)`;
 * el checkout (#20) parte de estos mismos datos en lugar de crear otro carrito.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(cartStorage.load)

  useEffect(() => cartStorage.save(items), [items])

  const addItem = useCallback((productId: string, quantity: number) => {
    if (!Number.isInteger(quantity) || quantity < 1) return
    setItems((current) => {
      const existing = current.find((item) => item.productId === productId)
      if (!existing) return [...current, { productId, quantity }]
      return current.map((item) =>
        item.productId === productId ? { ...item, quantity: item.quantity + quantity } : item,
      )
    })
  }, [])

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      count: items.reduce((total, item) => total + item.quantity, 0),
      quantityOf: (productId) => items.find((item) => item.productId === productId)?.quantity ?? 0,
      addItem,
    }),
    [items, addItem],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}
