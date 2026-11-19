/**
 * Nombre del área de una ruta. Desde backend #49 las rutas y los pedidos pueden no tener zona: salen
 * y vuelven a la tienda (`StoreCoverage`), así que se muestran como «Tienda».
 */
export const STORE_AREA_LABEL = 'Tienda'

/**
 * Sufijo del nombre de una ruta: « · FIC-02» si tiene zona (rutas antiguas) y nada si sale de la
 * tienda, porque «Tienda» es siempre lo mismo y no aporta nada junto al número de la ruta.
 */
export const areaSuffix = (zoneCode: string | null | undefined): string =>
  zoneCode && zoneCode !== STORE_AREA_LABEL ? ` · ${zoneCode}` : ''

export const areaLabel = (zoneCode: string | null | undefined): string =>
  zoneCode ?? STORE_AREA_LABEL
