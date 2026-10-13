import { Button } from '../../components/ui/Button'
import { SelectField } from '../../components/ui/SelectField'
import { TextField } from '../../components/ui/TextField'
import { formatCurrency } from '../../lib/format/formatCurrency'
import type { Product } from '../products/types'
import { EMPTY_ORDER_ITEM } from './orderValidation'
import type { OrderItemFormValue } from './types'

interface OrderItemsEditorProps {
  items: OrderItemFormValue[]
  products: Product[]
  onChange: (items: OrderItemFormValue[]) => void
  error?: string
}

/** Líneas de producto y cantidad del pedido, con alta y baja de líneas. */
export function OrderItemsEditor({ items, products, onChange, error }: OrderItemsEditorProps) {
  const updateItem = (index: number, patch: Partial<OrderItemFormValue>) =>
    onChange(items.map((item, position) => (position === index ? { ...item, ...patch } : item)))

  return (
    <fieldset className="items-editor">
      <legend>Productos</legend>

      {items.map((item, index) => (
        <div key={index} className="items-editor__row">
          <SelectField
            label={`Producto ${index + 1}`}
            value={item.productId}
            onChange={(event) => updateItem(index, { productId: event.target.value })}
          >
            <option value="">Selecciona un producto</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {`${product.name} · ${formatCurrency(product.price)} · ${product.stock} en stock`}
              </option>
            ))}
          </SelectField>
          <TextField
            label={`Cantidad ${index + 1}`}
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            value={item.quantity}
            onChange={(event) => updateItem(index, { quantity: event.target.value })}
          />
          <Button
            variant="secondary"
            disabled={items.length === 1}
            aria-label={`Quitar producto ${index + 1}`}
            onClick={() => onChange(items.filter((_, position) => position !== index))}
          >
            Quitar
          </Button>
        </div>
      ))}

      <Button variant="secondary" onClick={() => onChange([...items, EMPTY_ORDER_ITEM])}>
        Agregar producto
      </Button>

      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  )
}
