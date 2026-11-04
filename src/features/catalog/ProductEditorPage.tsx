import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { paths, productEditPath } from '../../app/paths'
import { Alert } from '../../components/ui/Alert'
import { AsyncContent } from '../../components/ui/AsyncContent'
import { Button } from '../../components/ui/Button'
import { Field } from '../../components/ui/Field'
import { SelectField } from '../../components/ui/SelectField'
import { TextField } from '../../components/ui/TextField'
import { useFetch } from '../../hooks/useFetch'
import { useForm } from '../../hooks/useForm'
import { AppError } from '../../lib/errors/AppError'
import { formatCents } from '../shop/money'
import { shopErrorInfo } from '../shop/shopError'
import { describeCatalogError, ERROR_FIELDS } from './catalogErrors'
import { catalogService } from './catalogService'
import { ProductImagesEditor } from './ProductImagesEditor'
import {
  EMPTY_PRODUCT_FORM,
  formFromProduct,
  productChanges,
  publicationBlockers,
  toProductInput,
  validateProductForm,
  type ProductForm,
} from './productEditorForm'
import { PublicationButton } from './PublicationButton'
import type { AdminCategory, AdminProduct } from './types'

interface EditorLocationState {
  created?: boolean
}

/** El error del backend se muestra junto a su campo cuando corresponde (por ejemplo, SKU duplicado). */
function fieldError(error: unknown) {
  const field = ERROR_FIELDS[shopErrorInfo(error).code ?? ''] as keyof ProductForm | undefined
  return field ? { [field]: describeCatalogError(error, '') } : {}
}

function ProductFields({
  product,
  categories,
  onSaved,
}: {
  product: AdminProduct | null
  categories: AdminCategory[]
  onSaved: (product: AdminProduct) => void
}) {
  const isNew = product === null
  const [serverFieldErrors, setServerFieldErrors] = useState<
    Partial<Record<keyof ProductForm, string>>
  >({})
  const [saved, setSaved] = useState<string | null>(null)

  const form = useForm({
    initialValues: product ? formFromProduct(product) : EMPTY_PRODUCT_FORM,
    validate: (values) => validateProductForm(values, { isNew }),
    errorMessage: 'No se pudo guardar el producto',
    onSubmit: async (values) => {
      setServerFieldErrors({})
      setSaved(null)
      try {
        if (isNew) {
          onSaved(await catalogService.createProduct(toProductInput(values)))
          return
        }
        const changes = productChanges(values, product)
        if (Object.keys(changes).length === 0) {
          setSaved('No hay cambios para guardar.')
          return
        }
        // Se vuelve a cargar el producto real desde el servidor después de guardar.
        onSaved(await catalogService.updateProduct(product.id, changes))
      } catch (error) {
        const byField = fieldError(error)
        setServerFieldErrors(byField)
        throw new AppError(describeCatalogError(error, 'No se pudo guardar el producto'))
      }
    },
  })

  const { values, handleChange } = form
  const errors = { ...serverFieldErrors, ...form.fieldErrors }
  const dirty = isNew
    ? JSON.stringify(values) !== JSON.stringify(EMPTY_PRODUCT_FORM)
    : Object.keys(productChanges(values, product)).length > 0 || values.sku !== product.sku

  // Avisa antes de cerrar o recargar la pestaña con cambios sin guardar.
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  return (
    <section className="card" aria-labelledby="product-data-title">
      <h2 id="product-data-title">Datos del producto</h2>
      {form.submitError && <Alert>{form.submitError}</Alert>}
      {saved && <Alert variant="success">{saved}</Alert>}
      <form
        className="form"
        aria-label="Datos del producto"
        noValidate
        onSubmit={form.handleSubmit}
      >
        <TextField
          label="SKU"
          name="sku"
          value={values.sku}
          readOnly={!isNew}
          aria-readonly={!isNew}
          onChange={handleChange}
          error={errors.sku}
        />
        {!isNew && (
          <p className="text-muted">El SKU no se cambia: identifica el producto en los pedidos.</p>
        )}
        <TextField
          label="Nombre"
          name="name"
          value={values.name}
          onChange={handleChange}
          error={errors.name}
        />
        <Field label="Descripción" error={errors.description}>
          {(control) => (
            <textarea
              {...control}
              name="description"
              rows={4}
              maxLength={2000}
              value={values.description}
              onChange={(event) => form.setFields({ description: event.target.value })}
            />
          )}
        </Field>
        <SelectField
          label="Categoría"
          name="categoryId"
          value={values.categoryId}
          onChange={handleChange}
          error={errors.categoryId}
        >
          <option value="">Selecciona una categoría</option>
          {categories.map((category) => (
            <option
              key={category.id}
              value={category.id}
              disabled={!category.isActive && category.id !== product?.categoryId}
            >
              {category.name}
              {category.isActive ? '' : ' (inactiva)'}
            </option>
          ))}
        </SelectField>
        <div className="catalog-form__row">
          <TextField
            label="Precio (USD)"
            name="price"
            inputMode="decimal"
            placeholder="0,00"
            value={values.price}
            onChange={handleChange}
            error={errors.price}
          />
          <TextField
            label="Stock"
            name="stock"
            inputMode="numeric"
            value={values.stock}
            onChange={handleChange}
            error={errors.stock}
          />
        </div>
        <label className="catalog-form__check">
          <input
            type="checkbox"
            checked={values.isFeatured}
            onChange={(event) => form.setFields({ isFeatured: event.target.checked })}
          />
          Destacado en el inicio del Shop
        </label>
        {isNew && (
          <p className="text-muted">
            El producto se crea despublicado. Después agrega una imagen principal y publícalo.
          </p>
        )}
        <div className="catalog-actions">
          <Button type="submit" isLoading={form.isSubmitting} loadingText="Guardando...">
            {isNew ? 'Crear producto' : 'Guardar cambios'}
          </Button>
          {dirty && <span className="text-muted">Hay cambios sin guardar.</span>}
        </div>
      </form>
    </section>
  )
}

function PublicationPanel({
  product,
  categories,
  onChanged,
}: {
  product: AdminProduct
  categories: AdminCategory[]
  onChanged: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const active = useMemo(
    () =>
      new Set(categories.filter((category) => category.isActive).map((category) => category.id)),
    [categories],
  )
  const blockers = publicationBlockers(product, active)

  const change = async (publish: boolean) => {
    setSaving(true)
    setMessage(null)
    try {
      await catalogService.setPublication(product.id, publish)
      setMessage({
        ok: true,
        text: publish
          ? 'Publicado: ya se muestra en el Shop.'
          : 'Despublicado: se ocultó del Shop.',
      })
      onChanged()
    } catch (error) {
      setMessage({
        ok: false,
        text: describeCatalogError(error, 'No se pudo cambiar la publicación'),
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="card" aria-labelledby="publication-title">
      <h2 id="publication-title">Publicación</h2>
      {message && <Alert variant={message.ok ? 'success' : 'error'}>{message.text}</Alert>}
      <p>
        Estado:{' '}
        <span className={product.isPublished ? 'badge badge--success' : 'badge'}>
          {product.isPublished ? 'Publicado' : 'Despublicado'}
        </span>{' '}
        · {product.priceCents === null ? 'sin precio' : formatCents(product.priceCents)} · stock{' '}
        {product.stock}
      </p>
      {!product.isPublished && blockers.length > 0 && (
        <p className="text-muted" role="note">
          Para publicarlo falta: {blockers.join(', ')}.
        </p>
      )}
      <PublicationButton
        name={product.name}
        isPublished={product.isPublished}
        isSaving={saving}
        onConfirm={(publish) => void change(publish)}
      />
    </section>
  )
}

/** ADMIN-02 · Alta (`/productos/nuevo`) y edición (`/productos/:id`) de un producto del Shop. */
export function ProductEditorPage() {
  const { id } = useParams()
  const isNew = id === undefined
  const navigate = useNavigate()
  const created = (useLocation().state as EditorLocationState | null)?.created
  const [savedNotice, setSavedNotice] = useState(false)
  const categories = useFetch(catalogService.listCategories, 'No se pudieron cargar las categorías')
  const loadProduct = useCallback(
    () => (id ? catalogService.getProduct(id) : Promise.resolve(null)),
    [id],
  )
  const product = useFetch(loadProduct, 'No se pudo cargar el producto')

  return (
    <main className="page page-stack catalog-page">
      <nav aria-label="Ruta de navegación" className="breadcrumb">
        <ol>
          <li>
            <Link to={paths.products}>Productos</Link>
          </li>
          <li aria-current="page">{isNew ? 'Nuevo producto' : (product.data?.name ?? 'Editar')}</li>
        </ol>
      </nav>
      <h1>{isNew ? 'Nuevo producto' : 'Editar producto'}</h1>
      {savedNotice && <Alert variant="success">Cambios guardados.</Alert>}
      {created && (
        <Alert variant="success">
          Producto creado (despublicado). Agrega una imagen principal para poder publicarlo.
        </Alert>
      )}

      <AsyncContent
        {...categories}
        onRetry={categories.reload}
        loadingText="Cargando categorías..."
      >
        {(categoryList) => (
          <AsyncContent {...product} onRetry={product.reload} loadingText="Cargando producto...">
            {(current) =>
              current === null ? (
                <ProductFields
                  product={null}
                  categories={categoryList}
                  onSaved={(saved) =>
                    navigate(productEditPath(saved.id), { replace: true, state: { created: true } })
                  }
                />
              ) : (
                <div className="catalog-editor">
                  <ProductFields
                    key={current.updatedAt}
                    product={current}
                    categories={categoryList}
                    onSaved={() => {
                      setSavedNotice(true)
                      product.reload()
                    }}
                  />
                  <PublicationPanel
                    product={current}
                    categories={categoryList}
                    onChanged={product.reload}
                  />
                  <ProductImagesEditor product={current} onChanged={product.reload} />
                </div>
              )
            }
          </AsyncContent>
        )}
      </AsyncContent>
    </main>
  )
}
