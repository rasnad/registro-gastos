'use server'

import { requireUser } from '@/lib/auth'
import type { ActionState } from '@/lib/action-state'
import * as service from '@/lib/services/obligation-payments'

export async function saveObligationPayment(_prev: ActionState, form: FormData): Promise<ActionState> {
  return service.saveObligationPayment(await requireUser(), form)
}

export async function deleteObligationPayment(_prev: ActionState, form: FormData): Promise<ActionState> {
  return service.deleteObligationPayment(await requireUser(), form)
}
