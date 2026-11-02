'use client'

import { useActionState, useState } from 'react'
import { loginAction, registerAction } from '@/app/actions/auth'
import { Icon } from '@/components/icons'

export function LoginForm({ canRegister, next }: { canRegister: boolean; next: string }) {
  const [mode, setMode] = useState<'login' | 'register'>(canRegister ? 'register' : 'login')
  const [loginState, loginFormAction, loginPending] = useActionState(loginAction, {})
  const [registerState, registerFormAction, registerPending] = useActionState(registerAction, {})

  return (
    <div>
      {canRegister ? (
        <div className="segmented" style={{ marginBottom: 18 }}>
          <button
            type="button"
            className={mode === 'register' ? 'selected' : ''}
            onClick={() => setMode('register')}
          >
            Crear cuenta
          </button>
          <button
            type="button"
            className={mode === 'login' ? 'selected' : ''}
            onClick={() => setMode('login')}
          >
            Ya tengo cuenta
          </button>
        </div>
      ) : null}

      {mode === 'login' ? (
        <form action={loginFormAction}>
          <input type="hidden" name="next" value={next} />
          <label className="field">
            <span>Email</span>
            <input
              className="input"
              type="email"
              name="email"
              autoComplete="email"
              required
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
          {loginState?.error ? (
            <p className="error-text" role="alert">
              {loginState.error}
            </p>
          ) : null}
          <button className="primary-button" style={{ width: '100%', marginTop: 8 }} disabled={loginPending}>
            {loginPending ? 'Ingresando…' : 'Ingresar'}
            {!loginPending ? <Icon name="arrow" size={16} /> : null}
          </button>
        </form>
      ) : (
        <form action={registerFormAction}>
          <label className="field">
            <span>Nombre</span>
            <input className="input" name="name" autoComplete="name" required placeholder="Tu nombre" />
          </label>
          <label className="field">
            <span>Email</span>
            <input
              className="input"
              type="email"
              name="email"
              autoComplete="email"
              required
              placeholder="vos@correo.uy"
            />
          </label>
          <div className="field-grid">
            <label className="field">
              <span>Contraseña</span>
              <input
                className="input"
                type="password"
                name="password"
                autoComplete="new-password"
                minLength={10}
                required
                placeholder="Mínimo 10 caracteres"
              />
            </label>
            <label className="field">
              <span>Repetir</span>
              <input
                className="input"
                type="password"
                name="confirm"
                autoComplete="new-password"
                minLength={10}
                required
                placeholder="Repetí la clave"
              />
            </label>
          </div>
          {registerState?.error ? (
            <p className="error-text" role="alert">
              {registerState.error}
            </p>
          ) : null}
          <button className="primary-button" style={{ width: '100%', marginTop: 8 }} disabled={registerPending}>
            {registerPending ? 'Creando cuenta…' : 'Crear mi cuenta'}
            {!registerPending ? <Icon name="arrow" size={16} /> : null}
          </button>
          <p className="auth-footnote">
            El registro está abierto sólo para la primera cuenta de esta instalación. Después queda cerrado.
          </p>
        </form>
      )}
    </div>
  )
}
