import { useId } from 'react'
import { PHONE_DIGITS, PHONE_PREFIX, sanitizePhone } from './orderInput'

interface PhoneFieldProps {
  label: string
  name: string
  /** Solo los 9 dígitos, sin el +593 ni el 0 inicial. */
  value: string
  onChange: (digits: string) => void
  error?: string
}

/** Celular de Ecuador: el +593 va fijo a la izquierda y solo se aceptan números. */
export function PhoneField({ label, name, value, onChange, error }: PhoneFieldProps) {
  const id = useId()
  const errorId = `${id}-error`

  return (
    <div className="field">
      <label htmlFor={id} className="field__label">
        {label}
      </label>
      <div className="phone-input" data-invalid={error ? true : undefined}>
        <span className="phone-input__prefix" aria-hidden="true">
          {PHONE_PREFIX}
        </span>
        <input
          id={id}
          name={name}
          className="phone-input__control"
          type="tel"
          inputMode="numeric"
          autoComplete="off"
          placeholder="991234567"
          maxLength={PHONE_DIGITS + 1}
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => onChange(sanitizePhone(event.target.value))}
        />
      </div>
      {error && (
        <p id={errorId} className="field__error">
          {error}
        </p>
      )}
    </div>
  )
}
