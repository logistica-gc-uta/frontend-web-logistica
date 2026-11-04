import { useState } from 'react'
import { Alert } from '../../components/ui/Alert'
import { AsyncContent } from '../../components/ui/AsyncContent'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { useFetch } from '../../hooks/useFetch'
import { useForm } from '../../hooks/useForm'
import { AppError } from '../../lib/errors/AppError'
import { describeCatalogError } from './catalogErrors'
import { catalogService } from './catalogService'
import { slugify, validateCategory, type CategoryForm } from './categoryForm'
import type { AdminCategory } from './types'

interface CategoryRow extends AdminCategory {
  productCount: number
}

/** Categorías con la cantidad de productos de cada una (en cualquier estado). */
const loadCategories = async (): Promise<CategoryRow[]> => {
  const categories = await catalogService.listCategories()
  const counts = await Promise.all(
    categories.map((category) => catalogService.countProducts(category.id)),
  )
  return categories.map((category, index) => ({ ...category, productCount: counts[index] }))
}

function NewCategoryForm({ onCreated }: { onCreated: (category: AdminCategory) => void }) {
  const [slugTouched, setSlugTouched] = useState(false)
  const form = useForm({
    initialValues: { name: '', slug: '', description: '' } satisfies CategoryForm,
    validate: (values) => validateCategory(values, true),
    errorMessage: 'No se pudo crear la categoría',
    resetOnSuccess: true,
    onSubmit: async ({ name, slug, description }) => {
      try {
        onCreated(
          await catalogService.createCategory({
            name: name.trim(),
            slug,
            description: description.trim() || null,
            isActive: true,
          }),
        )
        setSlugTouched(false)
      } catch (error) {
        throw new AppError(describeCatalogError(error, 'No se pudo crear la categoría'))
      }
    },
  })

  return (
    <form className="form" aria-label="Nueva categoría" noValidate onSubmit={form.handleSubmit}>
      {form.submitError && <Alert>{form.submitError}</Alert>}
      <TextField
        label="Nombre"
        value={form.values.name}
        onChange={(event) =>
          form.setFields({
            name: event.target.value,
            ...(!slugTouched && { slug: slugify(event.target.value) }),
          })
        }
        error={form.fieldErrors.name}
      />
      <TextField
        label="Slug (enlace en el Shop)"
        value={form.values.slug}
        onChange={(event) => {
          setSlugTouched(true)
          form.setFields({ slug: event.target.value })
        }}
        error={form.fieldErrors.slug}
      />
      <TextField
        label="Descripción (opcional)"
        value={form.values.description}
        onChange={(event) => form.setFields({ description: event.target.value })}
        error={form.fieldErrors.description}
      />
      <Button type="submit" isLoading={form.isSubmitting} loadingText="Creando...">
        Crear categoría
      </Button>
    </form>
  )
}

function CategoryItem({
  category,
  onChanged,
}: {
  category: CategoryRow
  onChanged: (message: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [name, setName] = useState(category.name)
  const [description, setDescription] = useState(category.description ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const save = async (
    changes: Parameters<typeof catalogService.updateCategory>[1],
    done: string,
  ) => {
    setSaving(true)
    setError(null)
    try {
      await catalogService.updateCategory(category.id, changes)
      setEditing(false)
      setConfirming(false)
      onChanged(done)
    } catch (failure) {
      setError(describeCatalogError(failure, 'No se pudo guardar la categoría'))
    } finally {
      setSaving(false)
    }
  }

  const submitEdit = () => {
    const found = validateCategory({ name, slug: category.slug, description }, false)
    if (found.name || found.description) return setError(found.name ?? found.description ?? null)
    void save(
      { name: name.trim(), description: description.trim() || null },
      `Categoría «${name.trim()}» actualizada.`,
    )
  }

  return (
    <li className="card category-item" aria-label={category.name}>
      <div className="category-item__header">
        <strong>{category.name}</strong>
        <span className={category.isActive ? 'badge badge--success' : 'badge'}>
          {category.isActive ? 'Activa' : 'Inactiva'}
        </span>
      </div>
      <p className="text-muted">
        /{category.slug} · {category.productCount}{' '}
        {category.productCount === 1 ? 'producto' : 'productos'}
        {category.description && ` · ${category.description}`}
      </p>
      {error && <Alert>{error}</Alert>}

      {editing ? (
        <div className="form" role="group" aria-label={`Editar ${category.name}`}>
          <TextField
            label="Nombre"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <TextField
            label="Descripción (opcional)"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <p className="text-muted">El slug no se cambia: lo usan los enlaces del Shop.</p>
          <div className="catalog-actions">
            <Button isLoading={saving} loadingText="Guardando..." onClick={submitEdit}>
              Guardar
            </Button>
            <Button variant="secondary" disabled={saving} onClick={() => setEditing(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : confirming ? (
        <div
          className="confirm-inline"
          role="group"
          aria-label={`Confirmar: desactivar ${category.name}`}
        >
          <span>
            {category.productCount > 0
              ? `Tiene ${category.productCount} ${category.productCount === 1 ? 'producto' : 'productos'}: dejarán de verse en el Shop hasta reactivarla. Los pedidos ya hechos no cambian.`
              : 'Dejará de aparecer en el Shop.'}
          </span>
          <Button
            isLoading={saving}
            loadingText="Guardando..."
            onClick={() =>
              void save({ isActive: false }, `Categoría «${category.name}» desactivada.`)
            }
          >
            Sí, desactivar
          </Button>
          <Button variant="secondary" disabled={saving} onClick={() => setConfirming(false)}>
            Cancelar
          </Button>
        </div>
      ) : (
        <div className="catalog-actions">
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Editar <span className="visually-hidden">{category.name}</span>
          </Button>
          {category.isActive ? (
            <Button variant="secondary" onClick={() => setConfirming(true)}>
              Desactivar <span className="visually-hidden">{category.name}</span>
            </Button>
          ) : (
            <Button
              variant="secondary"
              isLoading={saving}
              loadingText="Guardando..."
              onClick={() =>
                void save({ isActive: true }, `Categoría «${category.name}» activada.`)
              }
            >
              Activar <span className="visually-hidden">{category.name}</span>
            </Button>
          )}
        </div>
      )}
    </li>
  )
}

/** ADMIN-03 · Categorías del Shop: crear, editar y activar/desactivar (sin borrado físico). */
export function CategoriesPage() {
  const categories = useFetch(loadCategories, 'No se pudieron cargar las categorías')
  const [notice, setNotice] = useState<string | null>(null)

  const changed = (message: string) => {
    setNotice(message)
    categories.reload()
  }

  return (
    <main className="page">
      <h1>Categorías</h1>
      <p className="text-muted">
        Ocasiones del Shop REGALÍA. Una categoría inactiva oculta sus productos del Shop; nunca se
        borra ni cambia pedidos históricos.
      </p>
      <div className="page-grid">
        <section className="card" aria-labelledby="new-category-title">
          <h2 id="new-category-title">Nueva categoría</h2>
          <NewCategoryForm
            onCreated={(category) => changed(`Categoría «${category.name}» creada.`)}
          />
        </section>
        <section className="card" aria-labelledby="categories-title">
          <h2 id="categories-title">Categorías</h2>
          {notice && <Alert variant="success">{notice}</Alert>}
          <AsyncContent
            {...categories}
            onRetry={categories.reload}
            loadingText="Cargando categorías..."
          >
            {(rows) =>
              rows.length === 0 ? (
                <p className="empty-state">Todavía no hay categorías.</p>
              ) : (
                <ul className="category-list">
                  {rows.map((category) => (
                    <CategoryItem
                      key={`${category.id}-${category.isActive}-${category.name}`}
                      category={category}
                      onChanged={changed}
                    />
                  ))}
                </ul>
              )
            }
          </AsyncContent>
        </section>
      </div>
    </main>
  )
}
