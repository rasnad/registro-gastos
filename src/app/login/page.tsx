import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { countUsers, getCurrentUser } from '@/lib/auth'
import { LoginForm } from '@/components/login-form'
import { LogoMark } from '@/components/icons'

export const metadata: Metadata = { title: 'Ingresar' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const user = await getCurrentUser()
  if (user) redirect('/')

  const params = await searchParams
  const next = params.next && params.next.startsWith('/') && !params.next.startsWith('//') ? params.next : '/'
  const total = await countUsers()

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="logo" style={{ padding: 0, marginBottom: 22 }}>
          <LogoMark />
          <span>Registro</span>
        </div>

        {total === 0 ? (
          <>
            <h1>Falta crear el usuario</h1>
            <p className="hint" style={{ margin: '6px 0 14px' }}>
              Esta instalación no tiene usuarios todavía. Creá el primero desde la terminal del proyecto:
            </p>
            <pre className="auth-command">npm run user:create -- --email=tu@correo.uy --name=&quot;Tu nombre&quot;</pre>
            <p className="hint" style={{ marginTop: 12 }}>
              Podés crear un usuario compartido para los dos, o uno para cada uno (cada usuario ve sólo sus
              movimientos). Después recargá esta página.
            </p>
          </>
        ) : (
          <>
            <h1>Ingresar</h1>
            <p className="hint" style={{ margin: '4px 0 18px' }}>
              Acceso privado.
            </p>
            <LoginForm next={next} />
          </>
        )}
      </div>
    </main>
  )
}
