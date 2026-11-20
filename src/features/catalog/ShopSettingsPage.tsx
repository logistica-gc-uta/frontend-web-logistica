import { useState } from 'react'
import { Alert } from '../../components/ui/Alert'
import { AsyncContent } from '../../components/ui/AsyncContent'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { useFetch } from '../../hooks/useFetch'
import { useForm } from '../../hooks/useForm'
import { AppError } from '../../lib/errors/AppError'
import { formatDateTime } from '../../lib/format/formatDateTime'
import { useAuth } from '../auth/useAuth'
import { shopErrorInfo } from '../shop/shopError'
import { describeCatalogError } from './catalogErrors'
import { catalogService } from './catalogService'
import {
  formFromSettings,
  MARGIN_MAX,
  MARGIN_MIN,
  settingsChanges,
  validateSettings,
} from './settingsForm'
import type { AdminShopSettings } from './types'

function SettingsEditor({
  settings,
  onSaved,
  onSaving,
  onReload,
}: {
  settings: AdminShopSettings
  onSaved: (settings: AdminShopSettings) => void
  /** Al empezar un guardado se retira el aviso del anterior. */
  onSaving: () => void
  onReload: () => void
}) {
  const { user } = useAuth()
  const [conflict, setConflict] = useState<number | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const form = useForm({
    initialValues: formFromSettings(settings),
    validate: validateSettings,
    errorMessage: 'No se pudo guardar la configuración',
    onSubmit: async (values) => {
      setInfo(null)
      setConflict(null)
      onSaving()
      const changes = settingsChanges(values, settings)
      if (Object.keys(changes).length === 0) {
        setInfo('No hay cambios para guardar.')
        return
      }
      try {
        onSaved(await catalogService.saveSettings(settings.version, changes))
      } catch (error) {
        const { code, details } = shopErrorInfo(error)
        // Nunca se sobrescribe: se avisa y se ofrece cargar lo que guardó el otro ADMIN.
        if (code === 'SETTINGS_VERSION_CONFLICT') {
          setConflict(typeof details.currentVersion === 'number' ? details.currentVersion : null)
          return
        }
        throw new AppError(describeCatalogError(error, 'No se pudo guardar la configuración'))
      }
    },
  })
  const { values, fieldErrors } = form
  const updatedBy = settings.updatedById
    ? settings.updatedById === user?.id
      ? 'por ti'
      : 'por otro administrador'
    : 'con los valores iniciales'

  return (
    <form
      className="form settings-form"
      aria-label="Configuración del Shop"
      noValidate
      onSubmit={form.handleSubmit}
    >
      {conflict !== null || form.submitError
        ? null
        : info && <Alert variant="success">{info}</Alert>}
      {form.submitError && <Alert>{form.submitError}</Alert>}
      {conflict !== null && (
        <Alert>
          <span>
            Otro administrador guardó la configuración mientras la editabas
            {conflict ? ` (ahora es la versión ${conflict})` : ''}. No se guardó nada: recarga los
            valores actuales, revísalos y vuelve a aplicar tus cambios.
          </span>{' '}
          <Button variant="secondary" onClick={onReload}>
            Recargar valores actuales
          </Button>
        </Alert>
      )}

      <p className="text-muted">
        Versión {settings.version} · actualizada el {formatDateTime(settings.updatedAt)} {updatedBy}
        .
      </p>

      <div className="settings-grid">
        <fieldset className="items-editor">
          <legend>IVA simulado</legend>
          <p className="text-muted">
            Es un valor de demostración: no es un tributo oficial ni del SRI.
          </p>
          <label className="catalog-form__check check-option">
            <input
              type="checkbox"
              checked={values.taxEnabled}
              onChange={(event) => form.setFields({ taxEnabled: event.target.checked })}
            />
            Aplicar IVA simulado en los checkouts
          </label>
          <TextField
            label="Tasa del IVA simulado (%)"
            inputMode="decimal"
            value={values.taxPercent}
            onChange={(event) => form.setFields({ taxPercent: event.target.value })}
            error={fieldErrors.taxPercent}
          />
        </fieldset>

        <fieldset className="items-editor">
          <legend>Máximo por producto y pedido</legend>
          <TextField
            label="Unidades máximas de un mismo producto (SKU) por pedido"
            inputMode="numeric"
            value={values.maxUnits}
            onChange={(event) => form.setFields({ maxUnits: event.target.value })}
            error={fieldErrors.maxUnits}
          />
          <p className="text-muted">Se aplica a cada producto, no al total del carrito.</p>
          <TextField
            label="Unidades máximas por pedido (sumando todos los productos)"
            inputMode="numeric"
            placeholder="Sin límite"
            value={values.maxOrderUnits}
            onChange={(event) => form.setFields({ maxOrderUnits: event.target.value })}
            error={fieldErrors.maxOrderUnits}
          />
          <p className="text-muted">
            Tope del pedido completo, de 1 a 1000. Déjalo vacío para no limitarlo. Se aplica en la
            tienda y en las ventas del panel, junto con el máximo por producto; no cambia pedidos ya
            registrados.
          </p>
        </fieldset>

        <fieldset className="items-editor">
          <legend>Entregas en Ecuador</legend>
          <div className="catalog-form__row">
            <TextField
              label="Desde (incluida)"
              type="time"
              value={values.startTime}
              onChange={(event) => form.setFields({ startTime: event.target.value })}
              error={fieldErrors.startTime}
            />
            <TextField
              label="Hasta (incluida)"
              type="time"
              value={values.endTime}
              onChange={(event) => form.setFields({ endTime: event.target.value })}
              error={fieldErrors.endTime}
            />
          </div>
        </fieldset>

        <fieldset className="items-editor">
          <legend>Planificación de rutas</legend>
          <TextField
            label="Margen para agrupar horarios (minutos)"
            inputMode="numeric"
            value={values.marginMinutes}
            onChange={(event) => form.setFields({ marginMinutes: event.target.value })}
            error={fieldErrors.marginMinutes}
          />
          <p className="text-muted">
            Una ruta propuesta solo junta entregas cuyas horas pedidas se diferencian en hasta este
            margen (de {MARGIN_MIN} a {MARGIN_MAX} minutos). Sirve para agrupar: no garantiza
            entregar dentro de ese margen. Aplica a las próximas propuestas; las rutas guardadas no
            cambian.
          </p>
        </fieldset>
      </div>

      <dl className="settings-fixed">
        <div>
          <dt>Envío</dt>
          <dd>
            {settings.shippingFreeIncluded ? 'GRATIS — incluido en los precios (0 USD)' : '—'}
          </dd>
        </div>
        <div>
          <dt>Zona horaria</dt>
          <dd>{settings.deliverySchedule.timeZone} (Ambato)</dd>
        </div>
      </dl>

      <p className="text-muted" role="note">
        Los cambios aplican a los nuevos checkouts: las cotizaciones abiertas tendrán que
        recalcularse. Las compras y los comprobantes ya emitidos no cambian.
      </p>

      <div className="settings-save">
        <Button type="submit" isLoading={form.isSubmitting} loadingText="Guardando...">
          Guardar configuración
        </Button>
      </div>
    </form>
  )
}

/** ADMIN-05 · Configuración comercial del Shop, versionada (`expectedVersion`). */
export function ShopSettingsPage() {
  const settings = useFetch(
    catalogService.getSettings,
    'No se pudo cargar la configuración del Shop',
  )
  const [saved, setSaved] = useState<AdminShopSettings | null>(null)
  /** Versión recién guardada (para el aviso); se retira al empezar otro guardado. */
  const [savedVersion, setSavedVersion] = useState<number | null>(null)
  const current = saved ?? settings.data

  return (
    <main className="page page--wide settings-page">
      <h1>Configuración Shop</h1>
      <p className="text-muted">Reglas comerciales del Shop. Solo el ADMIN puede cambiarlas.</p>
      {savedVersion !== null && (
        <Alert variant="success">
          Configuración guardada (versión {savedVersion}). El Shop ya usa los nuevos valores.
        </Alert>
      )}
      <section className="card settings-card">
        <AsyncContent
          {...settings}
          data={current}
          onRetry={settings.reload}
          loadingText="Cargando configuración..."
        >
          {(data) => (
            <SettingsEditor
              key={data.version}
              settings={data}
              onSaved={(next) => {
                setSaved(next)
                setSavedVersion(next.version)
              }}
              onSaving={() => setSavedVersion(null)}
              onReload={() => {
                setSaved(null)
                setSavedVersion(null)
                settings.reload()
              }}
            />
          )}
        </AsyncContent>
      </section>
    </main>
  )
}
