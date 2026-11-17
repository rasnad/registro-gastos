import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyOAuthState } from '@/lib/session'
import { exchangeCode, gmailForRefreshToken } from '@/lib/gmail/client'
import { encryptToken } from '@/lib/gmail/crypto'
import { importFromForConnection } from '@/lib/gmail/status'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const error = url.searchParams.get('error')
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  if (error) {
    return NextResponse.redirect(new URL(`/ajustes?gmail=denied#gmail`, request.url))
  }
  if (!code || !state) {
    return NextResponse.redirect(new URL('/ajustes?gmail=invalid#gmail', request.url))
  }

  const store = await cookies()
  const cookieNonce = store.get('gmail_oauth_nonce')?.value
  const payload = await verifyOAuthState(state)
  store.delete('gmail_oauth_nonce')

  if (!payload || !cookieNonce || payload.nonce !== cookieNonce) {
    return NextResponse.redirect(new URL('/ajustes?gmail=state#gmail', request.url))
  }

  try {
    const tokens = await exchangeCode(code)
    const gmail = gmailForRefreshToken(tokens.refresh_token!)
    const profile = await gmail.users.getProfile({ userId: 'me' })
    const emailAddress = profile.data.emailAddress ?? 'cuenta de Gmail'

    const previous = await prisma.gmailConnection.findUnique({
      where: { userId: payload.userId },
      select: { importFrom: true },
    })

    await prisma.gmailConnection.upsert({
      where: { userId: payload.userId },
      create: {
        userId: payload.userId,
        emailAddress,
        refreshToken: encryptToken(tokens.refresh_token!),
        accessToken: tokens.access_token ? encryptToken(tokens.access_token) : null,
        tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        scopes: (tokens.scope ?? '').slice(0, 500),
        status: 'ACTIVE',
        // Primera conexión: se escucha desde este momento, nada del pasado.
        importFrom: importFromForConnection(null),
      },
      update: {
        emailAddress,
        refreshToken: encryptToken(tokens.refresh_token!),
        accessToken: tokens.access_token ? encryptToken(tokens.access_token) : null,
        tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        scopes: (tokens.scope ?? '').slice(0, 500),
        status: 'ACTIVE',
        lastSyncError: null,
        // Al reconectar se conserva el inicio original: los avisos que llegaron
        // con la conexión caída se importan en la próxima sincronización.
        importFrom: importFromForConnection(previous?.importFrom),
      },
    })

    return NextResponse.redirect(new URL('/ajustes?gmail=connected#gmail', request.url))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'No se pudo conectar Gmail'
    console.error('Gmail OAuth error:', message)
    return NextResponse.redirect(new URL('/ajustes?gmail=error#gmail', request.url))
  }
}
