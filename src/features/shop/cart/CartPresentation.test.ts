import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const styles = readFileSync('src/features/shop/cart/cart-presentation.css', 'utf8')

describe('REGALÍA cart presentation', () => {
  it('bounds the bag and shows the full gift photo', () => {
    expect(styles).toMatch(
      /\.shop \.shop-page\.cart-presentation\s*\{[^}]*max-width:\s*1200px/s,
    )
    expect(styles).toMatch(
      /\.shop \.cart-presentation \.cart-line__image\s*\{[^}]*object-fit:\s*contain/s,
    )
    expect(styles).not.toMatch(
      /\.shop \.cart-presentation \.cart-line__image\s*\{[^}]*object-fit:\s*cover/s,
    )
  })

  it('keeps Quitar with the line total', () => {
    expect(styles).toMatch(/\.shop \.cart-presentation \.cart-line__end/)
  })

  it('centers bag CTA label inside the control', () => {
    expect(styles).toMatch(
      /\.shop \.cart-presentation \.cart-summary__cta,\s*\.shop \.cart-presentation \.cart-empty \.btn\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*justify-content:\s*center/s,
    )
  })
})
