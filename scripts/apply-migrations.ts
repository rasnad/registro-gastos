/**
 * Aplica migraciones de Prisma usando el driver HTTP de Neon (puerto 443).
 *
 * `prisma migrate deploy` necesita TCP (5432), que puede estar bloqueado por la
 * red corporativa. Este script hace lo mismo sobre HTTP: ejecuta los .sql de
 * prisma/migrations en orden y registra la fila en _prisma_migrations con el
 * mismo formato que Prisma, para que un `migrate deploy` posterior no repita nada.
 *
 * Uso: npm run db:apply
 */
import 'dotenv/config'
import { createHash, randomUUID } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { neon } from '@neondatabase/serverless'

const MIGRATIONS_DIR = path.join(process.cwd(), 'prisma', 'migrations')

type MigrationRow = { migration_name: string }

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('Falta DATABASE_URL')
  const sql = neon(url)

  await sql`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" varchar(36) PRIMARY KEY NOT NULL,
      "checksum" varchar(64) NOT NULL,
      "finished_at" timestamptz,
      "migration_name" varchar(255) NOT NULL,
      "logs" text,
      "rolled_back_at" timestamptz,
      "started_at" timestamptz NOT NULL DEFAULT now(),
      "applied_steps_count" integer NOT NULL DEFAULT 0
    )
  `

  const applied = (await sql`
    SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
  `) as MigrationRow[]
  const appliedNames = new Set(applied.map((row) => row.migration_name))

  const dirs = readdirSync(MIGRATIONS_DIR)
    .filter((name) => statSync(path.join(MIGRATIONS_DIR, name)).isDirectory())
    .sort()

  let count = 0
  for (const dir of dirs) {
    const name = dir
    if (appliedNames.has(name)) {
      console.log(`= ${name} (ya aplicada)`)
      continue
    }
    const file = path.join(MIGRATIONS_DIR, dir, 'migration.sql')
    const content = readFileSync(file, 'utf8')
    const checksum = createHash('sha256').update(content).digest('hex')
    console.log(`→ aplicando ${name}`)

    // El driver HTTP ejecuta una sentencia por llamada: se separan por ';'
    // (las migraciones generadas por Prisma no contienen bloques $$).
    const statements = content
      .split(/;\s*(?:\r?\n|$)/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    for (const statement of statements) {
      try {
        await sql.query(statement)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        // Idempotencia para entornos donde la tabla ya existe pero no el registro.
        if (/already exists/i.test(message)) {
          console.warn(`  · omitido (ya existe): ${message.slice(0, 90)}`)
          continue
        }
        throw new Error(`Error en ${name}: ${message}\nSentencia: ${statement.slice(0, 200)}`)
      }
    }

    await sql`
      INSERT INTO "_prisma_migrations"
        ("id", "checksum", "finished_at", "migration_name", "logs", "started_at", "applied_steps_count")
      VALUES (${randomUUID()}, ${checksum}, now(), ${name}, NULL, now(), 1)
    `
    count += 1
  }

  console.log(count === 0 ? 'Sin migraciones pendientes.' : `${count} migración(es) aplicada(s).`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
