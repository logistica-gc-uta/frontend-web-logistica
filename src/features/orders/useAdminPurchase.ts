import { useCallback, useRef, useState } from 'react'
import { AppError } from '../../lib/errors/AppError'
import { shopErrorInfo } from '../shop/shopError'
import { describePurchaseError } from './purchaseErrors'
import { ordersService } from './ordersService'
import type { AdminPurchaseResult, CreateAdminPurchaseInput } from './types'

/** Venta cuyo resultado no se conoce: se guarda la clave para consultarla, no para reenviar a ciegas. */
export interface PendingPurchase {
  key: string
  message: string
}

/**
 * Registro de ventas ADMIN con `Idempotency-Key` (backend #45):
 * - Un mismo envío (mismo cuerpo) reutiliza su clave: si se repite, el servidor devuelve el
 *   resultado original sin cobrar ni descontar stock otra vez.
 * - Un cuerpo distinto usa una clave nueva.
 * - Si no se sabe el resultado (red, tiempo agotado, 5xx, en proceso) se consulta el intento.
 */
export function useAdminPurchase() {
  const sent = useRef<{ body: string; key: string } | null>(null)
  const [pending, setPending] = useState<PendingPurchase | null>(null)
  const [verifying, setVerifying] = useState(false)

  const keyFor = (input: CreateAdminPurchaseInput): string => {
    const body = JSON.stringify(input)
    if (sent.current?.body !== body) sent.current = { body, key: crypto.randomUUID() }
    return sent.current.key
  }

  /** Consulta el intento pendiente; devuelve la venta si el servidor la registró. */
  const verify = useCallback(async (key: string): Promise<AdminPurchaseResult | null> => {
    setVerifying(true)
    try {
      const attempt = await ordersService.purchaseAttempt(key)
      if (attempt.status === 'SUCCEEDED' && attempt.result) {
        setPending(null)
        sent.current = null
        return attempt.result
      }
      if (attempt.status === 'PROCESSING') {
        setPending({
          key,
          message: 'La venta todavía se está registrando. Vuelve a verificar en unos segundos.',
        })
        return null
      }
      // Rechazada o fallida: no se registró. Se puede corregir y enviar con otra clave.
      setPending(null)
      sent.current = null
      throw new AppError(
        `La venta no se registró${attempt.errorCode ? ` (${attempt.errorCode})` : ''}. Revisa los datos y vuelve a intentarlo.`,
      )
    } catch (error) {
      if (error instanceof AppError) throw error
      // El servidor nunca recibió la venta: se puede volver a enviar. Se conserva la clave, así un
      // reenvío del mismo formulario no puede registrarla dos veces.
      if (shopErrorInfo(error).code === 'ADMIN_PURCHASE_ATTEMPT_NOT_FOUND') {
        setPending(null)
        throw new AppError(
          'La venta no llegó a registrarse. Puedes volver a enviarla: no se registrará dos veces.',
        )
      }
      const { message } = describePurchaseError(error)
      setPending({ key, message })
      return null
    } finally {
      setVerifying(false)
    }
  }, [])

  /** Envía la venta. Devuelve el resultado, o `null` si quedó pendiente de verificar. */
  const submit = useCallback(
    async (input: CreateAdminPurchaseInput): Promise<AdminPurchaseResult | null> => {
      const key = keyFor(input)
      setPending(null)
      try {
        const result = await ordersService.createPurchase(input, key)
        sent.current = null
        return result
      } catch (error) {
        const problem = describePurchaseError(error)
        if (problem.action === 'verify') {
          setPending({ key, message: problem.message })
          return verify(key)
        }
        // Rechazo definitivo o clave usada con otros datos: el próximo envío usa una clave nueva
        // (con la misma, el servidor repetiría el rechazo original).
        sent.current = null
        throw new AppError(problem.message)
      }
    },
    [verify],
  )

  return { submit, verify, pending, verifying }
}
