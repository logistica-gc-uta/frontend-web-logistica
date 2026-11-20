/**
 * Máximo de unidades por pedido (backend #83): se cuenta la **suma de las cantidades** de todas las
 * líneas, aunque sean productos distintos o líneas repetidas. Es independiente del máximo por SKU
 * (#20/#33): un pedido debe cumplir los dos. Exactamente N unidades con máximo N se acepta.
 */
export interface OrderUnitsCheck {
  /** Unidades que suma el pedido. */
  requestedUnits: number
  /** Máximo vigente; `null` = sin límite. */
  maximum: number | null
  /** `true` si el pedido supera el máximo (N+1 o más). */
  exceeded: boolean
}

export function checkOrderUnits(
  quantities: readonly number[],
  maximum: number | null | undefined,
): OrderUnitsCheck {
  const requestedUnits = quantities.reduce(
    (total, quantity) => total + (Number.isFinite(quantity) && quantity > 0 ? quantity : 0),
    0,
  )
  const limit = maximum ?? null
  return { requestedUnits, maximum: limit, exceeded: limit !== null && requestedUnits > limit }
}

const units = (count: number) => (count === 1 ? '1 unidad' : `${count} unidades`)

/** Texto corto del máximo vigente, para mostrarlo junto al resumen o al formulario. */
export const describeOrderUnitsMaximum = (maximum: number): string =>
  `Máximo ${units(maximum)} por pedido (sumando todos los productos).`

/**
 * Explica por qué no se puede continuar y cuánto hay que quitar. Se distingue del límite por
 * producto: aquí cuenta el pedido completo.
 */
export const describeOrderUnitsExceeded = (requestedUnits: number, maximum: number): string =>
  `El pedido suma ${units(requestedUnits)} y el máximo por pedido es ${units(maximum)} ` +
  `(sumando todos los productos): quita ${units(requestedUnits - maximum)} para continuar.`
