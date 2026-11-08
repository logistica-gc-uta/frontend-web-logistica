/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Vitest omits CSS modules, including raw imports; this is a source check, not a render.
const styles = readFileSync('src/features/shop/checkout/checkout-presentation.css', 'utf8')

describe('composición de compra', () => {
  it('acota el checkout sin cambiar el contenedor compartido del catálogo', () => {
    expect(styles).toMatch(/\.shop \.checkout-presentation\s*\{[^}]*max-width:\s*1280px/s)
    expect(styles).toContain('minmax(0, 1fr)')
  })

  it('mantiene completas las miniaturas de compra y permite reducir la columna del nombre', () => {
    expect(styles).toMatch(/\.quote-summary__thumb\s*\{[^}]*object-fit:\s*contain/s)
    expect(styles).toContain('64px minmax(0, 1fr) auto')
  })
})
