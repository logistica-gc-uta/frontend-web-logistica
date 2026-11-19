import { useCallback, useState } from 'react'
import { Alert } from '../../components/ui/Alert'
import { AsyncContent } from '../../components/ui/AsyncContent'
import { DataTable, type Column } from '../../components/ui/DataTable'
import { Drawer } from '../../components/ui/Drawer'
import { StepNav } from '../../components/ui/StepNav'
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

/** Atributos de los iconos de acción de la tabla. */
const ICON = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

/** Repartidores por página de la tabla. */
const DRIVERS_PER_PAGE = 5

/** La tabla de repartidores, de cinco en cinco, con su navegación cuando hay más. */
function DriversTable({
  drivers,
  columns,
  page,
  onPageChange,
}: {
  drivers: DriverProfile[]
  columns: Column<DriverProfile>[]
  page: number
  onPageChange: (page: number) => void
}) {
  // Si hay menos repartidores que antes, la página se ajusta a la última que exista.
  const current = Math.min(page, Math.ceil(drivers.length / DRIVERS_PER_PAGE) - 1)
  const visible = drivers.slice(current * DRIVERS_PER_PAGE, (current + 1) * DRIVERS_PER_PAGE)

  return (
    <>
      <StepNav
        noun="Repartidores"
        singular="Repartidor"
        label="Repartidores"
        position={current}
        total={drivers.length}
        pageSize={DRIVERS_PER_PAGE}
        onChange={onPageChange}
      />
      <DataTable
        caption="Repartidores registrados"
        columns={columns}
        rows={visible}
        getRowKey={(driver) => driver.id}
      />
    </>
  )
}

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
  const [newOpen, setNewOpen] = useState(false)
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<{ id: string; mode: 'edit' | 'absences' } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const selectedDriver = data.data?.drivers.find((driver) => driver.id === selected?.id)
  const closeNew = useCallback(() => setNewOpen(false), [])
  const closeSelected = useCallback(() => setSelected(null), [])

  const columns: Column<DriverProfile>[] = [
    {
      header: 'Repartidor',
      className: 'drivers-table__name',
      render: (driver) => driver.user.name,
    },
    { header: 'Correo', render: (driver) => driver.user.email },
    { header: 'Vehículo', render: (driver) => driver.vehicle },
    {
      header: 'Disponibilidad',
      render: (driver) => {
        const dayStatus = data.data?.availability[driver.id]
        const label = dayStatus ? availabilityLabel(dayStatus) : null
        return (
          <span
            className={`badge${label ? ` badge--${label.tone}` : ''}`}
            aria-label={`Disponibilidad de ${driver.user.name}`}
          >
            {label ? label.text : 'No disponible'}
          </span>
        )
      },
    },
    {
      header: 'Acciones',
      className: 'drivers-table__actions',
      render: (driver) => (
        <div className="drivers-table__buttons">
          <button
            type="button"
            className="drivers-table__icon"
            aria-label={`Editar datos de ${driver.user.name}`}
            title="Editar datos"
            onClick={() => {
              setNotice(null)
              setSelected({ id: driver.id, mode: 'edit' })
            }}
          >
            <svg {...ICON}>
              <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z" />
            </svg>
          </button>
          <button
            type="button"
            className="drivers-table__icon"
            aria-label={`Ausencias de ${driver.user.name}`}
            title="Ausencias"
            onClick={() => {
              setNotice(null)
              setSelected({ id: driver.id, mode: 'absences' })
            }}
          >
            <svg {...ICON}>
              <rect x="3" y="4" width="18" height="17" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18M10 14l4 4M14 14l-4 4" />
            </svg>
          </button>
        </div>
      ),
    },
  ]

  return (
    <main className="page page--wide drivers-page">
      <header className="planning-page__head">
        <div>
          <h1>Repartidores</h1>
          <p className="text-muted">Altas, datos y ausencias de los repartidores.</p>
        </div>
      </header>

      <section className="card drivers-card" aria-labelledby="drivers-title">
        <div className="drivers-head">
          <h2 id="drivers-title" className="visually-hidden">
            Repartidores
          </h2>
          <button
            type="button"
            className="drivers-new"
            aria-haspopup="dialog"
            aria-label="Nuevo repartidor"
            onClick={() => {
              setNotice(null)
              setNewOpen(true)
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            Nuevo repartidor
          </button>
          <div className="drivers-filter">
            <TextField
              label="Disponibilidad del día"
              type="date"
              min={today}
              value={day}
              onChange={(event) => setDay(event.target.value || today)}
            />
          </div>
        </div>
        {notice && <Alert variant="success">{notice}</Alert>}
        <AsyncContent {...data} onRetry={data.reload} loadingText="Cargando repartidores...">
          {({ drivers }) =>
            drivers.length === 0 ? (
              <p className="empty-state">Todavía no hay repartidores. Crea el primero.</p>
            ) : (
              <DriversTable
                drivers={drivers}
                columns={columns}
                page={page}
                onPageChange={setPage}
              />
            )
          }
        </AsyncContent>
      </section>

      <Drawer
        open={newOpen}
        onClose={closeNew}
        title="Nuevo repartidor"
        titleId="new-driver-title"
        className="drawer__panel--form"
      >
        {created ? (
          <TemporaryPassword
            driverName={created.user.name}
            email={created.user.email}
            password={created.temporaryPassword}
            onDone={() => {
              setCreated(null)
              setNewOpen(false)
            }}
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
      </Drawer>

      <Drawer
        open={Boolean(selectedDriver && selected)}
        onClose={closeSelected}
        title={selectedDriver?.user.name ?? ''}
        titleId="driver-detail-title"
        className={selected?.mode === 'edit' ? 'drawer__panel--form' : 'drawer__panel--narrow'}
      >
        {selectedDriver && selected && (
          <section aria-label={`Gestión de ${selectedDriver.user.name}`}>
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
      </Drawer>
    </main>
  )
}
