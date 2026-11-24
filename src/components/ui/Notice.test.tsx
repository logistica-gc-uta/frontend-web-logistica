import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Notice } from './Notice'

describe('Notice', () => {
  it('es una nota informativa por defecto, sin clase de tono', () => {
    render(<Notice>Vista previa</Notice>)

    const notice = screen.getByRole('note')
    expect(notice).toHaveTextContent('Vista previa')
    expect(notice).toHaveClass('notice')
    expect(notice.className).toBe('notice')
  })

  it('aplica el tono y las clases del contexto', () => {
    render(
      <Notice tone="warning" className="urgency-info">
        Atención
      </Notice>,
    )

    expect(screen.getByRole('note')).toHaveClass('notice', 'notice--warning', 'urgency-info')
  })

  it('anuncia como estado o alerta cuando se le pide', () => {
    render(
      <>
        <Notice role="status" tone="success">
          Motor activo
        </Notice>
        <Notice role="alert" tone="danger">
          Motor caído
        </Notice>
      </>,
    )

    expect(screen.getByRole('status')).toHaveClass('notice--success')
    expect(screen.getByRole('alert')).toHaveClass('notice--danger')
  })
})
