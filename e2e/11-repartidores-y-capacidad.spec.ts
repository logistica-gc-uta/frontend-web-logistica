import { expect, test } from '@playwright/test'
import { apiAs, type Api } from './support/api'

/**
 * Escenario E2E 11 · Gestión de repartidores y capacidad del vehículo:
 * Edita la capacidad del vehículo de un repartidor, lo da de baja con motivo, verifica la
 * persistencia al recargar y lo vuelve a reactivar dejando el entorno intacto.
 */
interface DriverRow {
  id: string
  vehicle: string
  vehicleCapacity: number | null
  isActive: boolean
  user: { name: string; email: string }
}

let admin: Api

test.beforeAll(async () => {
  admin = await apiAs('ADMIN')
})

test.afterAll(async () => {
  await admin?.dispose()
})

test('Repartidores: actualiza capacidad del vehículo, da de baja con motivo y vuelve a activar', async ({
  page,
}) => {
  const drivers = await admin.get<DriverRow[]>('/drivers')
  const target = drivers.find((d) => d.user.email === 'driver2@delivery.com') ?? drivers[0]
  expect(target).toBeDefined()

  const originalCapacity = target.vehicleCapacity
  const nextCapacity = originalCapacity === 6 ? 8 : 6

  try {
    await page.goto('/admin/repartidores')
    await expect(page.getByText(target.user.name)).toBeVisible()

    // 1. Editar capacidad del vehículo.
    await page.getByRole('button', { name: `Editar datos de ${target.user.name}` }).click()
    const editDialog = page.getByRole('dialog')
    const capacityInput = editDialog.getByLabel('Capacidad del vehículo (unidades, opcional)')
    await capacityInput.fill(String(nextCapacity))
    await editDialog.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(editDialog).toBeHidden()

    await page.reload()
    const afterEdit = (await admin.get<DriverRow[]>('/drivers')).find((d) => d.id === target.id)
    expect(afterEdit?.vehicleCapacity).toBe(nextCapacity)

    // 2. Dar de baja con motivo.
    await page.getByRole('button', { name: `Dar de baja a ${target.user.name}` }).click()
    const deactivateDialog = page.getByRole('dialog')
    await deactivateDialog.getByLabel(/Motivo/i).fill('E2E 11: vehículo en mantenimiento')
    await deactivateDialog.getByRole('button', { name: /Dar de baja|Confirmar/i }).click()
    await expect(deactivateDialog).toBeHidden()

    const afterDeactivate = (await admin.get<DriverRow[]>('/drivers')).find(
      (d) => d.id === target.id,
    )
    expect(afterDeactivate?.isActive).toBe(false)

    // 3. Reactivar repartidor.
    await page.getByRole('button', { name: `Reactivar a ${target.user.name}` }).click()
    const activateDialog = page.getByRole('dialog')
    await activateDialog.getByLabel(/Motivo/i).fill('E2E 11: vehículo operativo nuevamente')
    await activateDialog.getByRole('button', { name: /Reactivar|Confirmar/i }).click()
    await expect(activateDialog).toBeHidden()

    const afterReactivate = (await admin.get<DriverRow[]>('/drivers')).find(
      (d) => d.id === target.id,
    )
    expect(afterReactivate?.isActive).toBe(true)
  } finally {
    // Restaurar capacidad y estado activo originales.
    const latest = (await admin.get<DriverRow[]>('/drivers')).find((d) => d.id === target.id)
    if (latest && !latest.isActive) {
      await admin
        .post(`/drivers/${target.id}/activate`, { reason: 'E2E 11: restauración automática' })
        .catch(() => undefined)
    }
    if (latest && latest.vehicleCapacity !== originalCapacity) {
      await admin
        .patch(`/drivers/${target.id}`, { vehicleCapacity: originalCapacity })
        .catch(() => undefined)
    }
  }
})
