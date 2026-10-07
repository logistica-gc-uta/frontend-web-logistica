import type { ReactNode } from 'react'

type AlertVariant = 'error' | 'success'

interface AlertProps {
  variant?: AlertVariant
  children: ReactNode
}

export function Alert({ variant = 'error', children }: AlertProps) {
  return (
    <div role={variant === 'error' ? 'alert' : 'status'} className={`alert alert--${variant}`}>
      {children}
    </div>
  )
}
