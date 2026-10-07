import type { ButtonHTMLAttributes } from 'react'

type ButtonVariant = 'primary' | 'secondary'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  isLoading?: boolean
  loadingText?: string
}

export function Button({
  variant = 'primary',
  isLoading = false,
  loadingText = 'Cargando...',
  disabled,
  className,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  const classes = ['btn', `btn--${variant}`, className].filter(Boolean).join(' ')

  return (
    <button
      {...props}
      type={type}
      className={classes}
      disabled={disabled || isLoading}
      aria-busy={isLoading}
    >
      {isLoading ? loadingText : children}
    </button>
  )
}
