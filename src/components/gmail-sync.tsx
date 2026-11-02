'use client'

import { useActionState } from 'react'
import { syncGmailNow } from '@/app/actions/gmail'
import { Icon } from '@/components/icons'

export function GmailSyncButton() {
  const [state, action, pending] = useActionState(syncGmailNow, {})
  return (
    <form action={action} className="stack-sm">
      <div className="row">
        <button type="submit" className="primary-button small-button" disabled={pending}>
          <Icon name={pending ? 'spinner' : 'refresh'} size={15} />
          {pending ? 'Sincronizando…' : 'Sincronizar ahora'}
        </button>
        <span className="hint">Puede tardar unos segundos si hay muchos correos nuevos.</span>
      </div>
      {state?.error ? (
        <p className="error-text" role="alert">
          {state.error}
        </p>
      ) : null}
      {state?.message ? <p className="hint">{state.message}</p> : null}
    </form>
  )
}
