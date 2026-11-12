'use server'

import { requireUser } from '@/lib/auth'
import type { ActionState } from '@/lib/action-state'
import * as service from '@/lib/services/settings'

export async function updateUsdRate(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return service.updateUsdRate(await requireUser(), formData)
}
