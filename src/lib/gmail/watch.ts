import 'server-only'
import { prisma } from '@/lib/db'
import { decryptToken } from '@/lib/gmail/crypto'
import { gmailForRefreshToken } from '@/lib/gmail/client'

/** Gmail requiere renovar la vigilancia al menos cada siete días. */
export async function renewGmailWatch(userId: string): Promise<boolean> {
  const topicName = process.env.GMAIL_PUBSUB_TOPIC
  if (!topicName) return false
  const connection = await prisma.gmailConnection.findUnique({ where: { userId } })
  if (!connection || connection.status !== 'ACTIVE' || !connection.autoSync || !connection.refreshToken) return false
  const gmail = gmailForRefreshToken(decryptToken(connection.refreshToken))
  await gmail.users.watch({ userId: 'me', requestBody: { topicName } })
  return true
}

export async function renewAllGmailWatches(): Promise<{ renewed: number; failed: number }> {
  if (!process.env.GMAIL_PUBSUB_TOPIC) return { renewed: 0, failed: 0 }
  const connections = await prisma.gmailConnection.findMany({
    where: { status: 'ACTIVE', autoSync: true, refreshToken: { not: '' } },
    select: { userId: true },
  })
  let renewed = 0
  let failed = 0
  for (const connection of connections) {
    try {
      if (await renewGmailWatch(connection.userId)) renewed++
    } catch {
      failed++
      console.error('No se pudo renovar la vigilancia de Gmail para una conexión.')
    }
  }
  return { renewed, failed }
}
