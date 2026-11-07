import { NextResponse } from 'next/server'
import { syncAllGmailUsers } from '@/lib/gmail/sync'
import { renewAllGmailWatches } from '@/lib/gmail/watch'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

/**
 * Vercel Cron llama a este endpoint. Requiere CRON_SECRET.
 * Configuración en vercel.json (por defecto: una vez al día).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 503 })
  }
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const watch = await renewAllGmailWatches()
    const result = await syncAllGmailUsers()
    return NextResponse.json({
      ok: true,
      users: result.users,
      watch,
      summary: result.results.map((item) => ({
        imported: item.imported,
        needsReview: item.needsReview,
        skipped: item.skipped,
        errors: item.errors,
      })),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error de sincronización'
    console.error('Cron Gmail error:', message)
    return NextResponse.json({ error: 'Error de sincronización' }, { status: 500 })
  }
}
