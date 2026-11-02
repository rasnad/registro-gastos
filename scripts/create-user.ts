/**
 * Alta y administración de usuarios desde la terminal.
 *
 *   npm run user:create -- --email=yo@correo.uy --name="Mi nombre"
 *   npm run user:create -- --email=pareja@correo.uy --name="Pareja"
 *   npm run user:create -- --reset --email=yo@correo.uy     (nueva contraseña)
 *   npm run user:create -- --list
 *
 * Si no se pasa --password, se genera una aleatoria y se imprime una sola vez.
 * No hay registro público en la aplicación.
 */
import 'dotenv/config'
import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import { DEFAULT_CATEGORIES } from '../src/lib/default-categories'

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
})

function arg(name: string): string | undefined {
  const prefix = `--${name}=`
  const withEquals = process.argv.find((value) => value.startsWith(prefix))
  if (withEquals) return withEquals.slice(prefix.length)
  const index = process.argv.indexOf(`--${name}`)
  if (index > -1) {
    const next = process.argv[index + 1]
    if (next && !next.startsWith('--')) return next
  }
  return undefined
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

function generatePassword(): string {
  // 18 bytes → 24 caracteres base64url, fácil de copiar y fuerte.
  return randomBytes(18).toString('base64url')
}

function printPassword(password: string, generated: boolean) {
  console.log('')
  console.log('  Contraseña:', password)
  console.log(generated ? '  (generada ahora; no se vuelve a mostrar)' : '  (definida por vos)')
  console.log('')
}

async function ensureCategories(userId: string) {
  const count = await prisma.category.count({ where: { userId } })
  if (count > 0) return
  await prisma.category.createMany({
    data: DEFAULT_CATEGORIES.map((category) => ({
      userId,
      name: category.name,
      icon: category.icon,
      color: category.color,
      isSystem: category.name === 'Sin categorizar',
    })),
    skipDuplicates: true,
  })
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('Falta DATABASE_URL (.env).')
    process.exit(1)
  }

  if (flag('list')) {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: { name: true, email: true, createdAt: true, _count: { select: { expenses: true } } },
    })
    if (users.length === 0) {
      console.log('No hay usuarios. Creá el primero con:')
      console.log('  npm run user:create -- --email=tu@correo.uy --name="Tu nombre"')
      return
    }
    console.log(`${users.length} usuario(s):`)
    for (const user of users) {
      console.log(
        `  · ${user.email} — ${user.name} · desde ${user.createdAt.toISOString().slice(0, 10)} · ${user._count.expenses} movimientos`,
      )
    }
    return
  }

  const email = arg('email')?.trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Falta --email válido. Ejemplo:')
    console.error('  npm run user:create -- --email=yo@correo.uy --name="Mi nombre"')
    process.exit(1)
  }

  const providedPassword = arg('password') ?? process.env.USER_PASSWORD
  if (providedPassword && providedPassword.length < 8) {
    console.error('La contraseña debe tener al menos 8 caracteres.')
    process.exit(1)
  }
  if (providedPassword && (providedPassword.length < 12 || /^d+$/.test(providedPassword))) {
    console.warn('Aviso: contraseña corta o sólo numérica. Para un sitio público conviene una frase de 4+ palabras.')
  }
  const password = providedPassword ?? generatePassword()
  const passwordHash = await bcrypt.hash(password, 12)

  if (flag('reset')) {
    const existing = await prisma.user.findUnique({ where: { email } })
    if (!existing) {
      console.error(`No existe un usuario con ${email}.`)
      process.exit(1)
    }
    await prisma.user.update({ where: { id: existing.id }, data: { passwordHash } })
    console.log(`Contraseña actualizada para ${email}.`)
    printPassword(password, !providedPassword)
    return
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    console.error(`Ya existe un usuario con ${email}.`)
    console.error(`Para cambiar su contraseña: npm run user:create -- --reset --email=${email}`)
    process.exit(1)
  }

  const name = arg('name')?.trim() || email.split('@')[0]
  const user = await prisma.user.create({ data: { email, name, passwordHash } })
  await ensureCategories(user.id)

  console.log(`Usuario creado: ${user.email} (${user.name})`)
  printPassword(password, !providedPassword)
  console.log('Entrá a /login con ese email y contraseña.')
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
