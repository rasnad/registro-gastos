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
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const store = await cookies()
  const payload = await verifySession(store.get(SESSION_COOKIE)?.value)
  if (!payload) return null
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, email: true, name: true },
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
  await setSessionCookie({ id: user.id, email: user.email, name: user.name })
  return {}
}

/**
 * Registro abierto sólo para la primera cuenta: la app es personal.
 * Después de crear el primer usuario, el alta queda cerrada.
 */
export async function registerFirstUser(input: {
  name: string
  email: string
  password: string
}): Promise<{ error?: string }> {
  const total = await prisma.user.count()
  if (total > 0) {
    return { error: 'Ya existe una cuenta. Iniciá sesión.' }
  }
  if (input.password.length < 10) {
    return { error: 'Usá una contraseña de al menos 10 caracteres.' }
  }
  const email = input.email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'El email no es válido.' }
  }

  const passwordHash = await bcrypt.hash(input.password, 12)
  const user = await prisma.user.create({
    data: { name: input.name.trim() || 'Mi cuenta', email, passwordHash },
  })
  const { ensureDefaultCategories } = await import('@/lib/categories')
  await ensureDefaultCategories(user.id)
  await setSessionCookie({ id: user.id, email: user.email, name: user.name })
  return {}
}

export async function logout() {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}
