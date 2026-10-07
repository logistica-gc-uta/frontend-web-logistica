import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AsyncContent } from './AsyncContent'

const renderContent = (props: { data?: string; isLoading?: boolean; error?: string | null }) => {
  const onRetry = vi.fn()
  render(
    <AsyncContent
      data={props.data}
      isLoading={props.isLoading ?? false}
      error={props.error ?? null}
      onRetry={onRetry}
      loadingText="Cargando datos..."
    >
      {(data) => <p>Contenido: {data}</p>}
    </AsyncContent>,
  )
  return { onRetry }
}

describe('AsyncContent', () => {
  it('muestra el indicador de carga mientras no hay datos', () => {
    renderContent({ isLoading: true })

    expect(screen.getByRole('status')).toHaveTextContent('Cargando datos...')
  })

  it('muestra el contenido cuando hay datos, incluso durante una recarga', () => {
    renderContent({ data: 'zonas', isLoading: true })

    expect(screen.getByText('Contenido: zonas')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('muestra el error y permite reintentar', async () => {
    const { onRetry } = renderContent({ error: 'Falló la carga' })

    expect(screen.getByRole('alert')).toHaveTextContent('Falló la carga')
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('no muestra nada si no hay datos ni carga en curso', () => {
    const { container } = render(
      <AsyncContent data={undefined} isLoading={false} error={null} onRetry={() => {}}>
        {() => <p>Nunca</p>}
      </AsyncContent>,
    )

    expect(container).toBeEmptyDOMElement()
  })
})
