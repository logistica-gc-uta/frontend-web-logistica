import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  emptyProposalsResponse,
  firstProposal,
  proposalsResponse,
  savedDraft,
} from '../../test/planningFixtures'
import { zones } from '../../test/fixtures'
import { todayInGuayaquil } from '../../lib/time/guayaquil'
import { DistanceNotice } from './DistanceNotice'
import { ExcludedOrders } from './ExcludedOrders'
import { PlanningFilters } from './PlanningFilters'
import { PlanningSummary } from './PlanningSummary'
import { ProposalCard } from './ProposalCard'
import type { ConfirmationState } from './useRouteConfirmations'

describe('DistanceNotice', () => {
  it('aclara que las distancias son estimadas en línea recta y que el ahorro no es de combustible', () => {
    render(<DistanceNotice />)

    const notice = screen.getByRole('note')
    expect(notice).toHaveTextContent('Distancias estimadas')
    expect(notice).toHaveTextContent('línea recta')
    expect(notice).toHaveTextContent('no consideran calles, tráfico ni tiempos de viaje')
    expect(notice).toHaveTextContent('no es un ahorro real de combustible')
  })
})

describe('PlanningSummary', () => {
  it('muestra los pedidos, las rutas y el ahorro del día', () => {
    render(<PlanningSummary summary={proposalsResponse.summary} />)

    const summary = within(screen.getByLabelText('Resumen de la propuesta del día'))
    expect(summary.getByText('Pedidos candidatos').nextSibling).toHaveTextContent('6')
    expect(summary.getByText('Pedidos planificados').nextSibling).toHaveTextContent('5')
    expect(summary.getByText('Pedidos excluidos').nextSibling).toHaveTextContent('1')
    expect(summary.getByText('Rutas propuestas').nextSibling).toHaveTextContent('2')
    expect(summary.getByText('Km sin optimizar').nextSibling).toHaveTextContent('8,40 km')
    expect(summary.getByText('Km propuestos').nextSibling).toHaveTextContent('3,70 km')
    expect(summary.getByText('Ahorro estimado').nextSibling).toHaveTextContent(/4,70 km \(56 %\)/)
  })

  it('muestra ceros cuando no hay nada que planificar', () => {
    render(<PlanningSummary summary={emptyProposalsResponse.summary} />)

    expect(screen.getByText('Km propuestos').nextSibling).toHaveTextContent('0,00 km')
  })
})

describe('ExcludedOrders', () => {
  it('no muestra nada si no hay pedidos excluidos', () => {
    const { container } = render(<ExcludedOrders excluded={[]} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('lista cada pedido con sus motivos traducidos y el identificador abreviado', () => {
    render(
      <ExcludedOrders
        excluded={[
          { orderId: 'abcdef1234567890', zoneId: 'z', reasons: ['ACTIVE_ROUTE_CLAIM'] },
          {
            orderId: '99999999-aaaa',
            zoneId: 'z',
            reasons: ['MISSING_ZONE', 'MISSING_DELIVERY_COORDINATES'],
          },
        ]}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Pedidos excluidos (2)' })).toBeInTheDocument()
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('abcdef12 Ya está reservado en una ruta confirmada')
    expect(items[1]).toHaveTextContent(
      '99999999 El pedido no tiene zona. Falta confirmar la ubicación de entrega',
    )
  })
})

describe('ProposalCard', () => {
  const renderCard = (confirmation?: ConfirmationState, isSelected = false) => {
    const onSelect = vi.fn()
    const onConfirm = vi.fn()
    render(
      <ProposalCard
        proposal={firstProposal}
        label="Ruta 1"
        color="#2563eb"
        capacity={4}
        isSelected={isSelected}
        confirmation={confirmation}
        onSelect={onSelect}
        onConfirm={onConfirm}
      />,
    )
    return { onSelect, onConfirm }
  }

  it('muestra la capacidad N/4, las distancias, el ahorro y las paradas en orden', () => {
    renderCard()

    const card = within(screen.getByRole('article', { name: 'Ruta 1' }))
    expect(card.getByRole('heading', { name: 'Ruta 1 · FIC-02' })).toBeInTheDocument()
    expect(card.getByText('3/4 paradas')).toBeInTheDocument()
    expect(card.getByText('Distancia propuesta').nextSibling).toHaveTextContent('2,50 km')
    expect(card.getByText('Sin optimizar').nextSibling).toHaveTextContent('6,00 km')
    expect(card.getByText('Ahorro estimado').nextSibling).toHaveTextContent('3,50 km (58,3 %)')
    expect(card.getByText('Entrega').nextSibling).toHaveTextContent(/14\/02\/2030.*10:00/)
    expect(card.getAllByRole('listitem').map((item) => item.textContent?.split(' · ')[0])).toEqual([
      'Dirección de order-a',
      'Dirección de order-b',
      'Dirección de order-c',
    ])
  })

  it('muestra el rango de horas cuando las entregas son a horas distintas', () => {
    render(
      <ProposalCard
        proposal={{
          ...firstProposal,
          scheduledInstants: ['2030-02-14T15:00:00Z', '2030-02-14T16:30:00Z'],
        }}
        label="Ruta 1"
        color="#2563eb"
        capacity={4}
        isSelected={false}
        confirmation={undefined}
        onSelect={() => {}}
        onConfirm={() => {}}
      />,
    )

    expect(screen.getByText('Entrega').nextSibling).toHaveTextContent(/10:00 – .*11:30/)
  })

  it('permite resaltar la ruta y confirmarla', async () => {
    const { onSelect, onConfirm } = renderCard()

    await userEvent.click(screen.getByRole('button', { name: 'Resaltar en el mapa' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar ruta' }))

    expect(onSelect).toHaveBeenCalledOnce()
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('indica cuando la ruta está resaltada', () => {
    renderCard(undefined, true)

    expect(screen.getByRole('button', { name: 'Quitar resaltado' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('bloquea el botón mientras se guarda', () => {
    renderCard({ status: 'saving' })

    expect(screen.getByRole('button', { name: 'Guardando...' })).toBeDisabled()
  })

  it('una vez guardada muestra el estado DRAFT y ya no ofrece confirmar', () => {
    renderCard({ status: 'saved', route: savedDraft() })

    expect(screen.getByRole('status')).toHaveTextContent('Guardada como borrador (DRAFT)')
    expect(screen.queryByRole('button', { name: 'Confirmar ruta' })).not.toBeInTheDocument()
  })

  it('si falla muestra el error y deja confirmar de nuevo', () => {
    renderCard({ status: 'failed', error: 'Conflicto: pedido reservado' })

    expect(screen.getByRole('alert')).toHaveTextContent('Conflicto: pedido reservado')
    expect(screen.getByRole('button', { name: 'Confirmar ruta' })).toBeEnabled()
  })
})

describe('PlanningFilters', () => {
  it('propone el día de hoy en horario de Guayaquil y permite elegir una zona', () => {
    render(<PlanningFilters zones={zones} onPreview={vi.fn()} />)

    expect(screen.getByLabelText('Día a planificar')).toHaveValue(todayInGuayaquil())
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Todas las zonas',
      'FIC-02 · Ficoa',
      'HUA-03 · Huachi (sin depósito)',
    ])
  })

  it('previsualiza solo con el día cuando no se elige zona', async () => {
    const onPreview = vi.fn().mockResolvedValue(undefined)
    render(<PlanningFilters zones={zones} onPreview={onPreview} />)
    fireEvent.change(screen.getByLabelText('Día a planificar'), { target: { value: '2030-02-14' } })

    await userEvent.click(screen.getByRole('button', { name: 'Previsualizar rutas' }))

    expect(onPreview).toHaveBeenCalledWith({ date: '2030-02-14' })
  })

  it('incluye la zona elegida', async () => {
    const onPreview = vi.fn().mockResolvedValue(undefined)
    render(<PlanningFilters zones={zones} onPreview={onPreview} />)
    fireEvent.change(screen.getByLabelText('Día a planificar'), { target: { value: '2030-02-14' } })
    await userEvent.selectOptions(screen.getByLabelText('Zona'), 'zone-1')

    await userEvent.click(screen.getByRole('button', { name: 'Previsualizar rutas' }))

    expect(onPreview).toHaveBeenCalledWith({ date: '2030-02-14', zoneId: 'zone-1' })
  })

  it('exige elegir el día', async () => {
    const onPreview = vi.fn()
    render(<PlanningFilters zones={zones} onPreview={onPreview} />)
    fireEvent.change(screen.getByLabelText('Día a planificar'), { target: { value: '' } })

    await userEvent.click(screen.getByRole('button', { name: 'Previsualizar rutas' }))

    expect(screen.getByText('Elige el día a planificar')).toBeInTheDocument()
    expect(onPreview).not.toHaveBeenCalled()
  })
})
