import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireUser } from '@/lib/auth'
import { signOAuthState } from '@/lib/session'
import { buildAuthUrl, isGmailConfigured } from '@/lib/gmail/client'

export async function GET(request: Request) {
  const user = await requireUser()
  if (!isGmailConfigured()) {
    return NextResponse.redirect(new URL('/ajustes?gmail=unconfigured#gmail', request.url))
  }

  const nonce = randomUUID()
  const state = await signOAuthState({ userId: user.id, nonce })
  const store = await cookies()
  store.set('gmail_oauth_nonce', nonce, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  })

  return NextResponse.redirect(buildAuthUrl(state))
}
