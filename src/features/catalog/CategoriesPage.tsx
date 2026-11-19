import { useCallback, useState } from 'react'
import { Alert } from '../../components/ui/Alert'
import { AsyncContent } from '../../components/ui/AsyncContent'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { DataTable, type Column } from '../../components/ui/DataTable'
import { Drawer } from '../../components/ui/Drawer'
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

/** Atributos de los iconos de las acciones de la tabla. */
const ICON = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

const countLabel = (count: number) => `${count} ${count === 1 ? 'producto' : 'productos'}`

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
    <section className="card" aria-labelledby="category-data-title">
      <h2 id="category-data-title" className="visually-hidden">
        Datos de la categoría
      </h2>
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
        <div className="catalog-actions">
          <Button type="submit" isLoading={form.isSubmitting} loadingText="Creando...">
            Crear categoría
          </Button>
        </div>
      </form>
    </section>
  )
}

function EditCategoryForm({
  category,
  onSaved,
}: {
  category: CategoryRow
  onSaved: (message: string) => void
}) {
  const [name, setName] = useState(category.name)
  const [description, setDescription] = useState(category.description ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    const found = validateCategory({ name, slug: category.slug, description }, false)
    if (found.name || found.description) return setError(found.name ?? found.description ?? null)
    setSaving(true)
    setError(null)
    try {
      await catalogService.updateCategory(category.id, {
        name: name.trim(),
        description: description.trim() || null,
      })
      onSaved(`Categoría «${name.trim()}» actualizada.`)
    } catch (failure) {
      setError(describeCatalogError(failure, 'No se pudo guardar la categoría'))
      setSaving(false)
    }
  }

  return (
    <section className="card" aria-labelledby="category-data-title">
      <h2 id="category-data-title" className="visually-hidden">
        Datos de la categoría
      </h2>
      {error && <Alert>{error}</Alert>}
      <div className="form" role="group" aria-label={`Editar ${category.name}`}>
        <TextField label="Nombre" value={name} onChange={(event) => setName(event.target.value)} />
        <TextField
          label="Descripción (opcional)"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <p className="text-muted">
          /{category.slug} · {countLabel(category.productCount)}. El slug no se cambia: lo usan los
          enlaces del Shop.
        </p>
        <div className="catalog-actions">
          <Button isLoading={saving} loadingText="Guardando..." onClick={() => void submit()}>
            Guardar
          </Button>
        </div>
      </div>
    </section>
  )
}

/** ADMIN-03 · Categorías del Shop: crear, editar y activar/desactivar (sin borrado físico). */
export function CategoriesPage() {
  const categories = useFetch(loadCategories, 'No se pudieron cargar las categorías')
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  // Crear y editar se hacen en un panel lateral, sin salir del listado.
  const [panel, setPanel] = useState<{ mode: 'create' } | { mode: 'edit'; id: string } | null>(null)
  const [asking, setAsking] = useState<CategoryRow | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const closePanel = useCallback(() => setPanel(null), [])

  const changed = (text: string) => {
    setNotice({ ok: true, text })
    setPanel(null)
    categories.reload()
  }

  const setActive = async (category: CategoryRow, isActive: boolean) => {
    setSavingId(category.id)
    setNotice(null)
    try {
      await catalogService.updateCategory(category.id, { isActive })
      changed(`Categoría «${category.name}» ${isActive ? 'activada' : 'desactivada'}.`)
    } catch (failure) {
      setNotice({
        ok: false,
        text: describeCatalogError(failure, 'No se pudo guardar la categoría'),
      })
    } finally {
      setSavingId(null)
      setAsking(null)
    }
  }

  const columns: Column<CategoryRow>[] = [
    {
      header: 'Categoría',
      render: (category) => (
        <>
          <button
            type="button"
            className="catalog-table__name"
            onClick={() => setPanel({ mode: 'edit', id: category.id })}
          >
            {category.name}
          </button>
          <br />
          <small className="text-muted">/{category.slug}</small>
        </>
      ),
    },
    { header: 'Descripción', render: (category) => category.description || '—' },
    {
      header: 'Productos',
      className: 'catalog-table__center',
      render: (category) => countLabel(category.productCount),
    },
    {
      header: 'Estado',
      className: 'catalog-table__center',
      render: (category) => (
        <span className={category.isActive ? 'badge badge--success' : 'badge'}>
          {category.isActive ? 'Activa' : 'Inactiva'}
        </span>
      ),
    },
    {
      header: 'Acciones',
      className: 'catalog-table__center',
      render: (category) => (
        <div className="catalog-actions">
          <button
            type="button"
            className="catalog-table__icon"
            title="Editar categoría"
            onClick={() => setPanel({ mode: 'edit', id: category.id })}
          >
            <svg {...ICON}>
              <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z" />
            </svg>
            <span className="visually-hidden">Editar {category.name}</span>
          </button>
          <button
            type="button"
            className="catalog-table__icon"
            title={category.isActive ? 'Desactivar categoría' : 'Activar categoría'}
            disabled={savingId === category.id}
            onClick={() =>
              category.isActive ? setAsking(category) : void setActive(category, true)
            }
          >
            <svg {...ICON}>
              {category.isActive ? (
                <path d="M3 3l18 18M10.6 5.1A9.7 9.7 0 0 1 12 5c5 0 9 4.5 10 7a11.8 11.8 0 0 1-2.5 3.6M6.5 6.6A11.8 11.8 0 0 0 2 12c1 2.5 5 7 10 7a9.5 9.5 0 0 0 4.1-.9M9.9 9.9a3 3 0 0 0 4.2 4.2" />
              ) : (
                <>
                  <path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12Z" />
                  <circle cx="12" cy="12" r="3" />
                </>
              )}
            </svg>
            <span className="visually-hidden">
              {category.isActive ? 'Desactivar' : 'Activar'} {category.name}
            </span>
          </button>
        </div>
      ),
    },
  ]

  const editing =
    panel?.mode === 'edit' ? categories.data?.find((row) => row.id === panel.id) : undefined

  return (
    <main className="page page--wide page-stack catalog-page">
      <header className="catalog-header">
        <div>
          <h1>Categorías</h1>
          <p className="text-muted">
            Ocasiones del Shop. Una categoría inactiva oculta sus productos.
          </p>
        </div>
      </header>

      <section className="card catalog-card" aria-labelledby="categories-title">
        <h2 id="categories-title" className="visually-hidden">
          Categorías
        </h2>
        <div className="catalog-strip">
          <button
            type="button"
            className="catalog-new"
            onClick={() => setPanel({ mode: 'create' })}
          >
            <svg {...ICON} strokeWidth={2}>
              <path d="M12 5v14M5 12h14" />
            </svg>
            Nueva categoría
          </button>
          {categories.data && (
            <p className="catalog-strip__count" aria-live="polite">
              {categories.data.length} {categories.data.length === 1 ? 'categoría' : 'categorías'}
            </p>
          )}
        </div>

        {notice && <Alert variant={notice.ok ? 'success' : 'error'}>{notice.text}</Alert>}

        <AsyncContent
          {...categories}
          onRetry={categories.reload}
          loadingText="Cargando categorías..."
        >
          {(rows) => (
            <DataTable
              caption="Categorías del Shop"
              columns={columns}
              rows={rows}
              getRowKey={(category) => category.id}
              emptyMessage="Todavía no hay categorías."
            />
          )}
        </AsyncContent>
      </section>

      <Drawer
        open={panel !== null}
        onClose={closePanel}
        title={panel?.mode === 'edit' ? 'Editar categoría' : 'Nueva categoría'}
        titleId="category-panel-title"
        className="drawer__panel--form"
      >
        {panel?.mode === 'create' && (
          <NewCategoryForm
            onCreated={(category) => changed(`Categoría «${category.name}» creada.`)}
          />
        )}
        {editing && <EditCategoryForm key={editing.id} category={editing} onSaved={changed} />}
      </Drawer>

      {asking && (
        <ConfirmDialog
          title="¿Desactivar esta categoría?"
          confirmLabel="Sí, desactivar"
          isLoading={savingId === asking.id}
          onCancel={() => setAsking(null)}
          onConfirm={() => void setActive(asking, false)}
        >
          {asking.productCount > 0
            ? `Tiene ${countLabel(asking.productCount)}: dejarán de verse en el Shop hasta reactivarla. Los pedidos ya hechos no cambian.`
            : `«${asking.name}» dejará de aparecer en el Shop.`}
        </ConfirmDialog>
      )}
    </main>
  )
}
