import { useEffect, useState, type ChangeEvent } from 'react'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { describeCatalogError } from './catalogErrors'
import { catalogService } from './catalogService'
import { ALLOWED_TYPES, checkImageFile, MAX_IMAGES } from './imageRules'
import type { AdminImage, AdminProduct } from './types'

const freePosition = (images: AdminImage[]): number =>
  Array.from({ length: MAX_IMAGES }, (_, index) => index).find(
    (position) => !images.some((image) => image.position === position),
  ) ?? images.length

type Upload =
  | { step: 'idle' }
  | { step: 'uploading'; percent: number | null }
  /** La imagen se subió, pero falta asociarla: el reintento usa el mismo `uploadId`. */
  | { step: 'attachFailed'; uploadId: string }

function ImageRow({
  product,
  image,
  index,
  total,
  busy,
  run,
}: {
  product: AdminProduct
  image: AdminImage
  index: number
  total: number
  busy: boolean
  run: (task: () => Promise<unknown>, done: string) => void
}) {
  const [altText, setAltText] = useState(image.altText ?? '')
  const [confirmRemove, setConfirmRemove] = useState(false)
  const label = image.altText || `Imagen ${index + 1}`
  const neighbor = (offset: number) => product.images[index + offset]

  return (
    <li className="catalog-image" aria-label={label}>
      <img src={image.secureUrl} alt={image.altText ?? ''} className="catalog-image__preview" />
      <div className="catalog-image__body">
        {image.isPrimary ? (
          <span className="badge badge--success">Imagen principal</span>
        ) : (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              run(
                () => catalogService.updateImage(product.id, image.id, { isPrimary: true }),
                'Imagen principal actualizada.',
              )
            }
          >
            Marcar como principal
          </Button>
        )}
        <div className="catalog-image__alt">
          <TextField
            label={`Texto alternativo de la imagen ${index + 1}`}
            maxLength={160}
            value={altText}
            onChange={(event) => setAltText(event.target.value)}
          />
          <Button
            variant="secondary"
            disabled={busy || altText.trim() === '' || altText.trim() === (image.altText ?? '')}
            onClick={() =>
              run(
                () => catalogService.updateImage(product.id, image.id, { altText: altText.trim() }),
                'Texto alternativo guardado.',
              )
            }
          >
            Guardar texto
          </Button>
        </div>
        <div className="catalog-actions">
          <Button
            variant="secondary"
            aria-label={`Subir ${label} en la galería`}
            disabled={busy || index === 0}
            onClick={() =>
              run(
                () =>
                  catalogService.updateImage(product.id, image.id, {
                    position: neighbor(-1).position,
                  }),
                'Orden actualizado.',
              )
            }
          >
            ↑
          </Button>
          <Button
            variant="secondary"
            aria-label={`Bajar ${label} en la galería`}
            disabled={busy || index === total - 1}
            onClick={() =>
              run(
                () =>
                  catalogService.updateImage(product.id, image.id, {
                    position: neighbor(1).position,
                  }),
                'Orden actualizado.',
              )
            }
          >
            ↓
          </Button>
          {confirmRemove ? (
            <>
              <span>¿Quitar esta imagen del producto?</span>
              <Button
                disabled={busy}
                onClick={() => {
                  setConfirmRemove(false)
                  run(() => catalogService.removeImage(product.id, image.id), 'Imagen retirada.')
                }}
              >
                Sí, quitar
              </Button>
              <Button variant="secondary" onClick={() => setConfirmRemove(false)}>
                Cancelar
              </Button>
            </>
          ) : (
            <Button variant="secondary" disabled={busy} onClick={() => setConfirmRemove(true)}>
              Quitar <span className="visually-hidden">{label}</span>
            </Button>
          )}
        </div>
      </div>
    </li>
  )
}

/**
 * ADMIN-04 · Galería del producto. El archivo va al backend (`multipart/form-data`), que lo
 * verifica y lo sube a Cloudinary; el navegador solo recibe el `uploadId` y nunca acepta URLs
 * ni identificadores de Cloudinary escritos a mano.
 */
export function ProductImagesEditor({
  product,
  onChanged,
}: {
  product: AdminProduct
  onChanged: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [altText, setAltText] = useState('')
  const [fileError, setFileError] = useState<string | null>(null)
  const [upload, setUpload] = useState<Upload>({ step: 'idle' })
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const full = product.images.length >= MAX_IMAGES

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview)
    },
    [preview],
  )

  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0] ?? null
    setMessage(null)
    setUpload({ step: 'idle' })
    const problem = chosen ? checkImageFile(chosen) : null
    setFileError(problem)
    setFile(problem ? null : chosen)
    setPreview(chosen && !problem ? URL.createObjectURL(chosen) : null)
  }

  const run = async (task: () => Promise<unknown>, done: string) => {
    setBusy(true)
    setMessage(null)
    try {
      await task()
      setMessage({ ok: true, text: done })
      onChanged()
    } catch (error) {
      setMessage({
        ok: false,
        text: describeCatalogError(error, 'No se pudo actualizar la imagen'),
      })
    } finally {
      setBusy(false)
    }
  }

  const attach = async (uploadId: string) => {
    try {
      await catalogService.attachImage(product.id, {
        uploadId,
        altText: altText.trim(),
        isPrimary: !product.images.some((image) => image.isPrimary),
        position: freePosition(product.images),
      })
      setUpload({ step: 'idle' })
      setFile(null)
      setPreview(null)
      setAltText('')
      setMessage({ ok: true, text: 'Imagen subida y asociada al producto.' })
      onChanged()
    } catch (error) {
      setUpload({ step: 'attachFailed', uploadId })
      setMessage({
        ok: false,
        text: describeCatalogError(
          error,
          'La imagen se subió pero no se pudo asociar al producto.',
        ),
      })
    }
  }

  const send = async () => {
    if (!file) return
    if (altText.trim() === '') {
      setFileError('Describe la imagen (texto alternativo)')
      return
    }
    setMessage(null)
    setUpload({ step: 'uploading', percent: null })
    let uploadId: string
    try {
      uploadId = await catalogService.uploadImage(file, (percent) =>
        setUpload({ step: 'uploading', percent }),
      )
    } catch (error) {
      setUpload({ step: 'idle' })
      setMessage({ ok: false, text: describeCatalogError(error, 'No se pudo subir la imagen') })
      return
    }
    await attach(uploadId)
  }

  return (
    <section className="card" aria-labelledby="images-title">
      <h2 id="images-title">Imágenes</h2>
      <p className="text-muted">
        JPEG, PNG o WebP de hasta 5 MiB, hasta {MAX_IMAGES} por producto. La imagen principal es la
        que muestra el Shop; sin ella el producto no se puede publicar.
      </p>
      {message && <Alert variant={message.ok ? 'success' : 'error'}>{message.text}</Alert>}

      {product.images.length === 0 ? (
        <p className="empty-state">Este producto todavía no tiene imágenes.</p>
      ) : (
        <ul className="catalog-images">
          {product.images.map((image, index) => (
            <ImageRow
              key={image.id}
              product={product}
              image={image}
              index={index}
              total={product.images.length}
              busy={busy || upload.step === 'uploading'}
              run={(task, done) => void run(task, done)}
            />
          ))}
        </ul>
      )}

      {full ? (
        <p className="text-muted">Ya tiene {MAX_IMAGES} imágenes: quita una para agregar otra.</p>
      ) : (
        <div className="catalog-upload" role="group" aria-label="Agregar imagen">
          <div className="field">
            <label htmlFor="image-file" className="field__label">
              Archivo de imagen
            </label>
            <input
              id="image-file"
              type="file"
              accept={ALLOWED_TYPES.join(',')}
              className="field__input"
              disabled={upload.step === 'uploading'}
              onChange={choose}
            />
          </div>
          {preview && (
            <img
              src={preview}
              alt="Vista previa de la imagen elegida"
              className="catalog-image__preview"
            />
          )}
          <TextField
            label="Texto alternativo (describe la imagen)"
            maxLength={160}
            value={altText}
            onChange={(event) => {
              setAltText(event.target.value)
              setFileError(null)
            }}
          />
          {fileError && <p className="field__error">{fileError}</p>}
          {upload.step === 'uploading' && (
            <p role="status">
              Subiendo imagen{upload.percent !== null ? ` · ${upload.percent} %` : '...'}
            </p>
          )}
          {upload.step === 'attachFailed' ? (
            <Button onClick={() => void attach(upload.uploadId)}>Reintentar asociación</Button>
          ) : (
            <Button
              disabled={!file || busy}
              isLoading={upload.step === 'uploading'}
              loadingText="Subiendo..."
              onClick={() => void send()}
            >
              Subir imagen
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
