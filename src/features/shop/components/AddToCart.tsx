import { useState } from 'react'
import { Alert } from '../../../components/ui/Alert'
import { Button } from '../../../components/ui/Button'
import { useFetch } from '../../../hooks/useFetch'
import { useCart } from '../cart/cartContext'
import { shopService } from '../shopService'
import type { ShopProduct } from '../types'

const isWholeNumber = (text: string) => /^\d+$/.test(text)

/**
 * Cantidad y «Añadir al carrito». El máximo es min(stock, límite por SKU del pedido) menos lo que ya
 * está en el carrito; el límite se lee de `GET /shop/settings` porque el ADMIN puede cambiarlo.
 * Precio y stock no quedan reservados: se revalidan en el checkout.
 */
export function AddToCart({ product }: { product: ShopProduct }) {
  const settings = useFetch(shopService.settings, 'No se pudo consultar el límite por pedido')
  const { addItem, quantityOf } = useCart()
  const [quantity, setQuantity] = useState('1')
  const [error, setError] = useState<string | null>(null)
  const [added, setAdded] = useState<number | null>(null)

  const limit = settings.data?.maxUnitsPerSkuPerOrder
  const inCart = quantityOf(product.id)
  const maximum = limit === undefined ? 0 : Math.min(product.stock, limit) - inCart

  let blockedReason: string | null = null
  if (!product.isAvailable)
    blockedReason = 'Este regalo está agotado: no se puede añadir al carrito.'
  else if (limit === undefined) blockedReason = null
  else if (maximum <= 0) {
    blockedReason =
      inCart >= limit
        ? `Ya tienes en el carrito el máximo de ${limit} unidades por pedido.`
        : 'Ya tienes en el carrito todas las unidades disponibles.'
  }

  const canAdd = product.isAvailable && limit !== undefined && maximum > 0

  const change = (next: string) => {
    setQuantity(next)
    setError(null)
    setAdded(null)
  }

  const add = () => {
    const value = Number(quantity)
    if (!isWholeNumber(quantity) || value < 1) return setError('Indica una cantidad entera desde 1')
    if (value > maximum) return setError(`Puedes añadir como máximo ${maximum}`)
    addItem(product.id, value)
    setAdded(value)
    setQuantity('1')
  }

  const current = isWholeNumber(quantity) ? Number(quantity) : 1

  return (
    <div className="buy add-to-cart">
      {settings.error ? (
        <Alert>
          <span>{settings.error}. No se puede añadir hasta conocerlo.</span>{' '}
          <Button variant="secondary" onClick={settings.reload}>
            Reintentar
          </Button>
        </Alert>
      ) : (
        limit !== undefined && (
          <p className="text-muted">
            Máximo {limit} unidades de este regalo por pedido
            {inCart > 0 && ` · ya tienes ${inCart} en el carrito`}.
          </p>
        )
      )}

      <label htmlFor="quantity-input" className="quantity-label">
        Cantidad
      </label>
      <div className="quantity" role="group" aria-label="Selector de cantidad">
        <button
          type="button"
          className="btn btn--secondary quantity__btn"
          aria-label="Quitar una unidad"
          disabled={!canAdd || current <= 1}
          onClick={() => change(String(current - 1))}
        >
          −
        </button>
        <input
          id="quantity-input"
          className="field__input quantity__input"
          type="number"
          inputMode="numeric"
          min={1}
          max={Math.max(maximum, 1)}
          step={1}
          value={quantity}
          disabled={!canAdd}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'quantity-error' : undefined}
          onChange={(event) => change(event.target.value)}
        />
        <button
          type="button"
          className="btn btn--secondary quantity__btn"
          aria-label="Agregar una unidad"
          disabled={!canAdd || current >= maximum}
          onClick={() => change(String(current + 1))}
        >
          +
        </button>
      </div>
      {error && (
        <p id="quantity-error" className="field__error">
          {error}
        </p>
      )}
      {blockedReason && <p className="add-to-cart__blocked">{blockedReason}</p>}

      <Button className="cta" disabled={!canAdd} onClick={add}>
        Añadir al carrito <span aria-hidden="true">↗</span>
      </Button>
      {added !== null && (
        <p role="status" className="add-to-cart__added">
          Se {added === 1 ? 'añadió 1 unidad' : `añadieron ${added} unidades`} al carrito.
        </p>
      )}
    </div>
  )
}
