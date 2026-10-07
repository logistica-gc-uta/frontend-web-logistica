import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { useForm } from '../../hooks/useForm'
import { toCreateProductInput, validateProduct } from './productValidation'
import { productsService } from './productsService'
import type { Product, ProductFormValues } from './types'

const INITIAL_VALUES: ProductFormValues = { name: '', description: '', price: '', stock: '' }

interface ProductFormProps {
  onCreated: (product: Product) => void
}

export function ProductForm({ onCreated }: ProductFormProps) {
  const { values, fieldErrors, submitError, isSubmitting, handleChange, handleSubmit } = useForm({
    initialValues: INITIAL_VALUES,
    validate: validateProduct,
    errorMessage: 'No se pudo crear el producto',
    resetOnSuccess: true,
    onSubmit: async (formValues) => {
      const product = await productsService.create(toCreateProductInput(formValues))
      onCreated(product)
    },
  })

  return (
    <form className="form" onSubmit={handleSubmit} noValidate aria-label="Nuevo producto">
      {submitError && <Alert>{submitError}</Alert>}
      <TextField
        label="Nombre"
        name="name"
        placeholder="Ej. Mouse Inalámbrico Logitech"
        value={values.name}
        onChange={handleChange}
        error={fieldErrors.name}
      />
      <TextField
        label="Descripción (opcional)"
        name="description"
        value={values.description}
        onChange={handleChange}
        error={fieldErrors.description}
      />
      <TextField
        label="Precio (USD)"
        name="price"
        type="number"
        inputMode="decimal"
        min="0.01"
        step="0.01"
        placeholder="Ej. 25.50"
        value={values.price}
        onChange={handleChange}
        error={fieldErrors.price}
      />
      <TextField
        label="Stock"
        name="stock"
        type="number"
        inputMode="numeric"
        min="0"
        step="1"
        placeholder="Ej. 10"
        value={values.stock}
        onChange={handleChange}
        error={fieldErrors.stock}
      />
      <Button type="submit" isLoading={isSubmitting} loadingText="Guardando...">
        Crear producto
      </Button>
    </form>
  )
}
