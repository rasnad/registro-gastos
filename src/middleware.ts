import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, verifySession } from '@/lib/session'

/**
 * Protección de rutas a nivel de middleware: cualquier página o endpoint
 * (salvo el login y el callback de OAuth) exige sesión válida.
 * La verificación real de datos se repite en el servidor con requireUser().
 */

const PUBLIC_PATHS = [
  '/login',
  '/api/auth',
  '/api/gmail/callback',
  '/api/gmail/push',
  '/api/cron',
  '/api/health',
  '/manifest.webmanifest',
  '/icon.svg',
  '/apple-icon',
]

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  // La API nativa valida tokens opacos revocables en cada Route Handler (Node).
  // Una cookie web nunca autoriza solicitudes a esta API.
  if (pathname.startsWith('/api/mobile/v1/')) return NextResponse.next()

  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next()
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value
  const session = await verifySession(token)

  if (!session) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    const loginUrl = new URL('/login', request.url)
    if (pathname !== '/') loginUrl.searchParams.set('next', `${pathname}${search}`)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon|manifest.webmanifest).*)'],
}
