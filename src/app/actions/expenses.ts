'use server'

import { requireUser } from '@/lib/auth'
import type { ActionState } from '@/lib/action-state'
import * as service from '@/lib/services/expenses'

export async function createExpense(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return service.createExpense(await requireUser(), formData)
}

export async function updateExpense(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return service.updateExpense(await requireUser(), formData)
}

export async function setExpenseStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return service.setExpenseStatus(await requireUser(), formData)
}

export async function deleteExpense(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return service.deleteExpense(await requireUser(), formData)
}

export async function updateInstallment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return service.updateInstallment(await requireUser(), formData)
}

export async function rememberMerchantRule(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return service.rememberMerchantRule(await requireUser(), formData)
}
