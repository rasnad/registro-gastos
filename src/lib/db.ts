import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'

/**
 * Prisma sobre el driver serverless de Neon (HTTP/443).
 *
 * Motivo: la red corporativa donde se desarrolla esto bloquea el puerto 5432,
 * y en Vercel el driver HTTP evita agotar conexiones.
 * El adapter no abre conexiones persistentes; el pool lo maneja Neon.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createClient() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error(
      'Falta DATABASE_URL. Copiá .env.example a .env y pegá la cadena de conexión de Neon.',
    )
  }
  const adapter = new PrismaNeon({ connectionString })
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })
}

export const prisma = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
