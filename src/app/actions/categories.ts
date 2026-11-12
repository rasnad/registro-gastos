'use server'

import { requireUser } from '@/lib/auth'
import type { ActionState } from '@/lib/action-state'
import * as service from '@/lib/services/categories'

export async function createCategory(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return service.createCategory(await requireUser(), formData)
}

export async function updateCategory(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return service.updateCategory(await requireUser(), formData)
}

export async function deactivateCategory(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return service.deactivateCategory(await requireUser(), formData)
}

export async function restoreCategory(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return service.restoreCategory(await requireUser(), formData)
}

export async function restoreDefaultCategories(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return service.restoreDefaultCategories(await requireUser(), formData)
}

export async function deleteMerchantRule(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return service.deleteMerchantRule(await requireUser(), formData)
}
