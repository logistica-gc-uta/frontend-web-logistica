import axios from 'axios'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { paths, shopConfirmationPath } from '../../../app/paths'
import { Alert } from '../../../components/ui/Alert'
import { Button } from '../../../components/ui/Button'
import { TextField } from '../../../components/ui/TextField'
import type { FieldErrors } from '../../../hooks/useForm'
import { formatDateTime } from '../../../lib/format/formatDateTime'
import { useCustomer } from '../account/customerContext'
import type { CartLocationState } from '../cart/CartPage'
import { useCart } from '../cart/cartContext'
import { formatCents } from '../money'
import { shopErrorInfo } from '../shopError'
import { DEMO_CARDS, EMPTY_CARD, toCardInput, validateCard, type CardForm } from './cardValidation'
import type { CheckoutLocationState } from './CheckoutPage'
import { describeCheckoutError, problemForCode, type CheckoutProblem } from './checkoutErrors'
import { checkoutService } from './checkoutService'
import { checkoutStorage, sameItems, type CheckoutDraft } from './checkoutStorage'
import type { ConfirmationLocationState } from '../orders/OrderPages'
import { QuoteSummary } from './QuoteSummary'
import './checkout-presentation.css'

/** Consultas automáticas mientras el intento sigue `PROCESSING`; luego se ofrece consultar a mano. */
const AUTO_CHECKS = 5
const CHECK_INTERVAL_MS = 2_000

type Phase =
  | { kind: 'idle' }
  | { kind: 'paying' }
  /** Resultado incierto: no se afirma ni rechazo ni aprobación y no se permite otro pago. */
  | { kind: 'verifying'; key: string; stillUnknown: boolean }

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function PaymentStep({ draft }: { draft: CheckoutDraft }) {
  const navigate = useNavigate()
  const [card, setCard] = useState<CardForm>(EMPTY_CARD)
  const [errors, setErrors] = useState<FieldErrors<CardForm>>({})
  const [problem, setProblem] = useState<CheckoutProblem | null>(null)
  const [phase, setPhase] = useState<Phase>(() =>
    draft.pendingKey
      ? { kind: 'verifying', key: draft.pendingKey, stillUnknown: false }
      : { kind: 'idle' },
  )
  const submitting = useRef(false)

  const savePending = useCallback(
    (pendingKey?: string) => checkoutStorage.save({ ...draft, pendingKey }),
    [draft],
  )

  /**
   * Pago aprobado por el servidor: va a la confirmación, que vacía el carrito cuando el servidor
   * devuelve el pedido guardado (no antes: así nunca se pierde el carrito por un éxito falso).
   */
  const finish = useCallback(
    (orderId: string) => {
      checkoutStorage.clear()
      const state: ConfirmationLocationState = { justPaid: true }
      navigate(shopConfirmationPath(orderId), { replace: true, state })
    },
    [navigate],
  )

  /** Aplica un problema definitivo (sin cobro): libera la clave y lleva a donde corresponde. */
  const settle = useCallback(
    (found: CheckoutProblem) => {
      savePending(undefined)
      setPhase({ kind: 'idle' })
      submitting.current = false
      if (found.action === 'cart') {
        navigate(paths.shopCart, { state: { stockChanged: true } satisfies CartLocationState })
      } else if (found.action === 'requote' || found.action === 'fix') {
        navigate(paths.shopCheckout, { state: { requote: found } satisfies CheckoutLocationState })
      } else {
        // 07A: rechazo de la tarjeta u otra falla sin cobro; se conserva el formulario sin el CVV.
        setProblem(found)
        setCard((current) => ({ ...current, cvv: '' }))
      }
    },
    [navigate, savePending],
  )

  /**
   * 07B: consulta el intento con su clave ORIGINAL; nunca crea otro pago. Quien la llama ya puso
   * la fase en «verificando».
   */
  const verify = useCallback(
    async (key: string, isActive: () => boolean = () => true) => {
      for (let check = 0; check < AUTO_CHECKS && isActive(); check += 1) {
        try {
          const attempt = await checkoutService.attempt(key)
          if (!isActive()) return
          if (attempt.status === 'SUCCEEDED' && attempt.orderId) return finish(attempt.orderId)
          if (attempt.status === 'REJECTED') {
            return settle(
              problemForCode(attempt.errorCode) ?? {
                action: 'card',
                message: 'El pago fue rechazado. Puedes intentar con otra tarjeta.',
              },
            )
          }
          if (attempt.status === 'FAILED') {
            return settle({
              action: 'retry',
              message:
                'El pago no se completó y no se hizo ningún cobro. Puedes intentar de nuevo.',
            })
          }
        } catch (error) {
          // El servidor no tiene registro del intento: nunca llegó, así que no hubo cobro.
          if (shopErrorInfo(error).code === 'CHECKOUT_ATTEMPT_NOT_FOUND') {
            return settle({
              action: 'retry',
              message:
                'El pago no llegó a registrarse y no se hizo ningún cobro. Puedes intentar de nuevo.',
            })
          }
          if (axios.isAxiosError(error) && error.response?.status === 401) return
        }
        await wait(CHECK_INTERVAL_MS)
      }
      if (isActive()) setPhase({ kind: 'verifying', key, stillUnknown: true })
    },
    [finish, settle],
  )

  // Al volver a la página (por ejemplo, tras recargar) con un pago pendiente, se verifica.
  useEffect(() => {
    if (!draft.pendingKey) return
    let active = true
    const key = draft.pendingKey
    // Se consulta al servidor fuera del render en curso; al desmontar se deja de consultar.
    const timer = setTimeout(() => void verify(key, () => active), 0)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [draft.pendingKey, verify])

  const pay = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting.current || phase.kind !== 'idle') return
    const found = validateCard(card)
    setErrors(found)
    if (Object.keys(found).length > 0) return

    submitting.current = true
    setProblem(null)
    // Clave nueva para este intento, guardada ANTES de enviar: si la página se recarga o la red
    // falla, se verifica el mismo intento en lugar de pagar otra vez.
    const key = crypto.randomUUID()
    savePending(key)
    setPhase({ kind: 'paying' })
    try {
      const result = await checkoutService.pay(key, {
        items: draft.items,
        delivery: draft.delivery,
        quoteToken: draft.quote.quoteToken,
        paymentCard: toCardInput(card),
      })
      finish(result.order.id)
    } catch (error) {
      const outcome = describeCheckoutError(error, { isPayment: true })
      if (outcome.action === 'verify') {
        setPhase({ kind: 'verifying', key, stillUnknown: false })
        await verify(key)
      } else {
        settle(outcome)
      }
    }
  }

  const set = (field: keyof CardForm) => (event: { target: { value: string } }) => {
    setCard((current) => ({ ...current, [field]: event.target.value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  const locked = phase.kind !== 'idle'

  return (
    <div className="checkout__layout">
      <section aria-labelledby="payment-title">
        <div className="payment__delivery">
          <div>
            <p className="checkout__eyebrow">Entrega</p>
            <p>
              <strong>{draft.delivery.recipient.name}</strong>
            </p>
            <p>{draft.delivery.deliveryAddress}</p>
            <p className="text-muted">
              {formatDateTime(draft.delivery.scheduledDeliveryDate)} · Ecuador
            </p>
          </div>
          {!locked && <Link to={paths.shopCheckout}>Volver a entrega</Link>}
        </div>
        <h2 id="payment-title">Tarjeta</h2>

        {phase.kind === 'verifying' ? (
          <div className="payment__verifying" role="status">
            <strong>Verificando el resultado del pago...</strong>
            <p>
              Todavía no sabemos si el pago se aprobó o se rechazó. No vuelvas a pagar: estamos
              consultando el mismo intento para no cobrar dos veces.
            </p>
            {phase.stillUnknown && (
              <Button
                variant="secondary"
                onClick={() => {
                  setPhase({ kind: 'verifying', key: phase.key, stillUnknown: false })
                  void verify(phase.key)
                }}
              >
                Consultar de nuevo
              </Button>
            )}
          </div>
        ) : (
          problem && <Alert>{problem.message}</Alert>
        )}

        <form
          className="form payment-form"
          aria-label="Pago con tarjeta"
          noValidate
          onSubmit={pay}
        >
          <fieldset disabled={locked}>
            <TextField
              label="Número de tarjeta"
              inputMode="numeric"
              autoComplete="off"
              maxLength={19}
              value={card.number}
              onChange={set('number')}
              error={errors.number}
            />
            <TextField
              label="Nombre en la tarjeta"
              autoComplete="off"
              value={card.holderName}
              onChange={set('holderName')}
              error={errors.holderName}
            />
            <div className="payment-form__row">
              <TextField
                label="Mes de vencimiento"
                inputMode="numeric"
                maxLength={2}
                autoComplete="off"
                value={card.expiresMonth}
                onChange={set('expiresMonth')}
                error={errors.expiresMonth}
              />
              <TextField
                label="Año de vencimiento"
                inputMode="numeric"
                maxLength={4}
                autoComplete="off"
                value={card.expiresYear}
                onChange={set('expiresYear')}
                error={errors.expiresYear}
              />
              <TextField
                label="CVV"
                type="password"
                inputMode="numeric"
                maxLength={3}
                autoComplete="off"
                value={card.cvv}
                onChange={set('cvv')}
                error={errors.cvv}
              />
            </div>
            <Button
              type="submit"
              isLoading={phase.kind === 'paying'}
              loadingText="Procesando pago..."
            >
              Confirmar pago · {formatCents(draft.quote.totalCents)}
            </Button>
          </fieldset>
        </form>

        <details className="payment__demo-cards">
          <summary>Ayuda con tarjetas de prueba</summary>
          <p className="payment__warning" role="note">
            Solo tarjetas ficticias de demostración. No ingreses datos bancarios reales.
          </p>
          <p className="text-muted">Los saldos indicados son iniciales, no garantizan la aprobación.</p>
          <ul>
            {DEMO_CARDS.map((demo) => (
              <li key={demo.number}>
                {demo.label}: {demo.number} · {demo.holder} · vence 12/2030 · CVV {demo.cvv}
              </li>
            ))}
          </ul>
        </details>

        {!locked && (
          <Link to={paths.shopCheckout} className="payment__back">
            ← Volver a entrega
          </Link>
        )}
      </section>

      <div className="checkout__aside">
        <QuoteSummary quote={draft.quote} title="Resumen del pago" />
      </div>
    </div>
  )
}

/** Pago ficticio (07), con rechazo (07A) y verificación de un resultado incierto (07B). */
export function PaymentPage() {
  const { customer } = useCustomer()
  const { items } = useCart()
  const [draft] = useState(() => (customer ? checkoutStorage.load(customer.id) : null))

  if (!draft) return <Navigate to={paths.shopCheckout} replace />
  // Si el carrito cambió desde la cotización hay que volver a cotizar (salvo con un pago en curso).
  if (!draft.pendingKey && !sameItems(items, draft.items)) {
    const state: CheckoutLocationState = {
      requote: { action: 'requote', message: 'El carrito cambió. Vuelve a calcular el total.' },
    }
    return <Navigate to={paths.shopCheckout} replace state={state} />
  }

  return (
    <div className="shop-page checkout checkout-presentation checkout-presentation--payment">
      <nav aria-label="Pasos de compra">
        <ol className="checkout__steps steps">
          <li>
            <Link to={paths.shopCheckout} className="checkout__step-link">
              <span className="step-number" aria-hidden="true">1</span>Entrega
            </Link>
          </li>
          <li aria-current="step">
            <span className="step-number" aria-hidden="true">2</span>Pago
          </li>
          <li>
            <span className="step-number" aria-hidden="true">3</span>Resultado
          </li>
        </ol>
      </nav>
      <h1>El último paso.</h1>
      <p className="checkout__intro">Revisa tu entrega y completa los datos de pago.</p>
      <PaymentStep draft={draft} />
    </div>
  )
}
