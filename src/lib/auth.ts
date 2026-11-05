import 'server-only'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  signSession,
  verifySession,
} from '@/lib/session'

export type CurrentUser = {
  id: string
  email: string
  name: string
  /** Centavos de UYU por 1 USD (4100 = $U 41,00). */
  usdRateCents: number
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const store = await cookies()
  const payload = await verifySession(store.get(SESSION_COOKIE)?.value)
  if (!payload) return null
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, email: true, name: true, usdRateCents: true },
  })
  return user
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return user
}

export async function countUsers(): Promise<number> {
  return prisma.user.count()
}

async function setSessionCookie(user: CurrentUser) {
  const token = await signSession({ userId: user.id, email: user.email, name: user.name })
  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  })
}

export async function login(email: string, password: string): Promise<{ error?: string }> {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
  })
  if (!user) return { error: 'Email o contraseña incorrectos.' }
  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) return { error: 'Email o contraseña incorrectos.' }
  await setSessionCookie({
    id: user.id,
    email: user.email,
    name: user.name,
    usdRateCents: user.usdRateCents,
  })
  return {}
}

export async function logout() {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}
