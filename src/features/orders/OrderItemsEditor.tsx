import { Button } from '../../components/ui/Button'
import type { Product } from '../products/types'
import { EMPTY_ORDER_ITEM, itemIssues } from './orderValidation'
import { ProductCombobox } from './ProductCombobox'
import type { OrderItemFormValue } from './types'

interface OrderItemsEditorProps {
  items: OrderItemFormValue[]
  products: Product[]
  onChange: (items: OrderItemFormValue[]) => void
  error?: string
}

/** Líneas de producto y cantidad del pedido, con alta y baja de líneas y avisos junto a cada campo. */
export function OrderItemsEditor({ items, products, onChange, error }: OrderItemsEditorProps) {
  const updateItem = (index: number, patch: Partial<OrderItemFormValue>) =>
    onChange(items.map((item, position) => (position === index ? { ...item, ...patch } : item)))

  // Los campos vacíos se señalan cuando ya se intentó registrar (hay error); el stock, siempre.
  const issues = itemIssues(items, products, Boolean(error))

  const step = (index: number, delta: number) => {
    const current = Number.parseInt(items[index].quantity, 10)
    updateItem(index, {
      quantity: String(Math.max(1, (Number.isNaN(current) ? 0 : current) + delta)),
    })
  }

  return (
    <fieldset className="items-editor">
      <legend>Productos</legend>

      {items.map((item, index) => {
        const issue = issues[index]
        const product = products.find((candidate) => candidate.id === item.productId)
        const productId = `item-product-${index}`
        const quantityId = `item-quantity-${index}`
        return (
          <div key={index} className="items-editor__row">
            <ProductCombobox
              id={productId}
              label={`Producto ${index + 1}`}
              products={products}
              value={item.productId}
              onChange={(chosen) => updateItem(index, { productId: chosen })}
              error={issue.product}
            />

            <div className="field items-editor__quantity">
              <label htmlFor={quantityId} className="field__label">
                {`Cantidad ${index + 1}`}
              </label>
              <div className="stepper" data-invalid={issue.quantity ? true : undefined}>
                <button
                  type="button"
                  className="stepper__button"
                  aria-label={`Una unidad menos del producto ${index + 1}`}
                  disabled={Number.parseInt(item.quantity, 10) <= 1}
                  onClick={() => step(index, -1)}
                >
                  −
                </button>
                <input
                  id={quantityId}
                  className="stepper__input"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max={product?.stock}
                  step="1"
                  value={item.quantity}
                  aria-invalid={issue.quantity ? true : undefined}
                  aria-describedby={issue.quantity ? `${quantityId}-error` : undefined}
                  onChange={(event) => updateItem(index, { quantity: event.target.value })}
                />
                <button
                  type="button"
                  className="stepper__button"
                  aria-label={`Una unidad más del producto ${index + 1}`}
                  disabled={
                    product !== undefined && Number.parseInt(item.quantity, 10) >= product.stock
                  }
                  onClick={() => step(index, 1)}
                >
                  +
                </button>
              </div>
              {issue.quantity && (
                <p id={`${quantityId}-error`} className="field__error">
                  {issue.quantity}
                </p>
              )}
            </div>

            <Button
              variant="secondary"
              disabled={items.length === 1}
              aria-label={`Quitar producto ${index + 1}`}
              onClick={() => onChange(items.filter((_, position) => position !== index))}
            >
              Quitar
            </Button>
          </div>
        )
      })}

      <Button variant="secondary" onClick={() => onChange([...items, EMPTY_ORDER_ITEM])}>
        Agregar producto
      </Button>

      {/* El resumen solo aparece cuando ninguna línea muestra ya su propio aviso (p. ej. «agrega un producto»). */}
      {error && !issues.some((issue) => issue.product || issue.quantity) && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  )
}
