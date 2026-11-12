'use server'

import { requireUser } from '@/lib/auth'
import type { ActionState } from '@/lib/action-state'
import * as service from '@/lib/services/goals'

export async function createGoal(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return service.createGoal(await requireUser(), formData)
}

export async function updateGoal(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return service.updateGoal(await requireUser(), formData)
}

export async function deleteGoal(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return service.deleteGoal(await requireUser(), formData)
}

export async function addContribution(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return service.addContribution(await requireUser(), formData)
}

export async function deleteContribution(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return service.deleteContribution(await requireUser(), formData)
}
