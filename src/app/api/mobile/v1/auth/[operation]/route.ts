import { z } from 'zod'
import { endpoint, readJson, ApiError } from '@/lib/mobile/http'
import { loginMobile, refreshMobile, logoutMobile } from '@/lib/mobile/auth'

export const runtime = 'nodejs'
export async function POST(request: Request, context: { params: Promise<{ operation: string }> }) {
  return endpoint(async () => {
    const { operation } = await context.params
    if (operation === 'logout') return logoutMobile(request)
    if (operation === 'login') {
      const data = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(256) }).strict().parse(await readJson(request))
      return loginMobile(data.email, data.password)
    }
    if (operation === 'refresh') {
      const data = z.object({ refreshToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict().parse(await readJson(request))
      return refreshMobile(data.refreshToken)
    }
    throw new ApiError(404, 'NOT_FOUND', 'Operación inexistente.')
  })
}
