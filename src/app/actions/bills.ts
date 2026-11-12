'use server'

import { requireUser } from '@/lib/auth'
import type { ActionState } from '@/lib/action-state'
import * as service from '@/lib/services/bills'

export async function createBill(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return service.createBill(await requireUser(), formData)
}

export async function updateBill(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return service.updateBill(await requireUser(), formData)
}

export async function deleteBill(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return service.deleteBill(await requireUser(), formData)
}

export async function payBillOccurrence(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return service.payBillOccurrence(await requireUser(), formData)
}

export async function unpayBillOccurrence(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return service.unpayBillOccurrence(await requireUser(), formData)
}

export async function deleteLegacyBillPayment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return service.deleteLegacyBillPayment(await requireUser(), formData)
}

export async function setBillActualAmount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return service.setBillActualAmount(await requireUser(), formData)
}
