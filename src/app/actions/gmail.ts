'use server'

import { requireUser } from '@/lib/auth'
import type { ActionState } from '@/lib/action-state'
import * as service from '@/lib/services/gmail'

export async function updateGmailSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return service.updateGmailSettings(await requireUser(), formData)
}

export async function syncGmailNow(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return service.syncGmailNow(await requireUser(), formData)
}

export async function disconnectGmail(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return service.disconnectGmail(await requireUser(), formData)
}

export async function dismissGmailMessage(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return service.dismissGmailMessage(await requireUser(), formData)
}

export async function resolveGmailMessage(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return service.resolveGmailMessage(await requireUser(), formData)
}
