import { useId, type ReactNode } from 'react'
import { Alert } from '../ui/Alert'

interface ResourcePageProps {
  title: string
  description: string
  formTitle: string
  form: ReactNode
  listTitle: string
  /** Mensaje de confirmación a mostrar sobre el formulario tras crear un registro. */
  successMessage?: string | null
  /** Contenido del listado. */
  children: ReactNode
}

/** Estructura común de las páginas administrativas: formulario de alta + listado. */
export function ResourcePage({
  title,
  description,
  formTitle,
  form,
  listTitle,
  successMessage,
  children,
}: ResourcePageProps) {
  const formTitleId = useId()
  const listTitleId = useId()

  return (
    <main className="page">
      <h1>{title}</h1>
      <p className="text-muted">{description}</p>

      <div className="page-grid">
        <section className="card" aria-labelledby={formTitleId}>
          <h2 id={formTitleId}>{formTitle}</h2>
          {successMessage && <Alert variant="success">{successMessage}</Alert>}
          {form}
        </section>

        <section className="card" aria-labelledby={listTitleId}>
          <h2 id={listTitleId}>{listTitle}</h2>
          {children}
        </section>
      </div>
    </main>
  )
}
