'use client'

import { useEffect } from 'react'

/**
 * Pantalla de error de la aplicación. Muestra el digest para poder buscarlo en
 * los logs de Vercel, sin exponer detalles internos.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Sólo el digest: nunca datos financieros ni tokens.
    console.error('Error de aplicación', error.digest ?? 'sin digest')
  }, [error])

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="logo" style={{ padding: 0, marginBottom: 20 }}>
          <span className="logo-mark">
            <i />
            <i />
            <i />
          </span>
          <span>Registro</span>
        </div>
        <h1>Algo falló al cargar</h1>
        <p className="hint" style={{ margin: '6px 0 14px' }}>
          Suele ser configuración del despliegue (variables de entorno o base de datos). Probá de nuevo; si
          sigue, revisá <code>/api/health</code> y los logs de Vercel.
        </p>
        <button type="button" className="primary-button" style={{ width: '100%' }} onClick={reset}>
          Reintentar
        </button>
        <p className="hint" style={{ marginTop: 12, textAlign: 'center' }}>
          Digest: <code>{error.digest ?? 'sin digest'}</code>
        </p>
      </div>
    </main>
  )
}
