import 'server-only'
import { createHash, createHmac, randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { ApiError } from './http'

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')
const selectUser = { id: true, email: true, name: true, usdRateCents: true } as const
const unauthorized = () => new ApiError(401, 'UNAUTHORIZED', 'Iniciá sesión nuevamente.')
const accessLifetime = 15 * 60 * 1000
const refreshLifetime = 30 * 24 * 60 * 60 * 1000

function tokens() {
  return { accessToken: randomBytes(32).toString('base64url'), refreshToken: randomBytes(32).toString('base64url'), expiresIn: accessLifetime / 1000 }
}

export async function loginMobile(email: string, password: string) {
  const normalized = email.trim().toLowerCase()
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('Missing auth secret')
  // Contador persistente y atómico, también entre instancias serverless.
  const bucket = Math.floor(Date.now() / (15 * 60 * 1000))
  const key = createHmac('sha256', secret).update(`${normalized}:${bucket}`).digest('hex')
  const limit = await prisma.mobileLoginLimit.upsert({ where: { key }, create: { key, attempts: 1, expiresAt: new Date((bucket + 1) * 15 * 60 * 1000) }, update: { attempts: { increment: 1 } } })
  if (limit.attempts > 10) throw new ApiError(429, 'RATE_LIMIT', 'Esperá unos minutos antes de volver a intentar.')
  const user = await prisma.user.findUnique({ where: { email: normalized } })
  const valid = await bcrypt.compare(password, user?.passwordHash ?? '$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW')
  if (!user || !valid) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email o contraseña incorrectos.')
  const pair = tokens()
  await prisma.mobileSession.create({ data: { userId: user.id, accessHash: hashToken(pair.accessToken), refreshHash: hashToken(pair.refreshToken), accessExpiresAt: new Date(Date.now() + accessLifetime), expiresAt: new Date(Date.now() + refreshLifetime) } })
  return pair
}

export async function authenticateMobile(request: Request) {
  const header = request.headers.get('authorization') ?? ''
  if (!/^Bearer [A-Za-z0-9_-]{43}$/.test(header)) throw unauthorized()
  const session = await prisma.mobileSession.findUnique({ where: { accessHash: hashToken(header.slice(7)) }, include: { user: { select: selectUser } } })
  if (!session || session.revokedAt || session.accessExpiresAt.getTime() <= Date.now() || session.expiresAt.getTime() <= Date.now()) throw unauthorized()
  return { user: session.user, sessionId: session.id }
}

export async function refreshMobile(refreshToken: string) {
  const pair = tokens()
  // Compare-and-swap: dos solicitudes simultáneas no pueden reutilizar el token.
  const result = await prisma.mobileSession.updateMany({ where: { refreshHash: hashToken(refreshToken), revokedAt: null, expiresAt: { gt: new Date() } }, data: { accessHash: hashToken(pair.accessToken), refreshHash: hashToken(pair.refreshToken), accessExpiresAt: new Date(Date.now() + accessLifetime) } })
  if (result.count !== 1) throw unauthorized()
  return pair
}

export async function logoutMobile(request: Request) {
  const { sessionId } = await authenticateMobile(request)
  await prisma.mobileSession.update({ where: { id: sessionId }, data: { revokedAt: new Date() } })
  return { ok: true }
}
