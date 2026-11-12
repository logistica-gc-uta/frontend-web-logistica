import { useCallback, useState, type FormEvent } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { paths } from '../../app/paths'
import { Alert } from '../../components/ui/Alert'
import { AsyncContent } from '../../components/ui/AsyncContent'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { useFetch } from '../../hooks/useFetch'
import { AppError } from '../../lib/errors/AppError'
import { getErrorMessage } from '../../lib/http/apiError'
import { formatDateTime } from '../../lib/format/formatDateTime'
import { formatCents } from '../shop/money'
import { shopErrorInfo } from '../shop/shopError'
import { ordersService } from './ordersService'
import type {
  AdminReceipt,
  ContactAuditEntry,
  DeclaredPaymentMethod,
  OrderContact,
  OrderContactChange,
} from './types'
import '../../styles/orders-admin.css'

const METHOD_LABELS: Record<DeclaredPaymentMethod, string> = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
}

const FIELD_LABELS: Record<ContactAuditEntry['field'], string> = {
  buyerName: 'Nombre del comprador',
  buyerPhone: 'Teléfono del comprador',
  recipientName: 'Nombre de quien recibe',
  recipientPhone: 'Teléfono de quien recibe',
}

/** Llega desde el formulario cuando la venta se acaba de registrar. */
export interface OrderReceiptLocationState {
  justCreated?: boolean
}

function PaymentLine({ payment }: { payment: AdminReceipt['payment'] }) {
  if (payment.kind === 'ADMIN_DECLARED_EXTERNAL') {
    return (
      <p className="admin-receipt__payment">
        <strong>Pago declarado: {METHOD_LABELS[payment.method]}.</strong> Registrado el{' '}
        {formatDateTime(payment.declaredAt)}. Es lo que declaró el cliente: no es una verificación
        bancaria.
      </p>
    )
  }
  return (
    <p className="admin-receipt__payment">
      <strong>Pagado en el Shop con tarjeta de demostración •••• {payment.cardLast4}.</strong>{' '}
      Referencia {payment.reference}.
    </p>
  )
}

/** Comprobante imprimible con los importes que guardó el servidor al vender. */
function ReceiptView({ receipt, contact }: { receipt: AdminReceipt; contact?: OrderContact }) {
  return (
    <article className="receipt admin-receipt" aria-labelledby="admin-receipt-title">
      <header className="admin-receipt__head">
        <p className="admin-receipt__merchant">{receipt.merchantName}</p>
        <h1 id="admin-receipt-title">Comprobante {receipt.number}</h1>
        <p className="text-muted">Emitido el {formatDateTime(receipt.issuedAt)}</p>
      </header>
      <p className="receipt__disclaimer">{receipt.disclaimer}</p>

      <dl className="admin-receipt__people">
        <div>
          <dt>Comprador</dt>
          <dd>
            {receipt.buyer.name}
            {receipt.buyer.phone && ` · ${receipt.buyer.phone}`}
            {receipt.buyer.email && ` · ${receipt.buyer.email}`}
          </dd>
        </div>
        <div>
          <dt>Recibe</dt>
          <dd>
            {receipt.recipient.name} · {receipt.recipient.phone}
          </dd>
        </div>
        {contact && (
          <div>
            <dt>Entrega</dt>
            <dd>
              {contact.deliveryAddress}
              {contact.scheduledDeliveryDate &&
                ` · hora aproximada ${formatDateTime(contact.scheduledDeliveryDate)}`}
            </dd>
          </div>
        )}
      </dl>

      <table className="table admin-receipt__items">
        <caption className="visually-hidden">Productos del comprobante</caption>
        <thead>
          <tr>
            <th scope="col">Producto</th>
            <th scope="col">Cantidad</th>
            <th scope="col">Precio</th>
            <th scope="col">Total</th>
          </tr>
        </thead>
        <tbody>
          {receipt.items.map((item) => (
            <tr key={`${item.sku}-${item.name}`}>
              <td>{item.name}</td>
              <td>{item.quantity}</td>
              <td>{formatCents(item.unitPriceCents)}</td>
              <td>{formatCents(item.lineTotalCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="order-amounts admin-receipt__amounts">
        <div>
          <dt>Subtotal</dt>
          <dd>{formatCents(receipt.subtotalCents)}</dd>
        </div>
        <div>
          <dt>
            {receipt.tax.enabled ? `IVA simulado ${receipt.tax.ratePercent} %` : 'IVA simulado'}
          </dt>
          <dd>{formatCents(receipt.tax.amountCents)}</dd>
        </div>
        <div>
          <dt>Envío (incluido en el precio)</dt>
          <dd>{formatCents(receipt.shipping.amountCents)}</dd>
        </div>
        <div className="admin-receipt__total">
          <dt>Total</dt>
          <dd>{formatCents(receipt.totalCents)}</dd>
        </div>
      </dl>

      <PaymentLine payment={receipt.payment} />
    </article>
  )
}

/** Correcciones de contacto del pedido: no cambian importes, pago ni comprobante. */
function ContactEditor({
  orderId,
  contact,
  onSaved,
  onReload,
}: {
  orderId: string
  contact: OrderContact
  onSaved: (contact: OrderContact) => void
  onReload: () => void
}) {
  const isGuest = contact.userId === null
  const [values, setValues] = useState({
    buyerName: contact.buyerName ?? '',
    buyerPhone: contact.buyerPhone ?? '',
    recipientName: contact.recipientName ?? '',
    recipientPhone: contact.recipientPhone ?? '',
  })
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [conflict, setConflict] = useState(false)
  const [saving, setSaving] = useState(false)

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)
    setConflict(false)
    const change: OrderContactChange = { contactRevision: contact.contactRevision }
    const fields = ['buyerPhone', 'recipientName', 'recipientPhone'] as const
    for (const field of fields) {
      const next = values[field].trim()
      if (next !== (contact[field] ?? '')) change[field] = next
    }
    if (isGuest && values.buyerName.trim() !== (contact.buyerName ?? '')) {
      change.buyerName = values.buyerName.trim()
    }
    const changed = Object.keys(change).filter((key) => key !== 'contactRevision')
    if (changed.length === 0) {
      setMessage({ kind: 'error', text: 'No hay cambios para guardar.' })
      return
    }
    if (changed.some((key) => change[key as keyof OrderContactChange] === '')) {
      setMessage({ kind: 'error', text: 'Los datos de contacto no pueden quedar vacíos.' })
      return
    }
    setSaving(true)
    try {
      onSaved(await ordersService.updateContact(orderId, change))
      setMessage({
        kind: 'success',
        text: 'Contacto corregido. El comprobante y los importes de la venta no cambian.',
      })
    } catch (error) {
      if (shopErrorInfo(error).code === 'CONTACT_REVISION_CONFLICT') {
        setConflict(true)
        return
      }
      const status = shopErrorInfo(error).status
      setMessage({
        kind: 'error',
        text:
          status === 403
            ? 'Solo un ADMIN puede corregir el contacto.'
            : `No se guardó la corrección: ${getErrorMessage(error, 'inténtalo de nuevo.')}`,
      })
    } finally {
      setSaving(false)
    }
  }

  const set = (field: keyof typeof values) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [field]: event.target.value }))

  return (
    <form className="form" aria-label="Corregir contacto" noValidate onSubmit={save}>
      {message && <Alert variant={message.kind}>{message.text}</Alert>}
      {conflict && (
        <Alert>
          <span>
            Otro administrador corrigió este contacto mientras lo editabas. No se guardó nada:
            recarga los datos actuales y vuelve a aplicar tu cambio.
          </span>{' '}
          <Button variant="secondary" onClick={onReload}>
            Recargar datos actuales
          </Button>
        </Alert>
      )}
      {isGuest && (
        <TextField
          label="Nombre del comprador"
          value={values.buyerName}
          onChange={set('buyerName')}
        />
      )}
      <TextField
        label="Teléfono del comprador"
        type="tel"
        value={values.buyerPhone}
        onChange={set('buyerPhone')}
      />
      <TextField
        label="Nombre de quien recibe"
        value={values.recipientName}
        onChange={set('recipientName')}
      />
      <TextField
        label="Teléfono de quien recibe"
        type="tel"
        value={values.recipientPhone}
        onChange={set('recipientPhone')}
      />
      <div>
        <Button type="submit" isLoading={saving} loadingText="Guardando...">
          Guardar corrección
        </Button>
      </div>
    </form>
  )
}

function ContactHistory({ entries }: { entries: ContactAuditEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-muted">Todavía no hay correcciones de contacto.</p>
  }
  return (
    <ol className="contact-history">
      {entries.map((entry) => (
        <li key={entry.id}>
          <strong>{FIELD_LABELS[entry.field] ?? entry.field}</strong>: {entry.previousValue ?? '—'}{' '}
          → {entry.nextValue}
          <span className="text-muted"> · {formatDateTime(entry.createdAt)}</span>
        </li>
      ))}
    </ol>
  )
}

/** ADMIN · comprobante imprimible de un pedido y corrección de su contacto. */
export function OrderReceiptPage() {
  const { id = '' } = useParams()
  const justCreated = (useLocation().state as OrderReceiptLocationState | null)?.justCreated

  const loadReceipt = useCallback(async () => {
    try {
      return await ordersService.receipt(id)
    } catch (error) {
      if (shopErrorInfo(error).status === 404) {
        throw new AppError(
          'Este pedido no tiene comprobante: se registró antes de las ventas con comprobante o no existe.',
        )
      }
      throw error
    }
  }, [id])
  const loadContact = useCallback(() => ordersService.contact(id), [id])
  const loadHistory = useCallback(() => ordersService.contactHistory(id), [id])

  const receipt = useFetch(loadReceipt, 'No se pudo cargar el comprobante')
  const contact = useFetch(loadContact, 'No se pudo cargar el contacto del pedido')
  const history = useFetch(loadHistory, 'No se pudo cargar el historial de correcciones')
  const [savedContact, setSavedContact] = useState<OrderContact | null>(null)
  // Al recargar tras un conflicto el editor vuelve a empezar con los datos del servidor.
  const [editorVersion, setEditorVersion] = useState(0)
  const currentContact =
    savedContact && savedContact.contactRevision >= (contact.data?.contactRevision ?? 0)
      ? savedContact
      : contact.data

  const reloadContact = () => {
    setSavedContact(null)
    setEditorVersion((version) => version + 1)
    contact.reload()
    history.reload()
  }

  return (
    <main className="page order-receipt-page">
      <div className="order-receipt__toolbar">
        <Link to={paths.orders}>← Volver a pedidos</Link>
        {receipt.data && (
          <Button variant="secondary" onClick={() => window.print()}>
            Imprimir comprobante
          </Button>
        )}
      </div>

      {justCreated && <Alert variant="success">Venta registrada. Este es su comprobante.</Alert>}

      <AsyncContent {...receipt} onRetry={receipt.reload} loadingText="Cargando comprobante...">
        {(data) => <ReceiptView receipt={data} contact={currentContact ?? undefined} />}
      </AsyncContent>

      <section className="card order-receipt__contact" aria-labelledby="contact-title">
        <h2 id="contact-title">Contacto del pedido</h2>
        <p className="text-muted">
          Corrige el teléfono o los datos de quien recibe. El comprobante conserva los datos de la
          venta y los importes no se pueden editar.
        </p>
        <AsyncContent {...contact} onRetry={contact.reload} loadingText="Cargando contacto...">
          {() =>
            currentContact && (
              <ContactEditor
                // Se reinicia con cada versión que llega del servidor (no con las guardadas aquí).
                key={`${editorVersion}:${contact.data?.contactRevision}`}
                orderId={id}
                contact={currentContact}
                onSaved={(next) => {
                  setSavedContact(next)
                  history.reload()
                }}
                onReload={reloadContact}
              />
            )
          }
        </AsyncContent>
        <h3>Historial de correcciones</h3>
        <AsyncContent {...history} onRetry={history.reload} loadingText="Cargando historial...">
          {(entries) => <ContactHistory entries={entries} />}
        </AsyncContent>
      </section>
    </main>
  )
}
