import { google } from 'googleapis'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { syncGmailForUser } from '@/lib/gmail/sync'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

/** Pub/Sub entrega solo el correo de la cuenta y el historyId, no el contenido. */
export async function POST(request: Request) {
  const audience = process.env.GMAIL_PUBSUB_AUDIENCE
  const expectedEmail = process.env.GMAIL_PUBSUB_SERVICE_ACCOUNT
  if (!audience || !expectedEmail) return NextResponse.json({ error: 'No configurado' }, { status: 503 })

  const match = /^Bearer (\S+)$/.exec(request.headers.get('authorization') ?? '')
  if (!match) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const ticket = await new google.auth.OAuth2().verifyIdToken({ idToken: match[1], audience })
    const claims = ticket.getPayload()
    if (claims?.email !== expectedEmail || claims.email_verified !== true) throw new Error('Identidad inválida')
  } catch {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  let emailAddress: string
  try {
    const body = await request.json()
    const data = body?.message?.data
    if (typeof data !== 'string' || data.length > 4096 || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(data)) throw new Error('Datos inválidos')
    const payload = JSON.parse(Buffer.from(data, 'base64').toString('utf8'))
    const validHistoryId = (typeof payload.historyId === 'string' && /^\d+$/.test(payload.historyId)) ||
      (typeof payload.historyId === 'number' && Number.isInteger(payload.historyId) && payload.historyId >= 0)
    if (typeof payload.emailAddress !== 'string' || payload.emailAddress.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(payload.emailAddress) || !validHistoryId) throw new Error('Datos inválidos')
    emailAddress = payload.emailAddress
  } catch {
    return NextResponse.json({ error: 'Notificación inválida' }, { status: 400 })
  }

  try {
    const connections = await prisma.gmailConnection.findMany({
      where: { emailAddress: { equals: emailAddress, mode: 'insensitive' }, status: 'ACTIVE', autoSync: true, refreshToken: { not: '' } },
      select: { userId: true },
    })
    for (const connection of connections) {
      const result = await syncGmailForUser(connection.userId)
      if (!result.ok) return NextResponse.json({ error: 'Sincronización fallida' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch {
    console.error('No se pudo procesar la notificación de Gmail.')
    return NextResponse.json({ error: 'Sincronización fallida' }, { status: 500 })
  }
}
