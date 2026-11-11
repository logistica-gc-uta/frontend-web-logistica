import { useState } from 'react'
import { Alert } from '../../components/ui/Alert'
import { AsyncContent } from '../../components/ui/AsyncContent'
import { Button } from '../../components/ui/Button'
import { useFetch } from '../../hooks/useFetch'
import { formatDateTime } from '../../lib/format/formatDateTime'
import type { GeoPoint } from '../../types/geo'
import {
  MAX_VERTICES,
  draftFrom,
  draftProblem,
  formatPoint,
  hasChanges,
  toSaveInput,
} from './coverageDraft'
import { describeCoverageError } from './coverageErrors'
import { CoverageMap, type MapMode, type Probe } from './CoverageMap'
import { coverageService } from './coverageService'
import type { CoverageDraft, StoreCoverage } from './types'

const MODES: { value: MapMode; label: string; hint: string }[] = [
  {
    value: 'store',
    label: 'Ubicar tienda',
    hint: 'Haz clic en el mapa para colocar la tienda; arrástrala para ajustarla.',
  },
  {
    value: 'area',
    label: 'Dibujar área',
    hint: 'Cada clic agrega un punto al borde del área, en orden. Arrastra un punto para moverlo.',
  },
  {
    value: 'probe',
    label: 'Probar un punto',
    hint: 'Haz clic en el mapa y el servidor dirá si ese punto está dentro, en el borde o fuera.',
  },
]

type SaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'saved' }
  | { status: 'error'; message: string }

function CoverageEditor({ initial }: { initial: StoreCoverage }) {
  const [saved, setSaved] = useState<StoreCoverage>(initial)
  const [draft, setDraft] = useState<CoverageDraft>(() => draftFrom(initial))
  const [mode, setMode] = useState<MapMode>(initial.configured ? 'probe' : 'store')
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' })
  const [probe, setProbe] = useState<Probe | null>(null)
  const [probeError, setProbeError] = useState<string | null>(null)

  const changed = hasChanges(draft, saved)
  const isSaving = saveState.status === 'saving'
  const activeMode = MODES.find((item) => item.value === mode) ?? MODES[0]

  /** Cualquier edición retira el aviso del último guardado: ya no describe lo que se ve. */
  const edit = (next: (current: CoverageDraft) => CoverageDraft) => {
    if (isSaving) return
    setDraft(next)
    if (saveState.status !== 'error') setSaveState({ status: 'idle' })
  }

  const probePoint = async (point: GeoPoint) => {
    setProbe({ point })
    setProbeError(null)
    try {
      const { position } = await coverageService.evaluate(point)
      setProbe({ point, position })
    } catch (error) {
      setProbe(null)
      setProbeError(describeCoverageError(error, 'No se pudo consultar ese punto.'))
    }
  }

  const handleMapClick = (point: GeoPoint) => {
    if (mode === 'store') edit((current) => ({ ...current, store: point }))
    else if (mode === 'area') {
      if (draft.vertices.length >= MAX_VERTICES) return
      edit((current) => ({ ...current, vertices: [...current.vertices, point] }))
    } else void probePoint(point)
  }

  const moveVertex = (index: number, point: GeoPoint) =>
    edit((current) => ({
      ...current,
      vertices: current.vertices.map((vertex, i) => (i === index ? point : vertex)),
    }))

  const removeVertex = (index: number) =>
    edit((current) => ({
      ...current,
      vertices: current.vertices.filter((_, i) => i !== index),
    }))

  const discard = () => {
    setDraft(draftFrom(saved))
    setSaveState({ status: 'idle' })
  }

  const save = async () => {
    const problem = draftProblem(draft)
    if (problem) {
      setSaveState({ status: 'error', message: problem })
      return
    }
    setSaveState({ status: 'saving' })
    try {
      const persisted = await coverageService.save(toSaveInput(draft))
      setSaved(persisted)
      setDraft(draftFrom(persisted))
      setSaveState({ status: 'saved' })
    } catch (error) {
      setSaveState({
        status: 'error',
        message: describeCoverageError(error, 'No se pudo guardar la tienda y la cobertura.'),
      })
    }
  }

  return (
    <div className="coverage-editor">
      <div role="status" className={`coverage-status${changed ? ' coverage-status--dirty' : ''}`}>
        {isSaving
          ? 'Guardando tienda y cobertura…'
          : changed
            ? saved.configured
              ? 'Cambios sin guardar. La cobertura activa sigue siendo la última guardada (línea punteada).'
              : 'Cambios sin guardar. Todavía no hay una cobertura activa.'
            : saved.configured
              ? `Cobertura activa guardada el ${formatDateTime(saved.updatedAt)}.`
              : 'Todavía no hay tienda ni cobertura guardadas. Ubica la tienda y dibuja el área.'}
      </div>

      {saveState.status === 'saved' && !changed && (
        <Alert variant="success">Guardado. Esta es ahora la tienda y la cobertura activa.</Alert>
      )}
      {saveState.status === 'error' && (
        <Alert>
          {saveState.message}{' '}
          {saved.configured
            ? 'No se guardó nada: la cobertura activa sigue siendo la anterior.'
            : 'No se guardó nada.'}
        </Alert>
      )}

      <div className="coverage-layout">
        <section className="coverage-map" aria-label="Mapa de la tienda y la cobertura">
          <div
            className="coverage-modes"
            role="radiogroup"
            aria-label="Qué hace un clic en el mapa"
          >
            {MODES.map((item) => {
              const disabled = item.value === 'probe' && !saved.configured
              return (
                <label
                  key={item.value}
                  className={`coverage-modes__option${mode === item.value ? ' is-active' : ''}${disabled ? ' is-disabled' : ''}`}
                >
                  <input
                    type="radio"
                    name="coverage-mode"
                    value={item.value}
                    checked={mode === item.value}
                    disabled={disabled}
                    onChange={() => setMode(item.value)}
                  />
                  {item.label}
                </label>
              )
            })}
          </div>

          <div className="coverage-map__frame">
            <CoverageMap
              mode={mode}
              draft={draft}
              saved={saved.configured ? saved : null}
              probe={mode === 'probe' ? probe : null}
              onMapClick={handleMapClick}
              onMoveStore={(point) => edit((current) => ({ ...current, store: point }))}
              onMoveVertex={moveVertex}
            />
          </div>

          <p className="coverage-map__hint">
            {activeMode.hint}
            {mode === 'probe' &&
              changed &&
              ' Se prueba contra la cobertura guardada, no contra tus cambios sin guardar.'}
          </p>
          {!saved.configured && (
            <p className="coverage-map__hint">
              Para probar puntos primero guarda la tienda y la cobertura.
            </p>
          )}
          {probeError && <Alert>{probeError}</Alert>}
        </section>

        <aside className="coverage-side">
          <section className="card coverage-panel" aria-labelledby="coverage-store-title">
            <h2 id="coverage-store-title">Tienda</h2>
            {draft.store ? (
              <p className="coverage-coords">{formatPoint(draft.store)}</p>
            ) : (
              <p className="text-muted">Sin ubicar.</p>
            )}
          </section>

          <section className="card coverage-panel" aria-labelledby="coverage-area-title">
            <div className="coverage-panel__head">
              <h2 id="coverage-area-title">Puntos del área</h2>
              <span className="text-muted">
                {draft.vertices.length} de {MAX_VERTICES}
              </span>
            </div>
            {draft.vertices.length === 0 ? (
              <p className="text-muted">
                Sin puntos. Elige «Dibujar área» y haz clic en el mapa para marcar el borde.
              </p>
            ) : (
              <ol className="coverage-vertices" aria-label="Puntos del área en orden">
                {draft.vertices.map((vertex, index) => (
                  <li key={index}>
                    <span className="coverage-coords">{formatPoint(vertex)}</span>
                    <Button
                      variant="secondary"
                      className="coverage-vertices__remove"
                      aria-label={`Quitar punto ${index + 1}`}
                      disabled={isSaving}
                      onClick={() => removeVertex(index)}
                    >
                      Quitar
                    </Button>
                  </li>
                ))}
              </ol>
            )}
            <div className="coverage-panel__actions">
              <Button
                variant="secondary"
                disabled={isSaving || draft.vertices.length === 0}
                onClick={() =>
                  edit((current) => ({ ...current, vertices: current.vertices.slice(0, -1) }))
                }
              >
                Deshacer último punto
              </Button>
              <Button
                variant="secondary"
                disabled={isSaving || draft.vertices.length === 0}
                onClick={() => edit((current) => ({ ...current, vertices: [] }))}
              >
                Borrar área
              </Button>
            </div>
          </section>

          <section className="coverage-rules" aria-label="Cómo se aplica la cobertura">
            <p>
              Una dirección <strong>dentro</strong> del área o <strong>sobre su borde</strong> se
              acepta; una <strong>fuera</strong> se rechaza. Lo decide el servidor, no el mapa.
            </p>
            <p>
              Cambiar el área no cancela ni modifica pedidos ya aceptados: solo se aplica a pedidos
              nuevos y a cambios de dirección.
            </p>
          </section>

          <div className="coverage-save">
            <Button
              onClick={() => void save()}
              disabled={!changed || isSaving}
              isLoading={isSaving}
              loadingText="Guardando…"
            >
              Guardar tienda y cobertura
            </Button>
            {changed && (
              <Button variant="secondary" disabled={isSaving} onClick={discard}>
                Descartar cambios
              </Button>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

/** ADMIN · ubicación de la tienda única y área general de entrega (backend #41). */
export function StoreCoveragePage() {
  const coverage = useFetch(coverageService.get, 'No se pudo cargar la tienda y la cobertura')

  return (
    <main className="page coverage-page">
      <h1>Tienda y cobertura</h1>
      <p className="text-muted">
        Ubica la tienda y dibuja el área general donde REGALÍA entrega pedidos.
      </p>
      <AsyncContent
        {...coverage}
        onRetry={coverage.reload}
        loadingText="Cargando la configuración..."
      >
        {(data) => <CoverageEditor initial={data} />}
      </AsyncContent>
    </main>
  )
}
