'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import type { ActionState } from '@/lib/action-state'

type ServerAction = (state: ActionState, formData: FormData) => Promise<ActionState>

/**
 * Select de categoría que guarda al elegir, sin abrir el formulario completo.
 * Sólo se usa en movimientos pendientes de revisar.
 */
export function InlineCategoryPick({
  expenseId,
  categoryId,
  categories,
  action,
}: {
  expenseId: string
  categoryId: string | null
  categories: Array<{ id: string; name: string }>
  action: ServerAction
}) {
  const [state, formAction, pending] = useActionState(action, {})
  // Controlado: si queda con `defaultValue`, React re-aplica el valor por
  // defecto al re-renderizar las opciones después de guardar y el select
  // "volvía" a Sin categorizar.
  const [value, setValue] = useState(categoryId ?? '')
  useEffect(() => {
    setValue(categoryId ?? '')
  }, [categoryId])
  return (
    <form action={formAction} className="inline-pick">
      <input type="hidden" name="id" value={expenseId} />
      <select
        className="select"
        name="categoryId"
        value={value}
        disabled={pending}
        aria-label="Categoría del movimiento"
        title="Asignar categoría"
        onChange={(event) => {
          setValue(event.target.value)
          event.currentTarget.form?.requestSubmit()
        }}
      >
        <option value="">Sin categorizar</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>
      {state?.error ? <span className="error-text">{state.error}</span> : null}
    </form>
  )
}

/**
 * Nombre del movimiento editable en la lista: guarda al salir del campo o con
 * Enter, y Escape lo devuelve al valor guardado.
 */
export function InlineMerchantEdit({
  expenseId,
  merchant,
  action,
}: {
  expenseId: string
  merchant: string
  action: ServerAction
}) {
  const [state, formAction, pending] = useActionState(action, {})
  const formRef = useRef<HTMLFormElement>(null)
  const [value, setValue] = useState(merchant)
  const next = value.trim().replace(/\s{2,}/g, ' ')
  const dirty = next.length > 0 && next !== merchant

  function submitIfChanged() {
    if (dirty) formRef.current?.requestSubmit()
  }

  return (
    <form ref={formRef} action={formAction} className="inline-merchant-form">
      <input type="hidden" name="id" value={expenseId} />
      <input
        className="inline-merchant"
        name="merchant"
        value={value}
        maxLength={120}
        disabled={pending}
        aria-label="Nombre del movimiento"
        title="Editar el nombre"
        onChange={(event) => setValue(event.target.value)}
        onBlur={submitIfChanged}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            submitIfChanged()
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            setValue(merchant)
            event.currentTarget.blur()
          }
        }}
      />
      {state?.error ? <span className="error-text">{state.error}</span> : null}
    </form>
  )
}
