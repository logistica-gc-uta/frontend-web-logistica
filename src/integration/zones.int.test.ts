import { beforeEach, describe, expect, it } from 'vitest'
import { zonesService } from '../features/zones/zonesService'
import { expectHttpError } from './support/assertions'
import { loginAsAdmin, uniqueSuffix } from './support/session'

describe('Integración real · zonas (/zones)', () => {
  beforeEach(loginAsAdmin)

  it('lista las zonas persistidas en PostgreSQL', async () => {
    const zones = await zonesService.list()

    expect(zones.length).toBeGreaterThan(0)
    expect(zones[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: expect.any(String),
        code: expect.any(String),
        createdAt: expect.any(String),
      }),
    )
  })

  it('crea una zona y la nueva zona aparece al volver a consultar la API', async () => {
    const suffix = uniqueSuffix()
    const input = { name: `IT Zona ${suffix}`, code: `IT-${suffix}` }

    const created = await zonesService.create(input)
    const zones = await zonesService.list()

    expect(created).toEqual(expect.objectContaining(input))
    expect(zones).toContainEqual(expect.objectContaining({ id: created.id, ...input }))
  })

  it('rechaza un código duplicado con 409 y un mensaje claro', async () => {
    const suffix = uniqueSuffix()
    const input = { name: `IT Zona ${suffix}`, code: `IT-${suffix}` }
    await zonesService.create(input)

    const message = await expectHttpError(
      zonesService.create({ name: `${input.name} copia`, code: input.code }),
      409,
    )

    expect(message).toBe(`Ya existe una zona registrada con el código '${input.code}'`)
  })

  it('rechaza datos vacíos con 400 y los mensajes de validación del backend', async () => {
    const message = await expectHttpError(zonesService.create({ name: '', code: '' }), 400)

    expect(message).toContain('El nombre de la zona es obligatorio')
    expect(message).toContain('El código de la zona es obligatorio')
  })
})
