import type { MonitorRoute, MonitorStop, StopOutcome } from '../features/monitor/types'

export const stopWith = (
  index: number,
  outcome: StopOutcome,
  failureReason: string | null = null,
): MonitorStop => ({
  id: `stop-${index}`,
  orderId: `order-${index}`,
  sequence: index,
  deliveryAddress: `Parada ${index}`,
  outcome,
  failureReason,
})

/** Ruta de hoy (21/10/2026) en curso con 4 paradas pendientes. */
export const monitorRoute = (overrides: Partial<MonitorRoute> = {}): MonitorRoute => ({
  id: 'route-1',
  status: 'IN_PROGRESS',
  date: '2026-10-21T15:00:00Z',
  createdAt: '2026-10-21T12:00:00Z',
  zoneCode: 'FIC-02',
  driverId: 'driver-1',
  driverName: 'Carlos Chofer',
  startedAt: '2026-10-21T14:00:00Z',
  completedAt: null,
  returnedAt: null,
  stops: [1, 2, 3, 4].map((index) => stopWith(index, 'PENDING')),
  ...overrides,
})

/** La aceptación del issue: 3 entregas exitosas y 1 visita fallida. */
export const threeDeliveredOneFailed = (): MonitorStop[] => [
  stopWith(1, 'SUCCESSFUL'),
  stopWith(2, 'SUCCESSFUL'),
  stopWith(3, 'FAILED', 'RECIPIENT_ABSENT'),
  stopWith(4, 'SUCCESSFUL'),
]

/** Elemento de `GET /routes` tal como lo devuelve el backend (con datos que el monitor descarta). */
export const rawMonitorRoute = {
  id: 'route-raw',
  status: 'COMPLETED',
  date: '2026-10-21T15:00:00Z',
  createdAt: '2026-10-21T12:00:00Z',
  zone: { id: 'zone-1', code: 'FIC-02', name: 'Ficoa' },
  driverId: 'driver-1',
  driver: { user: { name: 'Carlos Chofer', password: 'HASH-SECRETO' } },
  startedAt: '2026-10-21T14:00:00Z',
  completedAt: '2026-10-21T16:00:00Z',
  returnedAt: null,
  orders: [
    { id: 'o2', deliveryAddress: 'Segunda', recipientName: 'Ana', recipientPhone: '0990000000' },
    { id: 'o1', deliveryAddress: 'Primera', recipientName: 'Luis', recipientPhone: '0991111111' },
  ],
  stops: [
    {
      id: 's2',
      orderId: 'o2',
      sequence: 2,
      outcome: 'FAILED',
      attempts: [
        {
          outcome: 'FAILED',
          failureReason: 'RECIPIENT_REFUSED',
          context: 'Conversación privada con la destinataria',
          recordedAt: '2026-10-21T15:30:00Z',
        },
        {
          outcome: 'FAILED',
          failureReason: 'RECIPIENT_ABSENT',
          context: 'Nadie abrió',
          recordedAt: '2026-10-21T15:00:00Z',
        },
      ],
    },
    {
      id: 's1',
      orderId: 'o1',
      sequence: 1,
      outcome: 'SUCCESSFUL',
      attempts: [
        {
          outcome: 'SUCCESSFUL',
          failureReason: null,
          context: null,
          recordedAt: '2026-10-21T14:30:00Z',
        },
      ],
    },
  ],
}
