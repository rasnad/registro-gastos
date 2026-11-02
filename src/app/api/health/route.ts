import { NextResponse } from 'next/server'
import { neon } from '@neondatabase/serverless'

export const dynamic = 'force-dynamic'

/**
 * Diagnóstico de despliegue. Público a propósito (no devuelve datos ni secretos):
 * sólo indica si las variables están presentes y si la base responde.
 * No usa src/lib/db.ts para poder reportar el problema aun cuando ese módulo falle.
 */
export async function GET() {
  const env = {
    DATABASE_URL: Boolean(process.env.DATABASE_URL),
    AUTH_SECRET: Boolean(process.env.AUTH_SECRET),
    TOKEN_ENCRYPTION_KEY: Boolean(process.env.TOKEN_ENCRYPTION_KEY),
    GOOGLE_OAUTH: Boolean(
      process.env.GOOGLE_CLIENT_ID &&
        process.env.GOOGLE_CLIENT_SECRET &&
        process.env.GOOGLE_REDIRECT_URI,
    ),
    CRON_SECRET: Boolean(process.env.CRON_SECRET),
  }

  let database: 'ok' | 'error' | 'missing' = 'missing'
  let schema: 'ok' | 'missing' | 'unknown' = 'unknown'
  let detail: string | undefined

  if (process.env.DATABASE_URL) {
    try {
      const sql = neon(process.env.DATABASE_URL)
      await sql`select 1 as ok`
      database = 'ok'
      const rows = (await sql`select to_regclass('public."User"') is not null as exists`) as Array<{
        exists: boolean
      }>
      schema = rows[0]?.exists ? 'ok' : 'missing'
    } catch (error) {
      database = 'error'
      const message = error instanceof Error ? error.message : 'Error desconocido'
      // Nunca devolver la cadena de conexión ni credenciales.
      detail = message
        .replace(/postgres(ql)?:\/\/\S+/gi, '[url]')
        .replace(/password=\S+/gi, 'password=[redacted]')
        .slice(0, 180)
    }
  }

  const ok = env.DATABASE_URL && env.AUTH_SECRET && database === 'ok' && schema === 'ok'
  return NextResponse.json(
    {
      ok,
      database,
      schema,
      env,
      runtime: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
      region: process.env.VERCEL_REGION ?? null,
      ...(detail ? { detail } : {}),
    },
    { status: ok ? 200 : 503 },
  )
}
