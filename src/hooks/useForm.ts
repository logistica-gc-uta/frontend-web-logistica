import { useState, type ChangeEvent, type FormEvent } from 'react'
import { getErrorMessage } from '../lib/http/apiError'

export type FormValues = Record<string, string>
export type FieldErrors<T extends FormValues> = Partial<Record<keyof T, string>>

interface UseFormOptions<T extends FormValues> {
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
export function useForm<T extends FormValues>({
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

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
    setFieldErrors((current) => ({ ...current, [name]: undefined }))
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

  return { values, fieldErrors, submitError, isSubmitting, handleChange, handleSubmit }
}
