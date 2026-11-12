import { useCallback, useState } from 'react'
import { AsyncContent } from '../../components/ui/AsyncContent'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { useFetch } from '../../hooks/useFetch'
import { todayInGuayaquil } from '../../lib/time/guayaquil'
import { AbsencesPanel } from './AbsencesPanel'
import { DriverProfileForm } from './DriverProfileForm'
import { driversAdminService } from './driversAdminService'
import { availabilityLabel } from './driverValidation'
import { TemporaryPassword } from './TemporaryPassword'
import type { CreatedDriver, DriverDayAvailability, DriverProfile } from './types'
import '../../styles/drivers.css'

const EMPTY_PROFILE = { name: '', email: '', vehicle: '' }

interface DriversOfDay {
  drivers: DriverProfile[]
  /** Disponibilidad de cada repartidor en el día elegido; `null` si no se pudo consultar. */
  availability: Record<string, DriverDayAvailability | null>
}

/** Repartidores y su disponibilidad del día elegido (incluye ausencias, que el listado no trae). */
async function loadDriversOfDay(day: string): Promise<DriversOfDay> {
  const drivers = await driversAdminService.list()
  const entries = await Promise.all(
    drivers.map(async (driver) => {
      try {
        return [driver.id, await driversAdminService.availabilityOn(driver.id, day)] as const
      } catch {
        return [driver.id, null] as const
      }
    }),
  )
  return { drivers, availability: Object.fromEntries(entries) }
}

/** ADMIN · alta y corrección de repartidores, ausencias y disponibilidad por día (#36). */
export function DriversPage() {
  const today = todayInGuayaquil()
  const [day, setDay] = useState(today)
  const load = useCallback(() => loadDriversOfDay(day), [day])
  const data = useFetch(load, 'No se pudieron cargar los repartidores')
  const [created, setCreated] = useState<CreatedDriver | null>(null)
  const [selected, setSelected] = useState<{ id: string; mode: 'edit' | 'absences' } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const selectedDriver = data.data?.drivers.find((driver) => driver.id === selected?.id)

  return (
    <main className="page drivers-page">
      <h1>Repartidores</h1>
      <p className="text-muted">
        Da de alta repartidores, corrige sus datos y registra sus ausencias. La disponibilidad
        depende del día: una ausencia no es lo mismo que estar ocupado con una ruta.
      </p>

      <div className="drivers-layout">
        <section className="card" aria-labelledby="new-driver-title">
          <h2 id="new-driver-title">Nuevo repartidor</h2>
          {created ? (
            <TemporaryPassword
              driverName={created.user.name}
              email={created.user.email}
              password={created.temporaryPassword}
              onDone={() => setCreated(null)}
            />
          ) : (
            <DriverProfileForm
              initial={EMPTY_PROFILE}
              label="Nuevo repartidor"
              submitLabel="Crear repartidor"
              onSave={async (values) => {
                const driver = await driversAdminService.create({
                  name: values.name.trim(),
                  email: values.email.trim(),
                  vehicle: values.vehicle.trim(),
                })
                setCreated(driver)
                data.reload()
              }}
            />
          )}
        </section>

        <section className="card" aria-labelledby="drivers-title">
          <div className="drivers-head">
            <h2 id="drivers-title">Repartidores</h2>
            <TextField
              label="Disponibilidad del día"
              type="date"
              min={today}
              value={day}
              onChange={(event) => setDay(event.target.value || today)}
            />
          </div>
          {notice && <Alert variant="success">{notice}</Alert>}
          <AsyncContent {...data} onRetry={data.reload} loadingText="Cargando repartidores...">
            {({ drivers, availability }) =>
              drivers.length === 0 ? (
                <p className="empty-state">Todavía no hay repartidores. Crea el primero.</p>
              ) : (
                <ul className="drivers-list" aria-label="Repartidores registrados">
                  {drivers.map((driver) => {
                    const dayStatus = availability[driver.id]
                    const label = dayStatus ? availabilityLabel(dayStatus) : null
                    return (
                      <li key={driver.id} className="drivers-list__item">
                        <div className="drivers-list__info">
                          <strong>{driver.user.name}</strong>
                          <span className="text-muted">
                            {driver.user.email} · {driver.vehicle}
                          </span>
                        </div>
                        <span
                          className={`badge${label ? ` badge--${label.tone}` : ''}`}
                          aria-label={`Disponibilidad de ${driver.user.name}`}
                        >
                          {label ? label.text : 'Disponibilidad no disponible'}
                        </span>
                        <div className="drivers-list__actions">
                          <Button
                            variant="secondary"
                            aria-label={`Editar datos de ${driver.user.name}`}
                            onClick={() => {
                              setNotice(null)
                              setSelected({ id: driver.id, mode: 'edit' })
                            }}
                          >
                            Editar
                          </Button>
                          <Button
                            variant="secondary"
                            aria-label={`Ausencias de ${driver.user.name}`}
                            onClick={() => {
                              setNotice(null)
                              setSelected({ id: driver.id, mode: 'absences' })
                            }}
                          >
                            Ausencias
                          </Button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )
            }
          </AsyncContent>
        </section>
      </div>

      {selectedDriver && selected && (
        <section
          className="card drivers-detail"
          aria-label={`Gestión de ${selectedDriver.user.name}`}
        >
          <div className="drivers-head">
            <h2>{selectedDriver.user.name}</h2>
            <Button variant="secondary" onClick={() => setSelected(null)}>
              Cerrar
            </Button>
          </div>
          {selected.mode === 'edit' ? (
            <DriverProfileForm
              key={selectedDriver.id}
              isEdit
              initial={{
                name: selectedDriver.user.name,
                email: selectedDriver.user.email,
                vehicle: selectedDriver.vehicle,
              }}
              label={`Corregir datos de ${selectedDriver.user.name}`}
              submitLabel="Guardar cambios"
              onSave={async (_values, changes) => {
                await driversAdminService.update(selectedDriver.id, changes)
                setSelected(null)
                setNotice('Datos corregidos. Sus rutas, reservas y disponibilidad no cambiaron.')
                data.reload()
              }}
            />
          ) : (
            <AbsencesPanel
              key={selectedDriver.id}
              driverId={selectedDriver.id}
              driverName={selectedDriver.user.name}
              onChanged={data.reload}
            />
          )}
        </section>
      )}
    </main>
  )
}
