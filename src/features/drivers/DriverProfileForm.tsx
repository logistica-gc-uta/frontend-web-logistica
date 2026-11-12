import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { useForm } from '../../hooks/useForm'
import { AppError } from '../../lib/errors/AppError'
import { describeDriverError } from './driverErrors'
import { profileChanges, validateProfile } from './driverValidation'
import type { DriverProfileInput } from './types'

interface DriverProfileFormProps {
  /** Valores actuales al corregir; vacíos al dar de alta. */
  initial: DriverProfileInput
  label: string
  submitLabel: string
  /** Envía el alta o los cambios; devuelve cuando el servidor confirmó. */
  onSave: (values: DriverProfileInput, changes: Partial<DriverProfileInput>) => Promise<void>
  isEdit?: boolean
}

/** Nombre, correo y vehículo: los únicos campos del perfil (backend #43). */
export function DriverProfileForm({
  initial,
  label,
  submitLabel,
  onSave,
  isEdit = false,
}: DriverProfileFormProps) {
  const form = useForm({
    initialValues: initial,
    validate: validateProfile,
    errorMessage: 'No se pudo guardar el repartidor',
    resetOnSuccess: !isEdit,
    onSubmit: async (values) => {
      const changes = profileChanges(values, initial)
      if (isEdit && Object.keys(changes).length === 0) {
        throw new AppError('No hay cambios para guardar.')
      }
      try {
        await onSave(values, changes)
      } catch (error) {
        throw new AppError(describeDriverError(error, 'No se pudo guardar el repartidor'))
      }
    },
  })

  return (
    <form className="form driver-form" aria-label={label} noValidate onSubmit={form.handleSubmit}>
      {form.submitError && <Alert>{form.submitError}</Alert>}
      <TextField
        label="Nombre"
        name="name"
        autoComplete="off"
        value={form.values.name}
        onChange={form.handleChange}
        error={form.fieldErrors.name}
      />
      <TextField
        label="Correo"
        name="email"
        type="email"
        autoComplete="off"
        value={form.values.email}
        onChange={form.handleChange}
        error={form.fieldErrors.email}
      />
      <TextField
        label="Vehículo"
        name="vehicle"
        autoComplete="off"
        value={form.values.vehicle}
        onChange={form.handleChange}
        error={form.fieldErrors.vehicle}
      />
      <div>
        <Button type="submit" isLoading={form.isSubmitting} loadingText="Guardando...">
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
