import type { FieldErrors } from '../../hooks/useForm'
import { dollarsToCents } from '../shop/money'
import type { AdminShopSettings, ShopSettingsChanges } from './types'

export type SettingsForm = {
  taxEnabled: boolean
  taxPercent: string
  maxUnits: string
  startTime: string
  endTime: string
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

/** Porcentaje con hasta 2 decimales → puntos básicos, sin decimales binarios ("12,5" → 1250). */
export const percentToBps = (text: string): number | null => dollarsToCents(text)

/** Puntos básicos → porcentaje para editar (1500 → "15", 1250 → "12.5"). */
export const bpsToPercent = (bps: number): string =>
  String(Math.trunc(bps / 100)) +
  (bps % 100 === 0
    ? ''
    : `.${String(bps % 100)
        .padStart(2, '0')
        .replace(/0$/, '')}`)

export const formFromSettings = (settings: AdminShopSettings): SettingsForm => ({
  taxEnabled: settings.tax.enabled,
  taxPercent: bpsToPercent(settings.tax.rateBps),
  maxUnits: String(settings.maxUnitsPerSkuPerOrder),
  startTime: settings.deliverySchedule.startTime,
  endTime: settings.deliverySchedule.endTime,
})

export function validateSettings(values: SettingsForm): FieldErrors<SettingsForm> {
  const errors: FieldErrors<SettingsForm> = {}
  const bps = percentToBps(values.taxPercent)
  if (bps === null || bps > 10000)
    errors.taxPercent = 'Escribe un porcentaje de 0 a 100 (hasta 2 decimales)'
  const max = Number(values.maxUnits)
  if (!/^\d+$/.test(values.maxUnits.trim()) || max < 1 || max > 100) {
    errors.maxUnits = 'Escribe un entero de 1 a 100'
  }
  if (!TIME.test(values.startTime)) errors.startTime = 'Hora no válida'
  if (!TIME.test(values.endTime)) errors.endTime = 'Hora no válida'
  else if (TIME.test(values.startTime) && values.startTime >= values.endTime) {
    errors.endTime = 'El fin debe ser posterior al inicio (no se admiten franjas nocturnas)'
  }
  if (values.startTime === '00:00') errors.startTime = 'El inicio debe ser posterior a las 00:00'
  return errors
}

/** Solo los grupos que cambiaron: el backend rechaza un guardado sin cambios. */
export function settingsChanges(
  values: SettingsForm,
  saved: AdminShopSettings,
): ShopSettingsChanges {
  const changes: ShopSettingsChanges = {}
  const rateBps = percentToBps(values.taxPercent)!
  if (values.taxEnabled !== saved.tax.enabled || rateBps !== saved.tax.rateBps) {
    changes.tax = { enabled: values.taxEnabled, rateBps }
  }
  const max = Number(values.maxUnits)
  if (max !== saved.maxUnitsPerSkuPerOrder) changes.limits = { maxUnitsPerSkuPerOrder: max }
  if (
    values.startTime !== saved.deliverySchedule.startTime ||
    values.endTime !== saved.deliverySchedule.endTime
  ) {
    changes.deliverySchedule = { startTime: values.startTime, endTime: values.endTime }
  }
  return changes
}
