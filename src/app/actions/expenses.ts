'use server'

import 'server-only'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { fromCents, splitInstallments } from '@/lib/money'
import {
  statementDueDate,
  statementPeriodForPurchase,
} from '@/lib/period'
import { buildDedupeKey, normalizeMerchant } from '@/lib/finance/dedupe'
import { bool, cents, currency, dateValue, int, isoDate, optStr, str } from '@/lib/validation'
import type { ActionState } from '@/lib/action-state'

function revalidateAll() {
  for (const path of ['/', '/movimientos', '/tarjetas', '/proyeccion', '/ahorro', '/cuentas']) {
    revalidatePath(path)
  }
  revalidatePath('/ajustes')
  revalidatePath('/', 'layout')
}

async function ownedAccount(userId: string, id: string | null) {
  if (!id) return null
  return prisma.account.findFirst({ where: { id, userId } })
}

async function ownedCard(userId: string, id: string | null) {
  if (!id) return null
  return prisma.creditCard.findFirst({ where: { id, userId } })
}

async function ownedCategory(userId: string, id: string | null) {
  if (!id) return null
  return prisma.category.findFirst({ where: { id, userId } })
}

type ExpenseInput = {
  merchant: string
  description: string | null
  amountCents: number
  currency: 'UYU' | 'USD'
  date: string
  categoryId: string | null
  source: 'ACCOUNT' | 'CREDIT_CARD'
  accountId: string | null
  creditCardId: string | null
  installments: number
  notes: string | null
  saveRule: boolean
}

async function parseExpenseForm(formData: FormData): Promise<{ data?: ExpenseInput; error?: string }> {
  const merchant = str(formData, 'merchant')
  const amountCents = cents(formData, 'amount')
  const cur = currency(formData, 'currency')
  const date = isoDate(formData, 'date')
  const source = str(formData, 'source')
  const accountId = optStr(formData, 'accountId')
  const creditCardId = optStr(formData, 'creditCardId')
  const installments = Math.min(60, Math.max(1, int(formData, 'installments', 1)))

  if (!merchant) return { error: 'Indicá el comercio o una descripción.' }
  if (amountCents === null || amountCents <= 0) return { error: 'El importe tiene que ser mayor a cero.' }
  if (!cur) return { error: 'Elegí la moneda.' }
  if (!date) return { error: 'La fecha no es válida.' }
  if (source !== 'ACCOUNT' && source !== 'CREDIT_CARD') return { error: 'Elegí un medio de pago.' }
  if (source === 'ACCOUNT' && !accountId) return { error: 'Elegí la cuenta o billetera de donde sale el dinero.' }
  if (source === 'CREDIT_CARD' && !creditCardId) return { error: 'Elegí la tarjeta.' }

  return {
    data: {
      merchant,
      description: optStr(formData, 'description'),
      amountCents,
      currency: cur,
      date,
      categoryId: optStr(formData, 'categoryId'),
      source,
      accountId: source === 'ACCOUNT' ? accountId : null,
      creditCardId: source === 'CREDIT_CARD' ? creditCardId : null,
      installments,
      notes: optStr(formData, 'notes'),
      saveRule: bool(formData, 'saveRule'),
    },
  }
}

export async function createExpense(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  const parsed = await parseExpenseForm(formData)
  if (parsed.error || !parsed.data) return { error: parsed.error }
  const input = parsed.data

  const account = await ownedAccount(user.id, input.accountId)
  if (input.source === 'ACCOUNT' && !account) return { error: 'La cuenta seleccionada no existe.' }
  if (input.source === 'ACCOUNT' && account && account.currency !== input.currency) {
    return { error: `La cuenta "${account.name}" es en ${account.currency}. Elegí una cuenta en ${input.currency} o cambiá la moneda.` }
  }

  const card = await ownedCard(user.id, input.creditCardId)
  if (input.source === 'CREDIT_CARD' && !card) return { error: 'La tarjeta seleccionada no existe.' }

  const category = await ownedCategory(user.id, input.categoryId)
  if (input.categoryId && !category) return { error: 'La categoría seleccionada no existe.' }

  const gmailMessageId = optStr(formData, 'gmailMessageId')
  const gmailMessage = gmailMessageId
    ? await prisma.processedGmailMessage.findFirst({
        where: { messageId: gmailMessageId, connection: { userId: user.id } },
        select: { id: true, expenseId: true },
      })
    : null
  if (gmailMessageId && !gmailMessage) return { error: 'El correo indicado no pertenece a tu cuenta.' }

  const dedupeKey = buildDedupeKey({
    date: input.date,
    amountCents: input.amountCents,
    merchant: input.merchant,
    currency: input.currency,
    source: input.source,
    accountId: input.accountId,
    creditCardId: input.creditCardId,
    installments: input.installments,
  })

  try {
    await prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          userId: user.id,
          date: dateValue(input.date),
          merchant: input.merchant,
          description: input.description,
          amount: fromCents(input.amountCents),
          currency: input.currency,
          categoryId: input.categoryId,
          source: input.source,
          accountId: input.accountId,
          creditCardId: input.creditCardId,
          installments: input.installments,
          notes: input.notes,
          origin: gmailMessage ? 'EMAIL' : 'MANUAL',
          status: 'CONFIRMED',
          gmailMessageId: gmailMessage ? gmailMessageId : null,
          dedupeKey,
        },
      })

      if (input.source === 'CREDIT_CARD' && card) {
        const firstPeriod = statementPeriodForPurchase(input.date, card.closingDay, card.dueDay)
        const parts = splitInstallments(input.amountCents, input.installments)
        await tx.cardInstallment.createMany({
          data: parts.map((part, index) => {
            const [year, month] = firstPeriod.split('-').map(Number)
            const absolute = year * 12 + (month - 1) + index
            const period = `${Math.floor(absolute / 12)}-${String((absolute % 12) + 1).padStart(2, '0')}`
            return {
              expenseId: expense.id,
              cardId: card.id,
              number: index + 1,
              count: input.installments,
              amount: fromCents(part),
              currency: input.currency,
              period,
              dueDate: dateValue(statementDueDate(period, card.dueDay)),
              isEstimated: false,
            }
          }),
        })
      }

      if (input.saveRule && input.categoryId) {
        await tx.merchantRule.upsert({
          where: { userId_pattern: { userId: user.id, pattern: normalizeMerchant(input.merchant) } },
          create: {
            userId: user.id,
            pattern: normalizeMerchant(input.merchant),
            categoryId: input.categoryId,
          },
          update: { categoryId: input.categoryId, hits: { increment: 1 } },
        })
      }

      if (gmailMessage) {
        await tx.processedGmailMessage.update({
          where: { id: gmailMessage.id },
          data: { status: 'IMPORTED', expenseId: expense.id, reason: null },
        })
      }
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'No se pudo guardar el movimiento.' }
  }

  revalidateAll()
  return { ok: true }
}

export async function updateExpense(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  const id = str(formData, 'id')
  const existing = await prisma.expense.findFirst({
    where: { id, userId: user.id },
    include: { installmentsList: true },
  })
  if (!existing) return { error: 'El movimiento no existe.' }

  const parsed = await parseExpenseForm(formData)
  if (parsed.error || !parsed.data) return { error: parsed.error }
  const input = parsed.data

  const card = await ownedCard(user.id, input.creditCardId)
  const account = await ownedAccount(user.id, input.accountId)
  if (input.source === 'ACCOUNT' && !account) return { error: 'La cuenta seleccionada no existe.' }
  if (input.source === 'CREDIT_CARD' && !card) return { error: 'La tarjeta seleccionada no existe.' }
  if (input.categoryId && !(await ownedCategory(user.id, input.categoryId))) {
    return { error: 'La categoría seleccionada no existe.' }
  }

  const hasPaidInstallments = existing.installmentsList.some((item) => item.isPaid)
  const changesMoney =
    input.amountCents !== Math.round(Number(existing.amount) * 100) ||
    input.installments !== existing.installments ||
    input.date !== existing.date.toISOString().slice(0, 10) ||
    input.source !== existing.source ||
    input.creditCardId !== existing.creditCardId

  if (hasPaidInstallments && changesMoney) {
    return {
      error:
        'Esta compra ya tiene cuotas pagadas. Corregí las cuotas individuales desde Tarjetas en lugar de cambiar el importe total.',
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (changesMoney) {
        await tx.cardInstallment.deleteMany({ where: { expenseId: existing.id } })
      }

      const dedupeKey = buildDedupeKey({
        date: input.date,
        amountCents: input.amountCents,
        merchant: input.merchant,
        currency: input.currency,
        source: input.source,
        accountId: input.accountId,
        creditCardId: input.creditCardId,
        installments: input.installments,
      })

      await tx.expense.update({
        where: { id: existing.id },
        data: {
          date: dateValue(input.date),
          merchant: input.merchant,
          description: input.description,
          amount: fromCents(input.amountCents),
          currency: input.currency,
          categoryId: input.categoryId,
          source: input.source,
          accountId: input.accountId,
          creditCardId: input.creditCardId,
          installments: input.installments,
          notes: input.notes,
          dedupeKey,
        },
      })

      if (changesMoney && input.source === 'CREDIT_CARD' && card) {
        const firstPeriod = statementPeriodForPurchase(input.date, card.closingDay, card.dueDay)
        const parts = splitInstallments(input.amountCents, input.installments)
        await tx.cardInstallment.createMany({
          data: parts.map((part, index) => {
            const [year, month] = firstPeriod.split('-').map(Number)
            const absolute = year * 12 + (month - 1) + index
            const period = `${Math.floor(absolute / 12)}-${String((absolute % 12) + 1).padStart(2, '0')}`
            return {
              expenseId: existing.id,
              cardId: card.id,
              number: index + 1,
              count: input.installments,
              amount: fromCents(part),
              currency: input.currency,
              period,
              dueDate: dateValue(statementDueDate(period, card.dueDay)),
              isEstimated: false,
            }
          }),
        })
      }

      if (input.saveRule && input.categoryId) {
        await tx.merchantRule.upsert({
          where: { userId_pattern: { userId: user.id, pattern: normalizeMerchant(input.merchant) } },
          create: {
            userId: user.id,
            pattern: normalizeMerchant(input.merchant),
            categoryId: input.categoryId,
          },
          update: { categoryId: input.categoryId, hits: { increment: 1 } },
        })
      }
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'No se pudo actualizar el movimiento.' }
  }

  revalidateAll()
  return { ok: true }
}

export async function setExpenseStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  const id = str(formData, 'id')
  const status = str(formData, 'status')
  if (!['CONFIRMED', 'NEEDS_REVIEW', 'DISCARDED'].includes(status)) {
    return { error: 'Estado inválido.' }
  }
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.expense.updateMany({
      where: { id, userId: user.id },
      data: { status: status as 'CONFIRMED' | 'NEEDS_REVIEW' | 'DISCARDED' },
    })
    if (updated.count > 0 && status !== 'NEEDS_REVIEW') {
      await tx.processedGmailMessage.updateMany({
        where: { expenseId: id, connection: { userId: user.id }, status: 'NEEDS_REVIEW' },
        data: { status: status === 'CONFIRMED' ? 'IMPORTED' : 'SKIPPED_IRRELEVANT', reason: null },
      })
    }
    return updated
  })
  if (result.count === 0) return { error: 'El movimiento no existe.' }
  revalidateAll()
  return { ok: true }
}

export async function deleteExpense(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  const id = str(formData, 'id')
  const result = await prisma.expense.deleteMany({ where: { id, userId: user.id } })
  if (result.count === 0) return { error: 'El movimiento no existe.' }
  revalidateAll()
  return { ok: true }
}

export async function updateInstallment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  const id = str(formData, 'id')
  const installment = await prisma.cardInstallment.findFirst({
    where: { id, expense: { userId: user.id } },
  })
  if (!installment) return { error: 'La cuota no existe.' }

  const amountCents = cents(formData, 'amount')
  const period = str(formData, 'period')
  const isPaid = bool(formData, 'isPaid')
  if (amountCents === null || amountCents <= 0) return { error: 'El importe de la cuota no es válido.' }
  if (!/^\d{4}-\d{2}$/.test(period)) return { error: 'El período debe tener formato AAAA-MM.' }

  await prisma.cardInstallment.update({
    where: { id: installment.id },
    data: {
      amount: fromCents(amountCents),
      period,
      isPaid,
      paidAt: isPaid ? dateValue(str(formData, 'paidAt') || new Date().toISOString().slice(0, 10)) : null,
      isEstimated: false,
    },
  })
  revalidateAll()
  return { ok: true }
}

/** Recuerda la categoría de un comercio para futuros gastos. */
export async function rememberMerchantRule(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  const expenseId = str(formData, 'expenseId')
  const expense = await prisma.expense.findFirst({ where: { id: expenseId, userId: user.id } })
  if (!expense) return { error: 'El movimiento no existe.' }
  if (!expense.categoryId) return { error: 'Primero asigná una categoría.' }

  await prisma.merchantRule.upsert({
    where: { userId_pattern: { userId: user.id, pattern: normalizeMerchant(expense.merchant) } },
    create: {
      userId: user.id,
      pattern: normalizeMerchant(expense.merchant),
      categoryId: expense.categoryId,
    },
    update: { categoryId: expense.categoryId, hits: { increment: 1 } },
  })
  revalidateAll()
  return { ok: true, message: `Se recordó "${expense.merchant}" para próximos gastos.` }
}
