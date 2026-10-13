import type { InputHTMLAttributes } from 'react'
import { Field } from './Field'

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
}

/** Campo de texto con etiqueta y mensaje de error accesibles. */
export function TextField({ label, error, id, ...props }: TextFieldProps) {
  return (
    <Field label={label} error={error} id={id}>
      {(control) => <input {...props} {...control} />}
    </Field>
  )
}
