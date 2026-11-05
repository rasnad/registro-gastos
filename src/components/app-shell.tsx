'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon, LogoMark, type IconName } from '@/components/icons'
import type { ReactNode } from 'react'

const MAIN_NAV: Array<{ href: string; label: string; icon: IconName }> = [
  { href: '/', label: 'Inicio', icon: 'home' },
  { href: '/movimientos', label: 'Movimientos', icon: 'movement' },
  { href: '/tarjetas', label: 'Tarjetas', icon: 'card' },
  { href: '/proyeccion', label: 'Proyección', icon: 'chart' },
  { href: '/ahorro', label: 'Ahorro', icon: 'goal' },
]

const SECONDARY_NAV: Array<{ href: string; label: string; icon: IconName }> = [
  { href: '/cuentas', label: 'Cuentas fijas', icon: 'receipt' },
  { href: '/ajustes', label: 'Ajustes', icon: 'settings' },
]

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function AppShell({
  user,
  reviewCount,
  children,
}: {
  user: { name: string; email: string }
  reviewCount: number
  children: ReactNode
}) {
  const pathname = usePathname()
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href))

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="logo" aria-label="Ir al inicio">
          <LogoMark />
          <span>Registro</span>
        </Link>

        <nav className="side-nav" aria-label="Principal">
          <p className="nav-label">Menú</p>
          {MAIN_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${isActive(item.href) ? 'active' : ''}`}
              aria-current={isActive(item.href) ? 'page' : undefined}
            >
              <Icon name={item.icon} size={18} />
              <span>{item.label}</span>
              {item.href === '/movimientos' && reviewCount > 0 ? <span className="nav-badge">{reviewCount}</span> : null}
              {isActive(item.href) ? <b /> : null}
            </Link>
          ))}

          <p className="nav-label">Gestión</p>
          {SECONDARY_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${isActive(item.href) ? 'active' : ''}`}
              aria-current={isActive(item.href) ? 'page' : undefined}
            >
              <Icon name={item.icon} size={18} />
              <span>{item.label}</span>
              {isActive(item.href) ? <b /> : null}
            </Link>
          ))}
        </nav>

        {reviewCount > 0 ? (
          <div className="sidebar-tip">
            <span className="tip-icon">
              <Icon name="warning" size={17} />
            </span>
            <strong>{reviewCount} movimiento{reviewCount === 1 ? '' : 's'} por revisar</strong>
            <p>Se incluyen en los cálculos como estimados hasta que confirmes los datos.</p>
            <Link href="/movimientos?estado=revision" className="link-button" style={{ marginTop: 8, paddingLeft: 0 }}>
              Revisar <Icon name="arrow" size={13} />
            </Link>
          </div>
        ) : null}

        <div className="profile" style={{ cursor: 'default' }}>
          <span className="avatar">{initials(user.name)}</span>
          <span>
            <strong>{user.name}</strong>
            <small>{user.email}</small>
          </span>
          <form action="/api/auth/logout" method="post">
            <button type="submit" className="icon-button ghost" title="Cerrar sesión" aria-label="Cerrar sesión">
              <Icon name="logout" size={16} />
            </button>
          </form>
        </div>
      </aside>

      <main className="app-main">
        <header className="app-header">
          <div className="header-actions">
            <Link
              href="/movimientos?nuevo=1"
              className="header-add"
              title="Nuevo movimiento"
              aria-label="Nuevo movimiento"
            >
              <Icon name="plus" size={22} />
            </Link>
            <span className="mobile-avatar" aria-hidden="true">{initials(user.name)}</span>
          </div>
        </header>

        <div className="content">{children}</div>
      </main>

      <nav className="bottom-nav" aria-label="Navegación principal">
        <Link href="/" className={isActive('/') ? 'active' : ''}>
          <Icon name="home" size={20} />
          <span>Inicio</span>
        </Link>
        <Link href="/movimientos" className={isActive('/movimientos') ? 'active' : ''}>
          <Icon name="movement" size={20} />
          <span>Movimientos</span>
        </Link>
        <Link href="/movimientos?nuevo=1" className="mobile-add">
          <span>
            <Icon name="plus" size={22} />
          </span>
          <span>Nuevo</span>
        </Link>
        <Link href="/tarjetas" className={isActive('/tarjetas') ? 'active' : ''}>
          <Icon name="card" size={20} />
          <span>Tarjetas</span>
        </Link>
        <Link href="/proyeccion" className={isActive('/proyeccion') ? 'active' : ''}>
          <Icon name="chart" size={20} />
          <span>Proyección</span>
        </Link>
      </nav>
    </div>
  )
}
