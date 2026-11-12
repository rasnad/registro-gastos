import { endpoint, readJson } from '@/lib/mobile/http'
import { authenticateMobile } from '@/lib/mobile/auth'
import { executeCommand } from '@/lib/mobile/commands'

export const runtime = 'nodejs'
export async function POST(request: Request) {
  return endpoint(async () => {
    const { user } = await authenticateMobile(request)
    return executeCommand(user, request.headers.get('idempotency-key'), await readJson(request))
  })
}
