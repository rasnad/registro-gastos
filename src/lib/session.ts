// Subpaths concretos: evita arrastrar JWE/deflate al bundle del middleware (Edge).
import { SignJWT } from 'jose/jwt/sign'
import { jwtVerify } from 'jose/jwt/verify'

/** Sesión firmada (JWT HS256) en cookie httpOnly. Sin estado en el servidor. */
export const SESSION_COOKIE = 'rg_session'
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30

export type SessionPayload = {
  userId: string
  email: string
  name: string
}

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('Falta AUTH_SECRET en las variables de entorno')
  return new TextEncoder().encode(secret)
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secretKey())
}

export async function verifySession(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'] })
    if (
      typeof payload.userId === 'string' &&
      typeof payload.email === 'string' &&
      typeof payload.name === 'string'
    ) {
      return { userId: payload.userId, email: payload.email, name: payload.name }
    }
    return null
  } catch {
    return null
  }
}

/** Estado firmado para el flujo OAuth de Google (10 minutos). */
export async function signOAuthState(payload: { userId: string; nonce: string }): Promise<string> {
  return new SignJWT({ userId: payload.userId, nonce: payload.nonce })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience('gmail-oauth')
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(secretKey())
}

export async function verifyOAuthState(token: string | undefined): Promise<{ userId: string; nonce: string } | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'], audience: 'gmail-oauth' })
    if (typeof payload.userId === 'string' && typeof payload.nonce === 'string') {
      return { userId: payload.userId, nonce: payload.nonce }
    }
    return null
  } catch {
    return null
  }
}
