'use server'

import { requireUser } from '@/lib/auth'
import type { ActionState } from '@/lib/action-state'
import * as service from '@/lib/services/accounts'

export async function createAccount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return service.createAccount(await requireUser(), formData)
}

export async function updateAccount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return service.updateAccount(await requireUser(), formData)
}

export async function createAdjustment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return service.createAdjustment(await requireUser(), formData)
}

export async function deleteAdjustment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return service.deleteAdjustment(await requireUser(), formData)
}

export async function createIncome(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return service.createIncome(await requireUser(), formData)
}

export async function updateIncome(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return service.updateIncome(await requireUser(), formData)
}

export async function deleteIncome(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return service.deleteIncome(await requireUser(), formData)
}

export async function toggleIncome(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return service.toggleIncome(await requireUser(), formData)
}

export async function toggleDefaultAccount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return service.toggleDefaultAccount(await requireUser(), formData)
}

export async function resetOpeningBalance(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return service.resetOpeningBalance(await requireUser(), formData)
}

export async function createCreditCard(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return service.createCreditCard(await requireUser(), formData)
}

export async function updateCreditCard(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return service.updateCreditCard(await requireUser(), formData)
}
