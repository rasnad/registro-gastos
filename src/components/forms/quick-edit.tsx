'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import type { ActionState } from '@/lib/action-state'

type ServerAction = (state: ActionState, formData: FormData) => Promise<ActionState>

/**
 * Select de categoría que guarda al elegir, sin abrir el formulario completo.
 * Sólo se usa en movimientos pendientes de revisar.
 *
 * No se usa `<form action>`: React 19 hace `form.reset()` al completarse la
 * acción y el select volvía visualmente a "Sin categorizar" (aunque el cambio
 * ya estaba guardado). Acá la acción se invoca directo y el valor es estado.
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
  const [value, setValue] = useState(categoryId ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    setValue(categoryId ?? '')
  }, [categoryId])

  function save(next: string) {
    const previous = value
    setValue(next)
    setError(null)
    const formData = new FormData()
    formData.set('id', expenseId)
    formData.set('categoryId', next)
    startTransition(async () => {
      const result = await action({}, formData)
      if (result?.error) {
        setValue(previous)
        setError(result.error)
      }
    })
  }

  return (
    <span className="inline-pick">
      <select
        className="select"
        value={value}
        disabled={pending}
        aria-label="Categoría del movimiento"
        title="Asignar categoría"
        onChange={(event) => save(event.target.value)}
      >
        <option value="">Sin categorizar</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>
      {error ? <span className="error-text">{error}</span> : null}
    </span>
  )
}

/**
 * Nombre del movimiento editable en la lista: guarda al salir del campo o con
 * Enter, y Escape lo devuelve al valor guardado. Igual que el selector de
 * categoría, evita `<form action>` para que el reset de React no revierta el
 * texto que se acaba de guardar.
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
  const [value, setValue] = useState(merchant)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setValue(merchant)
  }, [merchant])

  const next = value.trim().replace(/\s{2,}/g, ' ')

  function save() {
    if (!next) {
      setValue(merchant)
      return
    }
    if (next === merchant) return
    setError(null)
    const formData = new FormData()
    formData.set('id', expenseId)
    formData.set('merchant', next)
    startTransition(async () => {
      const result = await action({}, formData)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <span className="inline-merchant-form">
      <input
        ref={inputRef}
        className="inline-merchant"
        value={value}
        maxLength={120}
        disabled={pending}
        aria-label="Nombre del movimiento"
        title="Editar el nombre"
        onChange={(event) => setValue(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            // El blur dispara el guardado (y evita guardar dos veces).
            event.currentTarget.blur()
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            setValue(merchant)
            inputRef.current?.blur()
          }
        }}
      />
      {error ? <span className="error-text">{error}</span> : null}
    </span>
  )
}
