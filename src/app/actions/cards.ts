'use server'

import { requireUser } from '@/lib/auth'
import type { ActionState } from '@/lib/action-state'
import * as service from '@/lib/services/cards'

export async function registerCardPayment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return service.registerCardPayment(await requireUser(), formData)
}

export async function editLegacyCardPayment(_prev: ActionState, form: FormData): Promise<ActionState> {
  return service.editLegacyCardPayment(await requireUser(), form)
}

export async function deleteCardPayment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return service.deleteCardPayment(await requireUser(), formData)
}

export async function movePurchasePeriod(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return service.movePurchasePeriod(await requireUser(), formData)
}
