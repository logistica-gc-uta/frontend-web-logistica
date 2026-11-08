/**
 * Ilustración decorativa del login: un tramo de ciudad con curvas de nivel, el depósito y una ruta
 * de entregas. Usa las mismas formas que el mapa del panel (depósito cuadrado, paradas redondas,
 * urgente en amarillo). La ruta se dibuja una vez al cargar.
 */
export function RouteIllustration() {
  return (
    <svg className="route-art" viewBox="0 0 480 360" aria-hidden="true" focusable="false">
      <g className="route-art__contours">
        <path d="M-20 70 C 80 30, 160 110, 260 70 S 420 20, 500 60" />
        <path d="M-20 110 C 90 70, 170 150, 270 110 S 430 60, 500 100" />
        <path d="M-20 250 C 70 220, 150 300, 250 260 S 410 210, 500 250" />
        <path d="M-20 290 C 80 260, 160 340, 260 300 S 420 250, 500 290" />
        <path d="M-20 330 C 90 300, 170 380, 270 340 S 430 290, 500 330" />
      </g>
      <g className="route-art__streets">
        <path d="M0 180 H480" />
        <path d="M120 0 V360" />
        <path d="M300 0 V360" />
        <path d="M0 40 L480 330" />
        <path d="M60 360 L420 0" />
      </g>
      <path
        className="route-art__route route-art__route--done"
        d="M90 270 L90 180 L190 180 L245 125 L300 125"
        pathLength={1}
      />
      <path
        className="route-art__route route-art__route--pending"
        d="M300 125 L300 80 L380 80 L410 200 L330 250"
      />
      <rect className="route-art__depot" x="76" y="256" width="28" height="28" rx="5" />
      <circle className="route-art__stop route-art__stop--done" cx="90" cy="180" r="9" />
      <circle className="route-art__stop route-art__stop--done" cx="190" cy="180" r="9" />
      <circle className="route-art__stop route-art__stop--done" cx="245" cy="125" r="9" />
      <circle className="route-art__stop route-art__stop--truck" cx="300" cy="125" r="12" />
      <circle className="route-art__stop" cx="380" cy="80" r="9" />
      <circle className="route-art__stop route-art__stop--urgent" cx="410" cy="200" r="10" />
      <circle className="route-art__stop" cx="330" cy="250" r="9" />
    </svg>
  )
}
