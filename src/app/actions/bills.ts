'use server'

import 'server-only'
import { prisma } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { fromCents } from '@/lib/money'
import { revalidateFinance } from '@/lib/revalidate'
import { bool, cents, currency, dateValue, dayOfMonth, int, isoDate, monthKey, monthOrDate, optStr, str } from '@/lib/validation'
import type { ActionState } from '@/lib/action-state'

const AMOUNT_TYPES = ['FIXED', 'RANGE'] as const
const FREQUENCIES = ['MONTHLY', 'BIMONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'] as const

type ParsedBill = {
  name: string
  categoryId: string | null
  amountType: 'FIXED' | 'RANGE'
  amountFixedCents: number | null
  amountMinCents: number | null
  amountMaxCents: number | null
  sharePercent: number
  currency: 'UYU' | 'USD'
  frequency: (typeof FREQUENCIES)[number]
  dueDay: number
  paymentSource: 'ACCOUNT' | 'CREDIT_CARD'
  accountId: string | null
  creditCardId: string | null
  startDate: string
  endDate: string | null
  isActive: boolean
}

async function parseBill(formData: FormData, userId: string): Promise<{ data?: ParsedBill; error?: string }> {
  const name = str(formData, 'name')
  const cur = currency(formData, 'currency')
  const amountType = str(formData, 'amountType')
  const frequency = str(formData, 'frequency') || 'MONTHLY'
  const paymentSource = str(formData, 'paymentSource') || 'ACCOUNT'
  // El formulario manda AAAA-MM ("primer mes de pago"); también acepta fecha completa.
  const startDate = monthOrDate(str(formData, 'startDate'), 'first')
  const endDateRaw = str(formData, 'endDate')
  const endDate = endDateRaw ? monthOrDate(endDateRaw, 'last') : null
  const sharePercent = int(formData, 'sharePercent', 100)
  if (sharePercent < 1 || sharePercent > 100) {
    return { error: 'El porcentaje debe estar entre 1 y 100.' }
  }

  if (!name) return { error: 'Ponele un nombre a la cuenta.' }
  if (!cur) return { error: 'Elegí la moneda.' }
  if (!(AMOUNT_TYPES as readonly string[]).includes(amountType)) return { error: 'Elegí importe fijo o rango.' }
  if (!(FREQUENCIES as readonly string[]).includes(frequency)) return { error: 'Frecuencia inválida.' }
  if (!startDate) return { error: 'La fecha de inicio no es válida.' }
  if (endDate && endDate < startDate) return { error: 'La fecha de fin no puede ser anterior al inicio.' }

  let amountFixedCents: number | null = null
  let amountMinCents: number | null = null
  let amountMaxCents: number | null = null

  if (amountType === 'FIXED') {
    amountFixedCents = cents(formData, 'amountFixed')
    if (amountFixedCents === null || amountFixedCents <= 0) {
      return { error: 'Ingresá el importe fijo de la cuenta.' }
    }
  } else {
    amountMinCents = cents(formData, 'amountMin')
    amountMaxCents = cents(formData, 'amountMax')
    if (amountMinCents === null || amountMaxCents === null) return { error: 'Ingresá el rango mínimo y máximo.' }
    if (amountMinCents > amountMaxCents) return { error: 'El mínimo no puede ser mayor que el máximo.' }
  }

  const categoryId = optStr(formData, 'categoryId')
  if (categoryId) {
    const category = await prisma.category.findFirst({ where: { id: categoryId, userId } })
    if (!category) return { error: 'La categoría no existe.' }
  }

  let accountId: string | null = null
  let creditCardId: string | null = null

  if (paymentSource === 'CREDIT_CARD') {
    creditCardId = optStr(formData, 'creditCardId')
    const card = creditCardId
      ? await prisma.creditCard.findFirst({ where: { id: creditCardId, userId } })
      : null
    if (!card) return { error: 'Elegí la tarjeta con la que se paga.' }
  } else if (paymentSource === 'ACCOUNT') {
    accountId = optStr(formData, 'accountId')
    const account = accountId ? await prisma.account.findFirst({ where: { id: accountId, userId } }) : null
    if (!account) return { error: 'Elegí la cuenta desde donde se paga.' }
    if (account.currency !== cur) return { error: `La cuenta es en ${account.currency}.` }
  } else {
    return { error: 'Elegí el medio de pago.' }
  }

  return {
    data: {
      name,
      categoryId,
      amountType: amountType as 'FIXED' | 'RANGE',
      amountFixedCents,
      amountMinCents,
      amountMaxCents,
      sharePercent,
      currency: cur,
      frequency: frequency as (typeof FREQUENCIES)[number],
      dueDay: dayOfMonth(formData, 'dueDay', 1),
      paymentSource: paymentSource as 'ACCOUNT' | 'CREDIT_CARD',
      accountId,
      creditCardId,
      startDate,
      endDate,
      isActive: formData.has('isActive') ? bool(formData, 'isActive') : true,
    },
  }
}

export async function createBill(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  const parsed = await parseBill(formData, user.id)
  if (parsed.error || !parsed.data) return { error: parsed.error }
  const bill = parsed.data

  await prisma.recurringBill.create({
    data: {
      userId: user.id,
      name: bill.name,
      categoryId: bill.categoryId,
      amountType: bill.amountType,
      amountFixed: bill.amountFixedCents === null ? null : fromCents(bill.amountFixedCents),
      amountMin: bill.amountMinCents === null ? null : fromCents(bill.amountMinCents),
      amountMax: bill.amountMaxCents === null ? null : fromCents(bill.amountMaxCents),
      sharePercent: bill.sharePercent,
      currency: bill.currency,
      frequency: bill.frequency,
      dueDay: bill.dueDay,
      paymentSource: bill.paymentSource,
      accountId: bill.accountId,
      creditCardId: bill.creditCardId,
      startDate: dateValue(bill.startDate),
      endDate: bill.endDate ? dateValue(bill.endDate) : null,
      isActive: bill.isActive,
      notes: optStr(formData, 'notes'),
    },
  })
  revalidateFinance()
  return { ok: true }
}

export async function updateBill(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  const id = str(formData, 'id')
  const existing = await prisma.recurringBill.findFirst({ where: { id, userId: user.id } })
  if (!existing) return { error: 'La cuenta no existe.' }

  const parsed = await parseBill(formData, user.id)
  if (parsed.error || !parsed.data) return { error: parsed.error }
  const bill = parsed.data

  await prisma.recurringBill.update({
    where: { id: existing.id },
    data: {
      name: bill.name,
      categoryId: bill.categoryId,
      amountType: bill.amountType,
      amountFixed: bill.amountFixedCents === null ? null : fromCents(bill.amountFixedCents),
      amountMin: bill.amountMinCents === null ? null : fromCents(bill.amountMinCents),
      amountMax: bill.amountMaxCents === null ? null : fromCents(bill.amountMaxCents),
      sharePercent: bill.sharePercent,
      currency: bill.currency,
      frequency: bill.frequency,
      dueDay: bill.dueDay,
      paymentSource: bill.paymentSource,
      accountId: bill.accountId,
      creditCardId: bill.creditCardId,
      startDate: dateValue(bill.startDate),
      endDate: bill.endDate ? dateValue(bill.endDate) : null,
      isActive: bill.isActive,
      notes: optStr(formData, 'notes'),
    },
  })
  revalidateFinance()
  return { ok: true }
}

export async function deleteBill(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  const id = str(formData, 'id')
  const result = await prisma.recurringBill.deleteMany({ where: { id, userId: user.id } })
  if (result.count === 0) return { error: 'La cuenta no existe.' }
  revalidateFinance()
  return { ok: true }
}

export async function payBillOccurrence(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  const billId = str(formData, 'billId')
  const bill = await prisma.recurringBill.findFirst({ where: { id: billId, userId: user.id } })
  if (!bill) return { error: 'La cuenta no existe.' }

  const period = monthKey(formData, 'period')
  const amountCents = cents(formData, 'amountActual')
  const paidAt = isoDate(formData, 'paidAt')
  const accountId = optStr(formData, 'accountId')
  if (!period) return { error: 'Período inválido.' }
  if (amountCents === null || amountCents <= 0) return { error: 'Ingresá el importe real pagado.' }
  if (!paidAt) return { error: 'La fecha de pago no es válida.' }

  if (bill.paymentSource === 'ACCOUNT') {
    if (!accountId) return { error: 'Elegí la cuenta desde la que pagaste.' }
    const account = await prisma.account.findFirst({ where: { id: accountId, userId: user.id } })
    if (!account) return { error: 'La cuenta no existe.' }
    if (account.currency !== bill.currency) return { error: `La cuenta es en ${account.currency}.` }
  }

  await prisma.billOccurrence.upsert({
    where: { billId_period: { billId: bill.id, period } },
    create: {
      billId: bill.id,
      userId: user.id,
      period,
      dueDate: dateValue(`${period}-${String(Math.min(bill.dueDay, 28)).padStart(2, '0')}`),
      amountActual: fromCents(amountCents),
      amountMin: bill.amountMin,
      amountMax: bill.amountMax,
      currency: bill.currency,
      status: 'PAID',
      paidAt: dateValue(paidAt),
      accountId: bill.paymentSource === 'ACCOUNT' ? accountId : null,
    },
    update: {
      amountActual: fromCents(amountCents),
      status: 'PAID',
      paidAt: dateValue(paidAt),
      accountId: bill.paymentSource === 'ACCOUNT' ? accountId : null,
    },
  })
  revalidateFinance()
  return { ok: true }
}

export async function unpayBillOccurrence(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  const billId = str(formData, 'billId')
  const period = monthKey(formData, 'period')
  if (!period) return { error: 'Período inválido.' }
  await prisma.billOccurrence.deleteMany({ where: { billId, period, userId: user.id } })
  revalidateFinance()
  return { ok: true }
}

/** Revierte solo el pago histórico; conserva la obligación y su importe real. */
export async function deleteLegacyBillPayment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  const id = str(formData, 'id')
  if (!id) return { error: 'El pago no existe.' }
  const result = await prisma.billOccurrence.updateMany({
    where: { id, userId: user.id, status: 'PAID', paidAt: { not: null }, bill: { userId: user.id, paymentSource: 'ACCOUNT' } },
    data: { status: 'PENDING', paidAt: null, accountId: null },
  })
  if (!result.count) return { error: 'El pago no existe o ya fue eliminado.' }
  revalidateFinance()
  return { ok: true }
}

export async function setBillActualAmount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  const billId = str(formData, 'billId')
  const bill = await prisma.recurringBill.findFirst({ where: { id: billId, userId: user.id } })
  if (!bill) return { error: 'La cuenta no existe.' }
  const period = monthKey(formData, 'period')
  const amountCents = cents(formData, 'amountActual')
  if (!period) return { error: 'Período inválido.' }
  if (amountCents === null || amountCents <= 0) return { error: 'Importe inválido.' }

  await prisma.billOccurrence.upsert({
    where: { billId_period: { billId: bill.id, period } },
    create: {
      billId: bill.id,
      userId: user.id,
      period,
      dueDate: dateValue(`${period}-${String(Math.min(bill.dueDay, 28)).padStart(2, '0')}`),
      amountActual: fromCents(amountCents),
      currency: bill.currency,
      status: 'PENDING',
    },
    update: { amountActual: fromCents(amountCents) },
  })
  revalidateFinance()
  return { ok: true }
}
