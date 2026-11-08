import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const styles = readFileSync('src/features/shop/orders/orders-presentation.css', 'utf8')

describe('REGALÍA order presentation', () => {
  it('bounds order pages and shows the full gift photo', () => {
    expect(styles).toMatch(/\.shop \.shop-page\.order-page,\s*\.shop \.order-page\s*\{[^}]*max-width:\s*1200px/s)
    expect(styles).toMatch(
      /\.shop \.order-history-page \.art \.order-card__image\s*\{[^}]*object-fit:\s*contain/s,
    )
    expect(styles).toMatch(
      /\.shop \.order-page \.order-items__image,\s*\.shop \.order-page \.order-items__image\.product-image,\s*\.shop \.order-page \.order-items__image\.product-image--placeholder\s*\{[^}]*object-fit:\s*contain/s,
    )
    expect(styles).not.toMatch(
      /\.shop \.order-history-page \.art \.order-card__image\s*\{[^}]*object-fit:\s*cover/s,
    )
  })

  it('keeps missing-photo copy inside the confirmation thumb', () => {
    expect(styles).toMatch(
      /\.shop \.order-page \.order-items__image\.product-image--placeholder small\s*\{[^}]*display:\s*none/s,
    )
    expect(styles).toMatch(
      /\.shop \.order-page \.order-items__image,\s*\.shop \.order-page \.order-items__image\.product-image,\s*\.shop \.order-page \.order-items__image\.product-image--placeholder\s*\{[^}]*overflow:\s*hidden/s,
    )
  })

  it('centers order CTA labels inside the control', () => {
    expect(styles).toMatch(
      /\.shop \.order-page \.btn,\s*\.shop \.order-page \.button,\s*\.shop \.order-page button\.button\s*\{[^}]*display:\s*inline-flex;[^}]*align-items:\s*center;[^}]*justify-content:\s*center/s,
    )
  })
})
