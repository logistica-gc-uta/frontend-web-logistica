import type { DispatchAudit, FailedDelivery, UrgencyProposal } from '../features/dispatch/types'

/** Registro de auditoría aplicado por el ADMIN del seed. */
export const auditRecord = (overrides: Partial<DispatchAudit> = {}): DispatchAudit => ({
  id: 'audit-1',
  action: 'REORDER',
  outcome: 'APPLIED',
  actorId: 'admin-1',
  orderId: null,
  routeId: 'route-1',
  reason: 'Calle cerrada',
  recordedAt: '2026-10-21T15:30:00Z',
  ...overrides,
})

/** Propuesta temporal para el pedido urgente `orderId` (por defecto, insertar en `route-1`). */
export const urgencyProposal = (
  orderId: string,
  overrides: Partial<UrgencyProposal> = {},
): UrgencyProposal => ({
  orderId,
  kind: 'INSERT',
  routeId: 'route-1',
  zoneId: 'zone-1',
  orderIds: ['route-1-o1', orderId],
  availableDriverIds: [],
  reasons: [],
  totalDistanceKm: 2.4,
  fingerprint: 'a'.repeat(64),
  ...overrides,
})

/** Pedido con un intento fallido (destinatario ausente) en la parada `stop-<orderId>` de `route-1`. */
export const failedDelivery = (
  orderId: string,
  overrides: Partial<FailedDelivery> = {},
): FailedDelivery => ({
  orderId,
  routeId: 'route-1',
  pickup: null,
  attempts: [
    {
      id: `attempt-${orderId}`,
      stopId: `stop-${orderId}`,
      failureReason: 'RECIPIENT_ABSENT',
      recordedAt: '2026-11-03T15:30:00Z',
    },
  ],
  ...overrides,
})
