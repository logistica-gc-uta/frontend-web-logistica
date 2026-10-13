import { useId, type ReactNode } from 'react'

/** Atributos que el control (input, select…) debe recibir para quedar asociado a su etiqueta y error. */
export interface FieldControlProps {
  id: string
  className: string
  'aria-invalid'?: true
  'aria-describedby'?: string
}

interface FieldProps {
  label: string
  error?: string
  id?: string
  children: (control: FieldControlProps) => ReactNode
}

/** Estructura común de un campo de formulario: etiqueta, control y mensaje de error accesibles. */
export function Field({ label, error, id, children }: FieldProps) {
  const generatedId = useId()
  const controlId = id ?? generatedId
  const errorId = `${controlId}-error`

  return (
    <div className="field">
      <label htmlFor={controlId} className="field__label">
        {label}
      </label>
      {children({
        id: controlId,
        className: 'field__input',
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error ? errorId : undefined,
      })}
      {error && (
        <p id={errorId} className="field__error">
          {error}
        </p>
      )}
    </div>
  )
}
