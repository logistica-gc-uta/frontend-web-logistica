import { describe, expect, it } from 'vitest'
import { createStopIcon, depotIcon, orderIcon } from './icons'

describe('íconos del mapa', () => {
  it('el depósito y el pedido usan marcadores dibujados con CSS', () => {
    expect(depotIcon.options.className).toBe('map-pin map-pin--depot')
    expect(orderIcon.options.className).toBe('map-pin map-pin--order')
  })

  it('la parada muestra su número con el color de la ruta', () => {
    const icon = createStopIcon(3, '#2563eb')

    expect(icon.options.className).toBe('map-pin map-stop')
    expect(icon.options.html).toBe(
      '<span class="map-stop__badge" style="background:#2563eb">3</span>',
    )
  })

  it('el texto del ícono siempre es numérico, aunque llegue otro valor', () => {
    const icon = createStopIcon('<img src=x onerror=alert(1)>' as unknown as number, '#000000')

    expect(icon.options.html).toContain('>NaN<')
    expect(icon.options.html).not.toContain('<img')
  })
})
