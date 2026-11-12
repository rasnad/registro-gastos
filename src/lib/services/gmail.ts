
import 'server-only'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import type { CurrentUser } from '@/lib/auth'
import { syncGmailForUser } from '@/lib/gmail/sync'
import { renewGmailWatch } from '@/lib/gmail/watch'
import type { ActionState } from '@/lib/action-state'

function revalidateGmail() {
  revalidatePath('/ajustes')
  revalidatePath('/')
  revalidatePath('/movimientos')
  revalidatePath('/proyeccion')
}

export async function updateGmailSettings(user: CurrentUser, formData: FormData): Promise<ActionState> {
  const connection = await prisma.gmailConnection.findUnique({ where: { userId: user.id } })
  if (!connection) return { error: 'Gmail no está conectado.' }

  await prisma.gmailConnection.update({
    where: { userId: user.id },
    data: {
      autoSync: formData.get('autoSync') === 'on',
    },
  })
  revalidateGmail()
  return { ok: true }
}

export async function syncGmailNow(user: CurrentUser, formData: FormData): Promise<ActionState> {
  void formData
  const connection = await prisma.gmailConnection.findUnique({ where: { userId: user.id } })
  if (!connection) return { error: 'Gmail no está conectado.' }
  if (connection.status !== 'ACTIVE') {
    return { error: 'La conexión está inactiva. Volvé a conectar tu cuenta de Gmail.' }
  }

  let watchFailed = false
  try {
    await renewGmailWatch(user.id)
  } catch {
    watchFailed = true
  }
  const result = await syncGmailForUser(user.id)
  revalidateGmail()
  if (!result.ok && result.message.includes('invalid_grant')) {
    return { error: 'Google revocó el acceso. Desconectá y volvé a conectar Gmail.' }
  }
  return result.ok
    ? { ok: true, message: result.message + (watchFailed ? ' No se pudo activar la sincronización rápida; se reintentará automáticamente.' : '') }
    : { error: result.message }
}

export async function disconnectGmail(user: CurrentUser, formData: FormData): Promise<ActionState> {
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

export async function dismissGmailMessage(user: CurrentUser, formData: FormData): Promise<ActionState> {
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
export async function resolveGmailMessage(user: CurrentUser, formData: FormData): Promise<ActionState> {
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
