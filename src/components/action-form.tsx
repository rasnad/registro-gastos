'use client'

import { useActionState, useEffect, useRef, type ReactNode } from 'react'
import { useDialogClose } from '@/components/dialog'
import type { ActionState } from '@/lib/action-state'

export type ServerAction = (state: ActionState, formData: FormData) => Promise<ActionState>

export function ActionForm({
  action,
  children,
  submitLabel = 'Guardar',
  submitClassName = 'primary-button',
  showCancel,
  resetOnSuccess = false,
  className,
  hidden,
  compact = false,
}: {
  action: ServerAction
  children: ReactNode
  submitLabel?: string
  submitClassName?: string
  showCancel?: boolean
  resetOnSuccess?: boolean
  className?: string
  hidden?: Record<string, string | number | boolean | null | undefined>
  compact?: boolean
}) {
  const [state, formAction, pending] = useActionState(action, {})
  const close = useDialogClose()
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state?.ok) {
      if (resetOnSuccess) formRef.current?.reset()
      close?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const withCancel = showCancel ?? Boolean(close)

  return (
    <form ref={formRef} action={formAction} className={className}>
      {hidden
        ? Object.entries(hidden).map(([key, value]) =>
            value === null || value === undefined ? null : (
              <input key={key} type="hidden" name={key} value={String(value)} />
            ),
          )
        : null}
      {children}
      {state?.error ? (
        <p className="error-text" role="alert">
          {state.error}
        </p>
      ) : null}
      {state?.message ? <p className="hint">{state.message}</p> : null}
      <div className="form-actions" style={compact ? { marginTop: 8 } : undefined}>
        {withCancel ? (
          <button type="button" className="ghost-button" onClick={() => close?.()}>
            Cancelar
          </button>
        ) : null}
        <button type="submit" className={submitClassName} disabled={pending}>
          {pending ? 'Guardando…' : submitLabel}
        </button>
      </div>
    </form>
  )
}
