'use server'

import 'server-only'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { syncGmailForUser } from '@/lib/gmail/sync'
import { isoDate } from '@/lib/validation'
import type { ActionState } from '@/lib/action-state'

function revalidateGmail() {
  revalidatePath('/ajustes')
  revalidatePath('/')
  revalidatePath('/movimientos')
  revalidatePath('/proyeccion')
}

export async function updateGmailSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  const connection = await prisma.gmailConnection.findUnique({ where: { userId: user.id } })
  if (!connection) return { error: 'Gmail no está conectado.' }

  const importFrom = isoDate(formData, 'importFrom')
  if (!importFrom) return { error: 'Elegí desde qué fecha importar.' }
  if (importFrom > new Date().toISOString().slice(0, 10)) {
    return { error: 'La fecha de importación no puede ser futura.' }
  }

  await prisma.gmailConnection.update({
    where: { userId: user.id },
    data: {
      importFrom: new Date(`${importFrom}T00:00:00.000Z`),
      autoSync: formData.get('autoSync') === 'on',
    },
  })
  revalidateGmail()
  return { ok: true }
}

export async function syncGmailNow(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  void formData
  const connection = await prisma.gmailConnection.findUnique({ where: { userId: user.id } })
  if (!connection) return { error: 'Gmail no está conectado.' }
  if (connection.status !== 'ACTIVE') {
    return { error: 'La conexión está inactiva. Volvé a conectar tu cuenta de Gmail.' }
  }

  const result = await syncGmailForUser(user.id)
  revalidateGmail()
  if (!result.ok && result.message.includes('invalid_grant')) {
    return { error: 'Google revocó el acceso. Desconectá y volvé a conectar Gmail.' }
  }
  return result.ok
    ? { ok: true, message: result.message }
    : { error: result.message }
}

export async function disconnectGmail(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  void formData
  const connection = await prisma.gmailConnection.findUnique({ where: { userId: user.id } })
  if (!connection) return { error: 'Gmail no está conectado.' }

  // Se borran los tokens, no los gastos importados. Los IDs de mensajes se
  // conservan para no reimportar lo mismo si se vuelve a conectar.
  await prisma.gmailConnection.update({
    where: { userId: user.id },
    data: {
      status: 'REVOKED',
      refreshToken: '',
      accessToken: null,
      tokenExpiresAt: null,
      autoSync: false,
    },
  })
  revalidateGmail()
  return { ok: true }
}

export async function dismissGmailMessage(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  const messageId = String(formData.get('messageId') ?? '')
  const message = await prisma.processedGmailMessage.findFirst({
    where: { messageId, connection: { userId: user.id } },
  })
  if (!message) return { error: 'El correo no existe.' }

  await prisma.processedGmailMessage.update({
    where: { id: message.id },
    data: { status: 'SKIPPED_IRRELEVANT', reason: 'Descartado manualmente.', expenseId: null },
  })
  revalidateGmail()
  return { ok: true }
}

/** Marca como resuelto un correo cuyo gasto ya fue creado o corregido a mano. */
export async function resolveGmailMessage(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  const messageId = String(formData.get('messageId') ?? '')
  const message = await prisma.processedGmailMessage.findFirst({
    where: { messageId, connection: { userId: user.id } },
  })
  if (!message) return { error: 'El correo no existe.' }
  await prisma.processedGmailMessage.update({
    where: { id: message.id },
    data: { status: message.expenseId ? 'IMPORTED' : 'SKIPPED_IRRELEVANT', reason: null },
  })
  revalidateGmail()
  return { ok: true }
}
