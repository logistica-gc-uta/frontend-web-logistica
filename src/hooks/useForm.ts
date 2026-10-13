import { useCallback, useState, type ChangeEvent, type FormEvent } from 'react'
import { getErrorMessage } from '../lib/http/apiError'

export type FieldErrors<T> = Partial<Record<keyof T, string>>

interface UseFormOptions<T extends object> {
  initialValues: T
  /** Devuelve los errores por campo; un objeto vacío significa que el formulario es válido. */
  validate: (values: T) => FieldErrors<T>
  /** Acción a ejecutar con los valores válidos (normalmente una llamada al backend). */
  onSubmit: (values: T) => Promise<void>
  /** Mensaje a mostrar si el error no trae uno propio. */
  errorMessage?: string
  /** Vuelve a los valores iniciales después de un envío exitoso. */
  resetOnSuccess?: boolean
}

/** Estado y comportamiento común de los formularios: valores, validación, envío y errores. */
export function useForm<T extends object>({
  initialValues,
  validate,
  onSubmit,
  errorMessage,
  resetOnSuccess = false,
}: UseFormOptions<T>) {
  const [values, setValues] = useState<T>(initialValues)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<T>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  /** Actualiza uno o varios campos (también los que no son texto) y limpia sus errores. */
  const setFields = useCallback((patch: Partial<T>) => {
    setValues((current) => ({ ...current, ...patch }))
    setFieldErrors((current) => {
      const next = { ...current }
      for (const name of Object.keys(patch)) delete next[name as keyof T]
      return next
    })
  }, [])

  const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target
    setFields({ [name]: value } as Partial<T>)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitError(null)

    const errors = validate(values)
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setIsSubmitting(true)
    try {
      await onSubmit(values)
      if (resetOnSuccess) setValues(initialValues)
    } catch (error) {
      setSubmitError(getErrorMessage(error, errorMessage))
    } finally {
      setIsSubmitting(false)
    }
  }

  return {
    values,
    fieldErrors,
    submitError,
    isSubmitting,
    handleChange,
    setFields,
    handleSubmit,
  }
}
