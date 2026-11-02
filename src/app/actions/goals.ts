'use server'

import 'server-only'
import { prisma } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { fromCents } from '@/lib/money'
import { revalidateFinance } from '@/lib/revalidate'
import { cents, currency, dateValue, int, isoDate, optStr, str } from '@/lib/validation'
import type { ActionState } from '@/lib/action-state'

export async function createGoal(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  const name = str(formData, 'name')
  const cur = currency(formData, 'currency')
  const targetCents = cents(formData, 'targetAmount')
  const targetDate = isoDate(formData, 'targetDate')
  const monthlyTargetCents = str(formData, 'monthlyTarget') ? cents(formData, 'monthlyTarget') : null
  const initialCents = str(formData, 'initialAmount') ? cents(formData, 'initialAmount') : null
  const priority = Math.min(5, Math.max(1, int(formData, 'priority', 3)))

  if (!name) return { error: 'Ponele un nombre al objetivo.' }
  if (!cur) return { error: 'Elegí la moneda.' }
  if (targetCents === null || targetCents <= 0) return { error: 'El monto objetivo debe ser mayor a cero.' }
  if (!targetDate) return { error: 'La fecha objetivo no es válida.' }
  if (targetDate < new Date().toISOString().slice(0, 10)) return { error: 'La fecha objetivo ya pasó.' }

  const goal = await prisma.savingsGoal.create({
    data: {
      userId: user.id,
      name,
      currency: cur,
      targetAmount: fromCents(targetCents),
      targetDate: dateValue(targetDate),
      monthlyTarget: monthlyTargetCents !== null && monthlyTargetCents > 0 ? fromCents(monthlyTargetCents) : null,
      priority,
    },
  })

  if (initialCents !== null && initialCents > 0) {
    await prisma.savingsContribution.create({
      data: {
        goalId: goal.id,
        userId: user.id,
        amount: fromCents(initialCents),
        currency: cur,
        date: dateValue(new Date().toISOString().slice(0, 10)),
        note: 'Monto ya ahorrado al crear el objetivo',
      },
    })
  }

  revalidateFinance()
  return { ok: true }
}

export async function updateGoal(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  const id = str(formData, 'id')
  const goal = await prisma.savingsGoal.findFirst({ where: { id, userId: user.id } })
  if (!goal) return { error: 'El objetivo no existe.' }

  const targetCents = cents(formData, 'targetAmount')
  const targetDate = isoDate(formData, 'targetDate')
  const monthlyTargetCents = str(formData, 'monthlyTarget') ? cents(formData, 'monthlyTarget') : null
  if (targetCents === null || targetCents <= 0) return { error: 'El monto objetivo debe ser mayor a cero.' }
  if (!targetDate) return { error: 'La fecha objetivo no es válida.' }

  await prisma.savingsGoal.update({
    where: { id: goal.id },
    data: {
      name: str(formData, 'name') || goal.name,
      targetAmount: fromCents(targetCents),
      targetDate: dateValue(targetDate),
      monthlyTarget: monthlyTargetCents !== null && monthlyTargetCents > 0 ? fromCents(monthlyTargetCents) : null,
      priority: Math.min(5, Math.max(1, int(formData, 'priority', goal.priority))),
      isActive: formData.has('isActive') ? formData.get('isActive') === 'on' : goal.isActive,
    },
  })
  revalidateFinance()
  return { ok: true }
}

export async function deleteGoal(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  const id = str(formData, 'id')
  const result = await prisma.savingsGoal.deleteMany({ where: { id, userId: user.id } })
  if (result.count === 0) return { error: 'El objetivo no existe.' }
  revalidateFinance()
  return { ok: true }
}

export async function addContribution(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  const goalId = str(formData, 'goalId')
  const goal = await prisma.savingsGoal.findFirst({ where: { id: goalId, userId: user.id } })
  if (!goal) return { error: 'El objetivo no existe.' }

  const amountCents = cents(formData, 'amount')
  const date = isoDate(formData, 'date')
  const accountId = optStr(formData, 'accountId')
  if (amountCents === null || amountCents <= 0) return { error: 'El aporte debe ser mayor a cero.' }
  if (!date) return { error: 'La fecha no es válida.' }

  if (accountId) {
    const account = await prisma.account.findFirst({ where: { id: accountId, userId: user.id } })
    if (!account) return { error: 'La cuenta no existe.' }
    if (account.currency !== goal.currency) {
      return { error: `El objetivo es en ${goal.currency} y la cuenta en ${account.currency}. No se convierten monedas.` }
    }
  }

  await prisma.savingsContribution.create({
    data: {
      goalId: goal.id,
      userId: user.id,
      amount: fromCents(amountCents),
      currency: goal.currency,
      date: dateValue(date),
      accountId,
      note: optStr(formData, 'note'),
    },
  })
  revalidateFinance()
  return { ok: true }
}

export async function deleteContribution(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  const id = str(formData, 'id')
  const result = await prisma.savingsContribution.deleteMany({ where: { id, userId: user.id } })
  if (result.count === 0) return { error: 'El aporte no existe.' }
  revalidateFinance()
  return { ok: true }
}
