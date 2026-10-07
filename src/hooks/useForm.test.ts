import { act, renderHook } from '@testing-library/react'
import type { ChangeEvent, FormEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createHttpError } from '../test/http'
import { useForm, type FieldErrors } from './useForm'

type Values = { name: string }

const INITIAL: Values = { name: '' }
const validate = ({ name }: Values): FieldErrors<Values> =>
  name ? {} : { name: 'El nombre es obligatorio' }

const changeEvent = (name: string, value: string) =>
  ({ target: { name, value } }) as ChangeEvent<HTMLInputElement>
const submitEvent = () => ({ preventDefault: vi.fn() }) as unknown as FormEvent<HTMLFormElement>

const setup = (options: { onSubmit?: () => Promise<void>; resetOnSuccess?: boolean } = {}) => {
  const onSubmit = vi.fn(options.onSubmit ?? (() => Promise.resolve()))
  const hook = renderHook(() =>
    useForm({
      initialValues: INITIAL,
      validate,
      onSubmit,
      errorMessage: 'No se pudo guardar',
      resetOnSuccess: options.resetOnSuccess,
    }),
  )
  const change = (value: string) =>
    act(() => hook.result.current.handleChange(changeEvent('name', value)))
  const submit = () => act(() => hook.result.current.handleSubmit(submitEvent()))
  return { ...hook, onSubmit, change, submit }
}

describe('useForm', () => {
  it('actualiza los valores al escribir', () => {
    const { result, change } = setup()

    change('Ficoa')

    expect(result.current.values).toEqual({ name: 'Ficoa' })
  })

  it('no envía y muestra errores si la validación falla', async () => {
    const { result, onSubmit, submit } = setup()

    await submit()

    expect(onSubmit).not.toHaveBeenCalled()
    expect(result.current.fieldErrors).toEqual({ name: 'El nombre es obligatorio' })
  })

  it('limpia el error del campo al modificarlo', async () => {
    const { result, change, submit } = setup()

    await submit()
    change('F')

    expect(result.current.fieldErrors.name).toBeUndefined()
  })

  it('envía los valores válidos y conserva el formulario por defecto', async () => {
    const { result, onSubmit, change, submit } = setup()

    change('Ficoa')
    await submit()

    expect(onSubmit).toHaveBeenCalledWith({ name: 'Ficoa' })
    expect(result.current.values).toEqual({ name: 'Ficoa' })
    expect(result.current.isSubmitting).toBe(false)
  })

  it('reinicia el formulario tras un envío exitoso si se indica', async () => {
    const { result, change, submit } = setup({ resetOnSuccess: true })

    change('Ficoa')
    await submit()

    expect(result.current.values).toEqual(INITIAL)
  })

  it('muestra el error del backend y conserva los valores si el envío falla', async () => {
    const { result, change, submit } = setup({
      resetOnSuccess: true,
      onSubmit: () => Promise.reject(createHttpError(409, { data: { message: 'Ya existe' } })),
    })

    change('Ficoa')
    await submit()

    expect(result.current.submitError).toBe('Ya existe')
    expect(result.current.values).toEqual({ name: 'Ficoa' })
    expect(result.current.isSubmitting).toBe(false)
  })

  it('usa el mensaje por defecto si el error no trae uno', async () => {
    const { result, change, submit } = setup({ onSubmit: () => Promise.reject(new Error('x')) })

    change('Ficoa')
    await submit()

    expect(result.current.submitError).toBe('No se pudo guardar')
  })
})
