/**
 * Nombre del área de una ruta. Desde backend #49 las rutas y los pedidos pueden no tener zona: salen
 * y vuelven a la tienda (`StoreCoverage`), así que se muestran como «Tienda».
 */
export const STORE_AREA_LABEL = 'Tienda'

export const areaLabel = (zoneCode: string | null | undefined): string =>
  zoneCode ?? STORE_AREA_LABEL
