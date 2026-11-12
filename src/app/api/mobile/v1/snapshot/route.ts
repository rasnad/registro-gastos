import { z } from 'zod'
import { endpoint } from '@/lib/mobile/http'
import { authenticateMobile } from '@/lib/mobile/auth'
import { mobileSnapshot } from '@/lib/mobile/read-model'
import { todayISO } from '@/lib/period'

export const runtime = 'nodejs'
export async function GET(request: Request) {
  return endpoint(async () => {
    const { user } = await authenticateMobile(request)
    const query = new URL(request.url).searchParams
    const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).parse(query.get('period') ?? todayISO().slice(0, 7))
    return mobileSnapshot(user, period, query.get('includeSavings') !== 'false')
  })
}
