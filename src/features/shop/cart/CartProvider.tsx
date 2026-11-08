import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useCustomer } from '../account/customerContext'
import { CartContext, type CartContextValue } from './cartContext'
import { cartStorage, type CartItem } from './cartStorage'

interface OwnedCart {
  ownerId: string | null
  items: CartItem[]
}

/** Carrito al cambiar de sesión: al cerrarla sigue como visitante; al ingresar se adopta el del visitante. */
function cartFor(previous: OwnedCart, ownerId: string | null): OwnedCart {
  const loggedOut = previous.ownerId !== null && ownerId === null
  if (loggedOut) {
    cartStorage.save(previous.items, null)
    return { ownerId: null, items: previous.items }
  }
  return { ownerId, items: cartStorage.load(ownerId) }
}

/**
 * Carrito compartido del Shop. Es la única fuente del contador y de `addItem(productId, quantity)`.
 * Pertenece a la sesión: el de un visitante pasa a su cuenta al ingresar, el de otra cuenta no se
 * muestra y al cerrar sesión el mismo carrito queda como visitante. Los productos viajan siempre
 * junto a su dueño, así nunca se guardan los de una cuenta a nombre de otra.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const { customer } = useCustomer()
  const ownerId = customer?.id ?? null
  const [cart, setCart] = useState<OwnedCart>(() => ({
    ownerId,
    items: cartStorage.load(ownerId),
  }))

  // Ajuste durante el render (patrón de React para estado derivado de props).
  if (cart.ownerId !== ownerId) setCart(cartFor(cart, ownerId))

  useEffect(() => {
    if (cart.ownerId === ownerId) cartStorage.save(cart.items, cart.ownerId)
  }, [cart, ownerId])

  const update = useCallback(
    (change: (items: CartItem[]) => CartItem[]) =>
      setCart((current) => ({ ...current, items: change(current.items) })),
    [],
  )

  const addItem = useCallback(
    (productId: string, quantity: number) => {
      if (!Number.isInteger(quantity) || quantity < 1) return
      update((items) =>
        items.some((item) => item.productId === productId)
          ? items.map((item) =>
              item.productId === productId ? { ...item, quantity: item.quantity + quantity } : item,
            )
          : [...items, { productId, quantity }],
      )
    },
    [update],
  )

  const setQuantity = useCallback(
    (productId: string, quantity: number) => {
      if (!Number.isInteger(quantity) || quantity < 1) return
      update((items) =>
        items.map((item) => (item.productId === productId ? { ...item, quantity } : item)),
      )
    },
    [update],
  )

  const removeItem = useCallback(
    (productId: string) => update((items) => items.filter((item) => item.productId !== productId)),
    [update],
  )

  const clear = useCallback(() => update(() => []), [update])

  const value = useMemo<CartContextValue>(
    () => ({
      items: cart.items,
      count: cart.items.reduce((total, item) => total + item.quantity, 0),
      quantityOf: (productId) =>
        cart.items.find((item) => item.productId === productId)?.quantity ?? 0,
      addItem,
      setQuantity,
      removeItem,
      clear,
    }),
    [cart.items, addItem, setQuantity, removeItem, clear],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}
