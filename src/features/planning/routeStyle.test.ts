import { describe, expect, it } from 'vitest'
import { createProposal } from '../../test/planningFixtures'
import { proposalKey, routeColor, routeLabel } from './routeStyle'

describe('routeColor', () => {
  it('asigna colores distintos a las primeras rutas', () => {
    const colors = Array.from({ length: 10 }, (_, index) => routeColor(index))

    expect(new Set(colors).size).toBe(10)
  })

  it('vuelve a empezar la paleta cuando hay más rutas que colores', () => {
    expect(routeColor(10)).toBe(routeColor(0))
    expect(routeColor(23)).toBe(routeColor(3))
  })
})

describe('routeLabel', () => {
  it('numera las rutas desde 1', () => {
    expect(routeLabel(0)).toBe('Ruta 1')
    expect(routeLabel(8)).toBe('Ruta 9')
  })
})

describe('proposalKey', () => {
  it('es igual para la misma zona, día y pedidos', () => {
    expect(proposalKey(createProposal(['a', 'b']))).toBe(proposalKey(createProposal(['a', 'b'])))
  })

  it('cambia con el orden de los pedidos, la zona o el día', () => {
    const base = proposalKey(createProposal(['a', 'b']))

    expect(proposalKey(createProposal(['b', 'a']))).not.toBe(base)
    expect(proposalKey(createProposal(['a', 'b'], { zoneId: 'otra' }))).not.toBe(base)
    expect(proposalKey(createProposal(['a', 'b'], { routeDate: '2030-02-15T15:00:00Z' }))).not.toBe(
      base,
    )
  })
})
