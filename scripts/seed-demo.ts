/**
 * Datos de demostración para verificar la app localmente.
 * Sólo se ejecuta con ALLOW_DEMO_SEED=1 y crea/actualiza el usuario demo.
 *
 * Uso: ALLOW_DEMO_SEED=1 npm run seed:demo
 */
import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import { fromCents } from '../src/lib/money'
import {
  addMonthsKey,
  dateInMonth,
  monthKeyOf,
  statementDueDate,
  statementPeriodForPurchase,
  todayISO,
  addMonthsISO,
} from '../src/lib/period'
import { DEFAULT_CATEGORIES } from '../src/lib/default-categories'

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }),
})

const dateValue = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

async function main() {
  if (process.env.ALLOW_DEMO_SEED !== '1') {
    console.error('Definí ALLOW_DEMO_SEED=1 para crear datos de demostración.')
    process.exit(1)
  }

  const today = todayISO()
  const current = monthKeyOf(today)
  const email = 'demo@registro.local'
  const passwordHash = await bcrypt.hash('demo-gastos-2025', 12)

  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name: 'Demo', passwordHash },
    update: { passwordHash },
  })

  // Limpieza del usuario demo para que el seed sea repetible.
  await prisma.expense.deleteMany({ where: { userId: user.id } })
  await prisma.income.deleteMany({ where: { userId: user.id } })
  await prisma.balanceAdjustment.deleteMany({ where: { userId: user.id } })
  await prisma.cardPayment.deleteMany({ where: { userId: user.id } })
  await prisma.recurringBill.deleteMany({ where: { userId: user.id } })
  await prisma.savingsGoal.deleteMany({ where: { userId: user.id } })
  await prisma.account.deleteMany({ where: { userId: user.id } })
  await prisma.creditCard.deleteMany({ where: { userId: user.id } })
  await prisma.category.deleteMany({ where: { userId: user.id } })

  await prisma.category.createMany({
    data: DEFAULT_CATEGORIES.map((category) => ({
      userId: user.id,
      name: category.name,
      icon: category.icon,
      color: category.color,
      isSystem: category.name === 'Sin categorizar',
    })),
    skipDuplicates: true,
  })
  const categories = await prisma.category.findMany({ where: { userId: user.id } })
  const category = (name: string) => categories.find((item) => item.name === name)?.id ?? null

  const account = await prisma.account.create({
    data: {
      userId: user.id,
      name: 'Cuenta Itaú',
      kind: 'BANK',
      currency: 'UYU',
      openingBalance: fromCents(180_000_00),
      openingDate: dateValue(addMonthsISO(today, -2)),
    },
  })
  const usdAccount = await prisma.account.create({
    data: {
      userId: user.id,
      name: 'Caja dólares',
      kind: 'CASH',
      currency: 'USD',
      openingBalance: fromCents(500_00),
      openingDate: dateValue(addMonthsISO(today, -2)),
    },
  })

  await prisma.income.createMany({
    data: [
      {
        userId: user.id,
        description: 'Sueldo',
        amount: fromCents(95_000_00),
        currency: 'UYU',
        kind: 'FIXED',
        recurrence: 'MONTHLY',
        dayOfMonth: 5,
        startDate: dateValue(addMonthsISO(today, -6)),
        accountId: account.id,
      },
      {
        userId: user.id,
        description: 'Freelance',
        amount: fromCents(400_00),
        currency: 'USD',
        kind: 'VARIABLE',
        startDate: dateValue(today),
        accountId: usdAccount.id,
      },
    ],
  })

  const card = await prisma.creditCard.create({
    data: {
      userId: user.id,
      name: 'Itaú Visa',
      last4: '1842',
      currency: 'UYU',
      closingDay: 18,
      dueDay: 24,
    },
  })

  async function createCardPurchase(opts: {
    merchant: string
    totalCents: number
    date: string
    count: number
    categoryName: string
    paidUntil?: number
  }) {
    const firstPeriod = statementPeriodForPurchase(opts.date, card.closingDay, card.dueDay)
    const base = Math.trunc(opts.totalCents / opts.count)
    const remainder = opts.totalCents - base * opts.count
    const expense = await prisma.expense.create({
      data: {
        userId: user.id,
        date: dateValue(opts.date),
        merchant: opts.merchant,
        amount: fromCents(opts.totalCents),
        currency: 'UYU',
        categoryId: category(opts.categoryName),
        source: 'CREDIT_CARD',
        creditCardId: card.id,
        installments: opts.count,
        origin: 'MANUAL',
        status: 'CONFIRMED',
      },
    })
    for (let index = 0; index < opts.count; index += 1) {
      const [year, month] = firstPeriod.split('-').map(Number)
      const absolute = year * 12 + (month - 1) + index
      const period = `${Math.floor(absolute / 12)}-${String((absolute % 12) + 1).padStart(2, '0')}`
      const paid = index < (opts.paidUntil ?? 0)
      await prisma.cardInstallment.create({
        data: {
          expenseId: expense.id,
          cardId: card.id,
          number: index + 1,
          count: opts.count,
          amount: fromCents(index === opts.count - 1 ? base + remainder : base),
          currency: 'UYU',
          period,
          dueDate: dateValue(statementDueDate(period, card.dueDay)),
          isPaid: paid,
          paidAt: paid ? dateValue(statementDueDate(period, card.dueDay)) : null,
        },
      })
    }
  }

  await createCardPurchase({
    merchant: 'Laptop',
    totalCents: 42_900_00,
    date: addMonthsISO(today, -3),
    count: 10,
    categoryName: 'Compras',
    paidUntil: 3,
  })
  await createCardPurchase({
    merchant: 'Pasajes a Brasil',
    totalCents: 18_900_00,
    date: addMonthsISO(today, -1),
    count: 6,
    categoryName: 'Otras',
  })

  await prisma.expense.createMany({
    data: [
      {
        userId: user.id,
        date: dateValue(addMonthsISO(today, -1)),
        merchant: 'Alquiler',
        amount: fromCents(24_500_00),
        currency: 'UYU',
        categoryId: category('Casa'),
        source: 'ACCOUNT',
        accountId: account.id,
        origin: 'MANUAL',
        status: 'CONFIRMED',
      },
      {
        userId: user.id,
        date: dateValue(today),
        merchant: 'Supermercado Disco',
        amount: fromCents(3_200_00),
        currency: 'UYU',
        categoryId: category('Comida'),
        source: 'ACCOUNT',
        accountId: account.id,
        origin: 'MANUAL',
        status: 'CONFIRMED',
      },
      {
        userId: user.id,
        date: dateValue(today),
        merchant: 'Café Martínez',
        amount: fromCents(420_00),
        currency: 'UYU',
        categoryId: null,
        source: 'ACCOUNT',
        accountId: account.id,
        origin: 'EMAIL',
        status: 'NEEDS_REVIEW',
        gmailMessageId: 'demo-message-1',
        dedupeKey: `demo|${today}|420`,
      },
    ],
  })

  const billStart = dateValue(addMonthsISO(today, -6))
  await prisma.recurringBill.createMany({
    data: [
      {
        userId: user.id,
        name: 'UTE',
        categoryId: category('Cuentas'),
        amountType: 'RANGE',
        amountMin: fromCents(2_000_00),
        amountMax: fromCents(4_000_00),
        currency: 'UYU',
        frequency: 'MONTHLY',
        dueDay: 25,
        paymentSource: 'ACCOUNT',
        accountId: account.id,
        startDate: billStart,
      },
      {
        userId: user.id,
        name: 'Internet',
        categoryId: category('Cuentas'),
        amountType: 'FIXED',
        amountFixed: fromCents(1_800_00),
        currency: 'UYU',
        frequency: 'MONTHLY',
        dueDay: 10,
        paymentSource: 'ACCOUNT',
        accountId: account.id,
        startDate: billStart,
      },
      {
        userId: user.id,
        name: 'Netflix',
        categoryId: category('Cuentas'),
        amountType: 'FIXED',
        amountFixed: fromCents(390_00),
        currency: 'UYU',
        frequency: 'MONTHLY',
        dueDay: 20,
        paymentSource: 'CREDIT_CARD',
        creditCardId: card.id,
        startDate: billStart,
      },
    ],
  })

  await prisma.billOccurrence.create({
    data: {
      billId: (
        await prisma.recurringBill.findFirstOrThrow({ where: { userId: user.id, name: 'Internet' } })
      ).id,
      userId: user.id,
      period: addMonthsKey(current, -1),
      dueDate: dateValue(dateInMonth(addMonthsKey(current, -1), 10)),
      amountActual: fromCents(1_800_00),
      currency: 'UYU',
      status: 'PAID',
      paidAt: dateValue(dateInMonth(addMonthsKey(current, -1), 10)),
      accountId: account.id,
    },
  })

  await prisma.savingsGoal.create({
    data: {
      userId: user.id,
      name: 'Viaje a Japón',
      currency: 'UYU',
      targetAmount: fromCents(220_000_00),
      targetDate: dateValue(addMonthsISO(today, 10)),
      monthlyTarget: fromCents(15_000_00),
      priority: 1,
      contributions: {
        create: {
          userId: user.id,
          amount: fromCents(30_000_00),
          currency: 'UYU',
          date: dateValue(addMonthsISO(today, -1)),
          accountId: account.id,
          note: 'Ahorro inicial',
        },
      },
    },
  })
  await prisma.savingsGoal.create({
    data: {
      userId: user.id,
      name: 'Fondo de emergencia',
      currency: 'UYU',
      targetAmount: fromCents(120_000_00),
      targetDate: dateValue(addMonthsISO(today, 4)),
      monthlyTarget: fromCents(10_000_00),
      priority: 2,
    },
  })

  console.log(`Datos demo listos para ${email} (contraseña: demo-gastos-2025)`)
  console.log(`Hoy: ${today} · mes actual: ${current}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
