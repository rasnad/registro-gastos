'use server'

import 'server-only'
import { prisma } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { fromCents } from '@/lib/money'
import { revalidateFinance } from '@/lib/revalidate'
import { cents, currency, dateValue, isoDate, optStr, str } from '@/lib/validation'
import type { ActionState } from '@/lib/action-state'

/**
 * Ahorro inicial por moneda. Se guarda el importe declarado y desde cuándo
 * rige ese ahorro; no se convierten monedas.
 */
export async function saveSavingsFund(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  const startDate = isoDate(formData, 'startDate')
  if (!startDate) return { error: 'La fecha del ahorro inicial no es válida.' }

  const entries = (['UYU', 'USD'] as const).map((code) => {
    const raw = str(formData, `initial_${code}`)
    return { code, raw, cents: raw ? cents(formData, `initial_${code}`) : 0 }
  })

  for (const entry of entries) {
    if (entry.raw && (entry.cents === null || entry.cents < 0)) {
      return { error: `El ahorro inicial en ${entry.code} no es válido.` }
    }
  }

  for (const entry of entries) {
    const amount = entry.cents ?? 0
    if (amount === 0) {
      // Borrar sólo el fondo de esa moneda: los retiros y aportes quedan.
      await prisma.savingsFund.deleteMany({ where: { userId: user.id, currency: entry.code } })
      continue
    }
    await prisma.savingsFund.upsert({
      where: { userId_currency: { userId: user.id, currency: entry.code } },
      create: {
        userId: user.id,
        currency: entry.code,
        initialAmount: fromCents(amount),
        startDate: dateValue(startDate),
      },
      update: { initialAmount: fromCents(amount), startDate: dateValue(startDate) },
    })
  }

  revalidateFinance()
  return { ok: true }
}

/**
 * Transferencia del ahorro a una cuenta: devuelve plata al banco y baja el
 * ahorro. La cuenta tiene que ser de la misma moneda (no se convierte).
 */
export async function addSavingsWithdrawal(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  const amountCents = cents(formData, 'amount')
  const cur = currency(formData, 'currency')
  const date = isoDate(formData, 'date')
  const accountId = optStr(formData, 'accountId')

  if (!cur) return { error: 'Elegí la moneda.' }
  if (amountCents === null || amountCents <= 0) return { error: 'El importe tiene que ser mayor a cero.' }
  if (!date) return { error: 'La fecha no es válida.' }
  if (!accountId) return { error: 'Elegí la cuenta que recibe la plata.' }

  const account = await prisma.account.findFirst({ where: { id: accountId, userId: user.id } })
  if (!account) return { error: 'La cuenta no existe.' }
  if (account.currency !== cur) {
    return { error: `La cuenta "${account.name}" es en ${account.currency}. Elegí una cuenta en ${cur}.` }
  }

  await prisma.savingsWithdrawal.create({
    data: {
      userId: user.id,
      currency: cur,
      amount: fromCents(amountCents),
      date: dateValue(date),
      accountId,
      note: optStr(formData, 'note'),
    },
  })

  revalidateFinance()
  return { ok: true, message: 'Transferencia registrada: la plata vuelve a la cuenta.' }
}

export async function deleteSavingsWithdrawal(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  const id = str(formData, 'id')
  const result = await prisma.savingsWithdrawal.deleteMany({ where: { id, userId: user.id } })
  if (result.count === 0) return { error: 'La transferencia no existe.' }
  revalidateFinance()
  return { ok: true }
}
