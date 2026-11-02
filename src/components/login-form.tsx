'use client'

import { useActionState } from 'react'
import { loginAction } from '@/app/actions/auth'
import { Icon } from '@/components/icons'

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(loginAction, {})

  return (
    <form action={formAction}>
      <input type="hidden" name="next" value={next} />
      <label className="field">
        <span>Email</span>
        <input
          className="input"
          type="email"
          name="email"
          autoComplete="email"
          required
          autoFocus
          placeholder="vos@correo.uy"
        />
      </label>
      <label className="field">
        <span>Contraseña</span>
        <input
          className="input"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          placeholder="••••••••••"
        />
      </label>
      {state?.error ? (
        <p className="error-text" role="alert">
          {state.error}
        </p>
      ) : null}
      <button className="primary-button" style={{ width: '100%', marginTop: 6 }} disabled={pending}>
        {pending ? 'Ingresando…' : 'Ingresar'}
        {!pending ? <Icon name="arrow" size={16} /> : null}
      </button>
    </form>
  )
}
