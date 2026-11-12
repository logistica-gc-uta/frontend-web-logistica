import { useCallback, useState } from 'react'
import { Link } from 'react-router'
import { paths } from '../../app/paths'
import { Alert } from '../../components/ui/Alert'
import { AsyncContent } from '../../components/ui/AsyncContent'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { useFetch } from '../../hooks/useFetch'
import { useForm } from '../../hooks/useForm'
import { AppError } from '../../lib/errors/AppError'
import { formatDate } from '../../lib/format/formatDate'
import { todayInGuayaquil } from '../../lib/time/guayaquil'
import { describeDriverError } from './driverErrors'
import { driversAdminService } from './driversAdminService'
import { MAX_REASON, validateAbsence, type AbsenceForm } from './driverValidation'
import type { AbsenceConflict, DriverAbsence } from './types'

const EMPTY: AbsenceForm = { startDate: '', endDate: '', reason: '' }

const ROUTE_STATUS: Record<string, string> = {
  ASSIGNED: 'asignada, sin iniciar',
  IN_PROGRESS: 'en curso',
}

/** Un día `aaaa-mm-dd` como dd/mm/aaaa, sin depender del huso horario del navegador. */
const showDay = (day: string) => formatDate(`${day}T12:00:00Z`)

const showRange = (absence: Pick<DriverAbsence, 'startDate' | 'endDate'>) =>
  absence.startDate === absence.endDate
    ? showDay(absence.startDate)
    : `del ${showDay(absence.startDate)} al ${showDay(absence.endDate)}`

/** Rutas afectadas por una ausencia: se informan, la decisión es del ADMIN. */
function ConflictNotice({ conflicts }: { conflicts: AbsenceConflict[] }) {
  return (
    <div className="absence-conflicts" role="alert">
      <p>
        <strong>
          La ausencia afecta {conflicts.length === 1 ? 'una ruta' : `${conflicts.length} rutas`} de
          este repartidor.
        </strong>{' '}
        No se canceló ni se reasignó nada: decide qué hacer en{' '}
        <Link to={paths.planning}>Planificación</Link> o <Link to={paths.urgencies}>Urgencias</Link>
        .
      </p>
      <ul>
        {conflicts.map((conflict) => (
          <li key={conflict.routeId}>
            Ruta del {showDay(conflict.date.slice(0, 10))} ·{' '}
            {ROUTE_STATUS[conflict.status] ?? conflict.status} · {conflict.orderIds.length}{' '}
            {conflict.orderIds.length === 1 ? 'pedido' : 'pedidos'}
          </li>
        ))}
      </ul>
    </div>
  )
}

function CancelAbsence({
  driverId,
  absence,
  onCancelled,
}: {
  driverId: string
  absence: DriverAbsence
  onCancelled: (message: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Anular
      </Button>
    )
  }

  const confirm = async () => {
    setSaving(true)
    setError(null)
    try {
      await driversAdminService.cancelAbsence(driverId, absence.id, reason.trim() || undefined)
      onCancelled(
        `Ausencia ${showRange(absence)} anulada. Las rutas y reservas existentes no cambian.`,
      )
    } catch (failure) {
      setError(describeDriverError(failure, 'No se pudo anular la ausencia'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="absence-cancel">
      <TextField
        label={`Motivo de la anulación (${showRange(absence)})`}
        value={reason}
        maxLength={MAX_REASON}
        onChange={(event) => setReason(event.target.value)}
      />
      <Button isLoading={saving} loadingText="Anulando..." onClick={() => void confirm()}>
        Confirmar anulación
      </Button>
      <Button variant="secondary" disabled={saving} onClick={() => setOpen(false)}>
        Volver
      </Button>
      {error && <Alert>{error}</Alert>}
    </div>
  )
}

/**
 * Ausencias de un repartidor (backend #44): registrar un rango de días, ver las vigentes y anular.
 * Una ausencia que choca con rutas asignadas se guarda igual y avisa; nunca reasigna sola.
 */
export function AbsencesPanel({
  driverId,
  driverName,
  onChanged,
}: {
  driverId: string
  driverName: string
  onChanged: () => void
}) {
  const load = useCallback(() => driversAdminService.absences(driverId), [driverId])
  const absences = useFetch(load, 'No se pudieron cargar las ausencias')
  const [saved, setSaved] = useState<{ message: string; conflicts: AbsenceConflict[] } | null>(null)

  const form = useForm({
    initialValues: EMPTY,
    validate: (values) => validateAbsence(values),
    errorMessage: 'No se pudo registrar la ausencia',
    resetOnSuccess: true,
    onSubmit: async (values) => {
      setSaved(null)
      try {
        const absence = await driversAdminService.addAbsence(driverId, {
          startDate: values.startDate,
          endDate: values.endDate,
          ...(values.reason.trim() && { reason: values.reason.trim() }),
        })
        setSaved({
          message: `Ausencia registrada ${showRange(absence)}. Ese tiempo ${driverName} no se podrá asignar a rutas.`,
          conflicts: absence.conflicts,
        })
        absences.reload()
        onChanged()
      } catch (error) {
        throw new AppError(describeDriverError(error, 'No se pudo registrar la ausencia'))
      }
    },
  })

  const today = todayInGuayaquil()

  return (
    <section className="absences" aria-labelledby={`absences-${driverId}`}>
      <h3 id={`absences-${driverId}`}>Ausencias de {driverName}</h3>
      <p className="text-muted">
        Un día ausente no se le puede asignar ninguna ruta. Registrar o anular una ausencia no
        cancela, libera ni reasigna rutas: eso lo decides tú.
      </p>

      {saved && (
        <>
          <Alert variant="success">{saved.message}</Alert>
          {saved.conflicts.length > 0 && <ConflictNotice conflicts={saved.conflicts} />}
        </>
      )}

      <AsyncContent {...absences} onRetry={absences.reload} loadingText="Cargando ausencias...">
        {(items) =>
          items.length === 0 ? (
            <p className="text-muted">No tiene ausencias vigentes ni próximas.</p>
          ) : (
            <ul className="absences__list" aria-label={`Ausencias vigentes de ${driverName}`}>
              {items.map((absence) => (
                <li key={absence.id}>
                  <div>
                    <strong>{showRange(absence)}</strong>
                    {absence.reason && <span className="text-muted"> · {absence.reason}</span>}
                    {absence.conflicts.length > 0 && (
                      <span className="badge badge--danger">
                        {absence.conflicts.length === 1
                          ? 'Afecta una ruta'
                          : `Afecta ${absence.conflicts.length} rutas`}
                      </span>
                    )}
                  </div>
                  {absence.endDate >= today && (
                    <CancelAbsence
                      driverId={driverId}
                      absence={absence}
                      onCancelled={(message) => {
                        setSaved({ message, conflicts: [] })
                        absences.reload()
                        onChanged()
                      }}
                    />
                  )}
                </li>
              ))}
            </ul>
          )
        }
      </AsyncContent>

      <form
        className="form absences__form"
        aria-label={`Registrar ausencia de ${driverName}`}
        noValidate
        onSubmit={form.handleSubmit}
      >
        {form.submitError && <Alert>{form.submitError}</Alert>}
        <div className="absences__dates">
          <TextField
            label="Desde"
            name="startDate"
            type="date"
            min={today}
            value={form.values.startDate}
            onChange={form.handleChange}
            error={form.fieldErrors.startDate}
          />
          <TextField
            label="Hasta"
            name="endDate"
            type="date"
            min={form.values.startDate || today}
            value={form.values.endDate}
            onChange={form.handleChange}
            error={form.fieldErrors.endDate}
          />
        </div>
        <TextField
          label="Motivo (opcional)"
          name="reason"
          maxLength={MAX_REASON}
          value={form.values.reason}
          onChange={form.handleChange}
          error={form.fieldErrors.reason}
        />
        <div>
          <Button type="submit" isLoading={form.isSubmitting} loadingText="Registrando...">
            Registrar ausencia
          </Button>
        </div>
      </form>
    </section>
  )
}
