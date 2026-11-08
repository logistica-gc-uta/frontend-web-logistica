import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const styles = readFileSync('src/features/shop/account/account-presentation.css', 'utf8')

describe('REGALÍA access presentation', () => {
  it('lets the account columns wrap instead of clipping', () => {
    expect(styles).toMatch(
      /\.shop \.account-presentation \.account__access > \*\s*\{[^}]*min-width:\s*0/s,
    )
    expect(styles).toMatch(
      /\.shop \.account-presentation \.account__info p\s*\{[^}]*overflow-wrap:\s*anywhere/s,
    )
  })

  it('makes access tabs share the row', () => {
    expect(styles).toMatch(
      /\.shop \.account-presentation \.account__tabs a\s*\{[^}]*display:\s*flex;[^}]*flex:\s*1/s,
    )
  })
})
