
import 'server-only'
import { prisma } from '@/lib/db'
import type { CurrentUser } from '@/lib/auth'
import { convertUsdToUyu, fromCents } from '@/lib/money'
import { revalidateFinance } from '@/lib/revalidate'
import { cents, currency, dateValue, isoDate, monthKey, optStr, str } from '@/lib/validation'
import type { ActionState } from '@/lib/action-state'

export async function registerCardPayment(user: CurrentUser, formData: FormData): Promise<ActionState> {
  const creditCardId = str(formData, 'creditCardId')
  const card = await prisma.creditCard.findFirst({ where: { id: creditCardId, userId: user.id } })
  if (!card) return { error: 'La tarjeta no existe.' }

  const period = monthKey(formData, 'period')
  const amountCents = cents(formData, 'amount')
  const paidAt = isoDate(formData, 'paidAt')
  const accountId = optStr(formData, 'accountId')
  const payCurrency = currency(formData, 'currency') ?? 'UYU'

  if (!period) return { error: 'Indicá el resumen que estás pagando (AAAA-MM).' }
  if (amountCents === null || amountCents <= 0) return { error: 'El importe del pago no es válido.' }
  if (!paidAt) return { error: 'La fecha de pago no es válida.' }

  let accountAmountCents: number | null = null
  let exchangeRate: number | null = null

  if (accountId) {
    const account = await prisma.account.findFirst({ where: { id: accountId, userId: user.id } })
    if (!account) return { error: 'La cuenta no existe.' }

    if (account.currency === payCurrency) {
      accountAmountCents = amountCents
    } else if (account.currency === 'UYU' && payCurrency === 'USD') {
      // Los consumos en dólares se pagan desde la cuenta en pesos a la
      // cotización configurada (por defecto 41,00).
      const rate = await prisma.user.findUnique({
        where: { id: user.id },
        select: { usdRateCents: true },
      })
      const rateCents = rate?.usdRateCents ?? 4100
      accountAmountCents = convertUsdToUyu(amountCents, rateCents)
      exchangeRate = rateCents
    } else {
      return {
        error: `No se puede pagar ${payCurrency} desde una cuenta en ${account.currency}.`,
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.cardPayment.upsert({
      where: { creditCardId_period_currency: { creditCardId: card.id, period, currency: payCurrency } },
      create: {
        userId: user.id,
        creditCardId: card.id,
        period,
        amount: fromCents(amountCents),
        currency: payCurrency,
        accountAmount: accountAmountCents === null ? null : fromCents(accountAmountCents),
        exchangeRate,
        paidAt: dateValue(paidAt),
        accountId,
        note: optStr(formData, 'note'),
      },
      update: {
        amount: fromCents(amountCents),
        accountAmount: accountAmountCents === null ? null : fromCents(accountAmountCents),
        exchangeRate,
        paidAt: dateValue(paidAt),
        accountId,
        note: optStr(formData, 'note'),
      },
    })

    await tx.cardInstallment.updateMany({
      where: { cardId: card.id, period, currency: payCurrency, isPaid: false },
      data: { isPaid: true, paidAt: dateValue(paidAt) },
    })
  })

  revalidateFinance()
  return { ok: true }
}

/** Edita un pago histórico sin modificar el calendario de cuotas. */
export async function editLegacyCardPayment(user: CurrentUser, form: FormData): Promise<ActionState> {
  const id = str(form, 'id')
  const payment = await prisma.cardPayment.findFirst({ where: { id, userId: user.id } })
  if (!payment) return { error: 'El pago no existe.' }
  const amount = cents(form, 'amount')
  const paidAt = isoDate(form, 'paidAt')
  const accountId = optStr(form, 'accountId')
  if (amount === null || !Number.isSafeInteger(amount) || amount <= 0 || amount > 99999999999999 || !paidAt || !Number.isFinite(dateValue(paidAt).getTime()) || dateValue(paidAt).toISOString().slice(0, 10) !== paidAt) return { error: 'Revisá el importe y la fecha.' }
  let accountAmount: string | null = null
  let exchangeRate: number | null = null
  if (accountId) {
    const account = await prisma.account.findFirst({ where: { id: accountId, userId: user.id } })
    if (!account) return { error: 'La cuenta no existe.' }
    if (account.currency === payment.currency) accountAmount = fromCents(amount)
    else if (account.currency === 'UYU' && payment.currency === 'USD') {
      exchangeRate = user.usdRateCents
      accountAmount = fromCents(convertUsdToUyu(amount, exchangeRate))
    } else return { error: 'La moneda de la cuenta no permite este pago.' }
    if (payment.accountId === accountId && Number(payment.amount) * 100 === amount) {
      accountAmount = payment.accountAmount?.toString() ?? accountAmount
      exchangeRate = payment.exchangeRate
    }
  }
  const result = await prisma.cardPayment.updateMany({ where: { id, userId: user.id }, data: { amount: fromCents(amount), paidAt: dateValue(paidAt), accountId, accountAmount, exchangeRate, note: optStr(form, 'note') } })
  if (!result.count) return { error: 'El pago no existe.' }
  revalidateFinance()
  return { ok: true }
}

/** La eliminación revierte el débito al recalcular; no altera cuotas históricas. */
export async function deleteCardPayment(user: CurrentUser, formData: FormData): Promise<ActionState> {
  const result = await prisma.cardPayment.deleteMany({ where: { id: str(formData, 'id'), userId: user.id } })
  if (!result.count) return { error: 'El pago no existe.' }
  revalidateFinance()
  return { ok: true }
}

/** Corrige el período de resumen de una compra completa (todas sus cuotas). */
export async function movePurchasePeriod(user: CurrentUser, formData: FormData): Promise<ActionState> {
  const expenseId = str(formData, 'expenseId')
  const newPeriod = monthKey(formData, 'period')
  const expense = await prisma.expense.findFirst({
    where: { id: expenseId, userId: user.id },
    include: { installmentsList: { orderBy: { number: 'asc' } }, creditCard: true },
  })
  if (!expense) return { error: 'La compra no existe.' }
  if (!newPeriod) return { error: 'El período no es válido.' }
  if (!expense.creditCard) return { error: 'La compra no es con tarjeta.' }
  if (expense.installmentsList.some((item) => item.isPaid)) {
    return { error: 'No se puede mover una compra con cuotas ya pagadas. Corregí cada cuota.' }
  }

  const [year, month] = newPeriod.split('-').map(Number)
  await prisma.$transaction(
    expense.installmentsList.map((installment) => {
      const absolute = year * 12 + (month - 1) + (installment.number - 1)
      const period = `${Math.floor(absolute / 12)}-${String((absolute % 12) + 1).padStart(2, '0')}`
      return prisma.cardInstallment.update({
        where: { id: installment.id },
        data: {
          period,
          dueDate: dateValue(`${period}-${String(Math.min(expense.creditCard!.dueDay, 28)).padStart(2, '0')}`),
          isEstimated: false,
        },
      })
    }),
  )

  revalidateFinance()
  return { ok: true }
}
