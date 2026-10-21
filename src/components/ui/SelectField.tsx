import type { SelectHTMLAttributes } from 'react'
import { Field } from './Field'

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  error?: string
}

/** Lista desplegable con etiqueta y mensaje de error accesibles. Las opciones se pasan como hijos. */
export function SelectField({ label, error, id, ...props }: SelectFieldProps) {
  return (
    <Field label={label} error={error} id={id}>
      {(control) => <select {...props} {...control} />}
    </Field>
  )
}
