import L from 'leaflet'

/** Marcadores dibujados con CSS (ver `.map-pin` en index.css): no dependen de imágenes del paquete. */
export const orderIcon = L.divIcon({
  className: 'map-pin map-pin--order',
  iconSize: [28, 28],
  iconAnchor: [14, 28],
})

export const depotIcon = L.divIcon({
  className: 'map-pin map-pin--depot',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
})

/**
 * Parada numerada con el color de su ruta. El HTML solo contiene un número y un color de la paleta
 * propia de la aplicación, nunca texto que venga de la API.
 */
export function createStopIcon(sequence: number, color: string): L.DivIcon {
  return L.divIcon({
    className: 'map-pin map-stop',
    html: `<span class="map-stop__badge" style="background:${color}">${Number(sequence)}</span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })
}
