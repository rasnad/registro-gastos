import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { countUsers, getCurrentUser } from '@/lib/auth'
import { LoginForm } from '@/components/login-form'
import { Icon, LogoMark } from '@/components/icons'

export const metadata: Metadata = { title: 'Ingresar' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const user = await getCurrentUser()
  if (user) redirect('/')

  const params = await searchParams
  const next = params.next && params.next.startsWith('/') ? params.next : '/'
  const total = await countUsers()

  return (
    <div className="auth-page">
      <aside className="auth-aside">
        <div className="logo">
          <LogoMark />
          <span>Registro</span>
        </div>
        <div>
          <h2>Tu situación financiera, clara y en una sola pantalla.</h2>
          <p>
            Gastos diarios, tarjetas y cuotas, cuentas del mes y objetivos de ahorro. Pesos y dólares
            por separado, sin conversiones automáticas.
          </p>
          <div className="auth-points">
            <div>
              <i><Icon name="card" size={12} /></i>
              <span>Las compras en cuotas se imputan al resumen que corresponde, no al mes de compra.</span>
            </div>
            <div>
              <i><Icon name="lock" size={12} /></i>
              <span>Tus datos quedan en tu cuenta: cada ruta exige sesión y sólo ves tus movimientos.</span>
            </div>
            <div>
              <i><Icon name="chart" size={12} /></i>
              <span>Las proyecciones muestran supuestos y datos faltantes en lugar de inventar cifras.</span>
            </div>
          </div>
        </div>
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,.45)' }}>
          Uruguay · pesos uruguayos y dólares
        </p>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <h1>{total === 0 ? 'Creemos tu cuenta' : 'Ingresá a tu registro'}</h1>
          <p>
            {total === 0
              ? 'Es la primera vez que se usa esta instalación. Elegí una contraseña larga: acá van a vivir tus finanzas.'
              : 'Tus datos son privados. Sólo se muestran en esta sesión.'}
          </p>
          <LoginForm canRegister={total === 0} next={next} />
        </div>
      </main>
    </div>
  )
}
