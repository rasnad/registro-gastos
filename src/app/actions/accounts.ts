'use server'

import 'server-only'
import { prisma } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { fromCents } from '@/lib/money'
import { revalidateFinance } from '@/lib/revalidate'
import { bool, cents, currency, dateValue, dayOfMonth, int, isoDate, optStr, str } from '@/lib/validation'
import type { ActionState } from '@/lib/action-state'

const ACCOUNT_KINDS = ['BANK', 'CASH', 'WALLET'] as const

export async function createAccount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  const name = str(formData, 'name')
  const kind = str(formData, 'kind')
  const cur = currency(formData, 'currency')
  const openingCents = cents(formData, 'openingBalance')
  const openingDate = isoDate(formData, 'openingDate') ?? new Date().toISOString().slice(0, 10)

  if (!name) return { error: 'Ponele un nombre a la cuenta.' }
  if (!cur) return { error: 'Elegí la moneda.' }
  if (!(ACCOUNT_KINDS as readonly string[]).includes(kind)) return { error: 'Elegí el tipo de cuenta.' }
  if (openingCents === null) return { error: 'El saldo inicial no es válido.' }

  await prisma.account.create({
    data: {
      userId: user.id,
      name,
      kind: kind as (typeof ACCOUNT_KINDS)[number],
      currency: cur,
      openingBalance: fromCents(openingCents),
      openingDate: dateValue(openingDate),
    },
  })
  revalidateFinance()
  return { ok: true }
}

export async function updateAccount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  const id = str(formData, 'id')
  const account = await prisma.account.findFirst({ where: { id, userId: user.id } })
  if (!account) return { error: 'La cuenta no existe.' }

  const name = str(formData, 'name')
  const openingCents = cents(formData, 'openingBalance')
  const openingDate = isoDate(formData, 'openingDate')
  if (!name) return { error: 'Ponele un nombre a la cuenta.' }
  if (openingCents === null) return { error: 'El saldo inicial no es válido.' }
  if (!openingDate) return { error: 'La fecha de saldo inicial no es válida.' }

  await prisma.account.update({
    where: { id: account.id },
    data: {
      name,
      openingBalance: fromCents(openingCents),
      openingDate: dateValue(openingDate),
      isActive: bool(formData, 'isActive'),
    },
  })
  revalidateFinance()
  return { ok: true }
}

export async function createAdjustment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  const accountId = str(formData, 'accountId')
  const account = await prisma.account.findFirst({ where: { id: accountId, userId: user.id } })
  if (!account) return { error: 'Elegí una cuenta válida.' }

  const delta = cents(formData, 'amount')
  const date = isoDate(formData, 'date')
  const reason = str(formData, 'reason')
  if (delta === null || delta === 0) return { error: 'El ajuste no puede ser cero.' }
  if (!date) return { error: 'La fecha no es válida.' }
  if (!reason) return { error: 'Escribí el motivo del ajuste: queda registrado.' }

  await prisma.balanceAdjustment.create({
    data: {
      userId: user.id,
      accountId: account.id,
      amountDelta: fromCents(delta),
      currency: account.currency,
      date: dateValue(date),
      reason,
    },
  })
  revalidateFinance()
  return { ok: true }
}

export async function deleteAdjustment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  const id = str(formData, 'id')
  const result = await prisma.balanceAdjustment.deleteMany({ where: { id, userId: user.id } })
  if (result.count === 0) return { error: 'El ajuste no existe.' }
  revalidateFinance()
  return { ok: true }
}

export async function createIncome(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  const description = str(formData, 'description')
  const amountCents = cents(formData, 'amount')
  const cur = currency(formData, 'currency')
  const kind = str(formData, 'kind')
  const recurrence = optStr(formData, 'recurrence')
  const startDate = isoDate(formData, 'startDate')
  const endDate = isoDate(formData, 'endDate')
  const accountId = optStr(formData, 'accountId')

  if (!description) return { error: 'Describí el ingreso.' }
  if (amountCents === null || amountCents <= 0) return { error: 'El importe debe ser mayor a cero.' }
  if (!cur) return { error: 'Elegí la moneda.' }
  if (kind !== 'FIXED' && kind !== 'VARIABLE') return { error: 'Elegí el tipo de ingreso.' }
  if (!startDate) return { error: 'La fecha de inicio no es válida.' }

  if (accountId) {
    const account = await prisma.account.findFirst({ where: { id: accountId, userId: user.id } })
    if (!account) return { error: 'La cuenta no existe.' }
    if (account.currency !== cur) return { error: `La cuenta es en ${account.currency}.` }
  }

  await prisma.income.create({
    data: {
      userId: user.id,
      description,
      amount: fromCents(amountCents),
      currency: cur,
      kind: kind as 'FIXED' | 'VARIABLE',
      recurrence: recurrence as 'MONTHLY' | 'BIMONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL' | null,
      dayOfMonth: recurrence ? dayOfMonth(formData, 'dayOfMonth', Number(startDate.slice(8, 10))) : null,
      startDate: dateValue(startDate),
      endDate: endDate ? dateValue(endDate) : null,
      accountId,
    },
  })
  revalidateFinance()
  return { ok: true }
}

export async function updateIncome(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  const id = str(formData, 'id')
  const income = await prisma.income.findFirst({ where: { id, userId: user.id } })
  if (!income) return { error: 'El ingreso no existe.' }

  const description = str(formData, 'description')
  const amountCents = cents(formData, 'amount')
  const startDate = isoDate(formData, 'startDate')
  const isActive = bool(formData, 'isActive')
  if (!description) return { error: 'Describí el ingreso.' }
  if (amountCents === null || amountCents <= 0) return { error: 'El importe debe ser mayor a cero.' }
  if (!startDate) return { error: 'La fecha de inicio no es válida.' }

  await prisma.income.update({
    where: { id: income.id },
    data: {
      description,
      amount: fromCents(amountCents),
      startDate: dateValue(startDate),
      isActive,
    },
  })
  revalidateFinance()
  return { ok: true }
}

export async function deleteIncome(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  const id = str(formData, 'id')
  const result = await prisma.income.deleteMany({ where: { id, userId: user.id } })
  if (result.count === 0) return { error: 'El ingreso no existe.' }
  revalidateFinance()
  return { ok: true }
}

export async function toggleIncome(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  const id = str(formData, 'id')
  const income = await prisma.income.findFirst({ where: { id, userId: user.id } })
  if (!income) return { error: 'El ingreso no existe.' }
  await prisma.income.update({ where: { id }, data: { isActive: !income.isActive } })
  revalidateFinance()
  return { ok: true }
}

/** Marca o quita la cuenta predeterminada (una sola por usuario). */
export async function toggleDefaultAccount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  const id = str(formData, 'id')
  const account = await prisma.account.findFirst({ where: { id, userId: user.id } })
  if (!account) return { error: 'La cuenta no existe.' }

  const next = !account.isDefault
  await prisma.$transaction(async (tx) => {
    if (next) {
      await tx.account.updateMany({ where: { userId: user.id }, data: { isDefault: false } })
    }
    await tx.account.update({ where: { id: account.id }, data: { isDefault: next } })
  })
  revalidateFinance()
  return {
    ok: true,
    message: next ? 'Cuenta predeterminada guardada.' : 'Se quitó la cuenta predeterminada.',
  }
}

/** Marca el punto de partida explícito de una cuenta (evita descontar dos veces). */
export async function resetOpeningBalance(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  const id = str(formData, 'id')
  const balanceCents = cents(formData, 'balance')
  const date = isoDate(formData, 'date') ?? new Date().toISOString().slice(0, 10)
  if (balanceCents === null) return { error: 'El saldo no es válido.' }
  const account = await prisma.account.findFirst({ where: { id, userId: user.id } })
  if (!account) return { error: 'La cuenta no existe.' }
  await prisma.account.update({
    where: { id: account.id },
    data: { openingBalance: fromCents(balanceCents), openingDate: dateValue(date) },
  })
  revalidateFinance()
  return { ok: true }
}

export async function createCreditCard(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  const name = str(formData, 'name')
  const closingDay = int(formData, 'closingDay', 0)
  const dueDay = int(formData, 'dueDay', 0)
  const last4 = optStr(formData, 'last4')

  if (!name) return { error: 'Ponele un nombre a la tarjeta.' }
  if (closingDay < 1 || closingDay > 31) return { error: 'La fecha de cierre debe estar entre 1 y 31.' }
  if (dueDay < 1 || dueDay > 31) return { error: 'La fecha de vencimiento debe estar entre 1 y 31.' }
  if (last4 && !/^\d{4}$/.test(last4)) return { error: 'Los últimos 4 dígitos deben ser numéricos.' }

  await prisma.creditCard.create({
    data: {
      userId: user.id,
      name,
      closingDay,
      dueDay,
      last4,
      notes: optStr(formData, 'notes'),
    },
  })
  revalidateFinance()
  return { ok: true }
}

export async function updateCreditCard(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  const id = str(formData, 'id')
  const card = await prisma.creditCard.findFirst({ where: { id, userId: user.id } })
  if (!card) return { error: 'La tarjeta no existe.' }

  const closingDay = int(formData, 'closingDay', card.closingDay)
  const dueDay = int(formData, 'dueDay', card.dueDay)
  if (closingDay < 1 || closingDay > 31 || dueDay < 1 || dueDay > 31) {
    return { error: 'Las fechas de cierre y vencimiento deben estar entre 1 y 31.' }
  }

  await prisma.creditCard.update({
    where: { id: card.id },
    data: {
      name: str(formData, 'name') || card.name,
      closingDay,
      dueDay,
      last4: optStr(formData, 'last4'),
      notes: optStr(formData, 'notes'),
      isActive: bool(formData, 'isActive'),
    },
  })
  revalidateFinance()
  return { ok: true }
}
