const currencyFormatter = new Intl.NumberFormat('es-EC', {
  style: 'currency',
  currency: 'USD',
})

/** Formatea un valor en dólares (moneda oficial de Ecuador), ej. "$750,00". */
export const formatCurrency = (value: number): string => currencyFormatter.format(value)
