import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findMany: vi.fn(),
  sync: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('googleapis', () => ({ google: { auth: { OAuth2: class { verifyIdToken = mocks.verifyIdToken } } } }))
vi.mock('@/lib/db', () => ({ prisma: { gmailConnection: { findMany: mocks.findMany } } }))
vi.mock('@/lib/gmail/sync', () => ({ syncGmailForUser: mocks.sync }))
import { POST } from '@/app/api/gmail/push/route'

function request(payload: unknown = { emailAddress: 'user@example.com', historyId: '123' }, token = 'valid') {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64')
  return new Request('http://localhost/api/gmail/push', {
    method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify({ message: { data } }),
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  process.env.GMAIL_PUBSUB_AUDIENCE = 'https://app.example/api/gmail/push'
  process.env.GMAIL_PUBSUB_SERVICE_ACCOUNT = 'push@example.iam.gserviceaccount.com'
  mocks.verifyIdToken.mockResolvedValue({ getPayload: () => ({ email: process.env.GMAIL_PUBSUB_SERVICE_ACCOUNT, email_verified: true }) })
  mocks.findMany.mockResolvedValue([{ userId: 'user-1' }])
  mocks.sync.mockResolvedValue({ ok: true })
})

describe('notificaciones autenticadas de Gmail', () => {
  it('verifica el token, busca la conexión activa y sincroniza solo ese buzón', async () => {
    expect((await POST(request())).status).toBe(200)
    expect(mocks.verifyIdToken).toHaveBeenCalledWith({ idToken: 'valid', audience: process.env.GMAIL_PUBSUB_AUDIENCE })
    expect(mocks.findMany).toHaveBeenCalledWith({ where: expect.objectContaining({ emailAddress: { equals: 'user@example.com', mode: 'insensitive' }, status: 'ACTIVE', autoSync: true }), select: { userId: true } })
    expect(mocks.sync).toHaveBeenCalledWith('user-1')
  })
  it('rechaza tokens inválidos y cuentas de servicio distintas', async () => {
    mocks.verifyIdToken.mockRejectedValueOnce(new Error('bad token'))
    expect((await POST(request())).status).toBe(401)
    mocks.verifyIdToken.mockResolvedValueOnce({ getPayload: () => ({ email: 'otro@example.com', email_verified: true }) })
    expect((await POST(request())).status).toBe(401)
    expect(mocks.sync).not.toHaveBeenCalled()
  })
  it('rechaza mensajes inválidos sin consultar ni modificar datos', async () => {
    expect((await POST(request({ emailAddress: 'not-an-email', historyId: '123' }))).status).toBe(400)
    expect(mocks.findMany).not.toHaveBeenCalled()
  })
  it('acepta historyId numérico en la notificación de Gmail', async () => {
    expect((await POST(request({ emailAddress: 'user@example.com', historyId: 12345 }))).status).toBe(200)
    expect(mocks.sync).toHaveBeenCalledWith('user-1')
  })
  it('acepta datos codificados en base64url sin padding', async () => {
    const data = Buffer.from(JSON.stringify({ emailAddress: 'user@example.com', historyId: '123', extra: 'x\uffff' })).toString('base64url')
    expect(data).toMatch(/[-_]/)
    const req = new Request('http://localhost/api/gmail/push', { method:'POST', headers:{authorization:'Bearer valid','content-type':'application/json'}, body:JSON.stringify({message:{data}}) })
    expect((await POST(req)).status).toBe(200)
  })
  it('solicita reintento si la sincronización falla y no expone los detalles', async () => {
    mocks.sync.mockResolvedValue({ ok: false })
    expect((await POST(request())).status).toBe(500)
  })
  it('falla de manera cerrada si falta configuración', async () => {
    delete process.env.GMAIL_PUBSUB_AUDIENCE
    expect((await POST(request())).status).toBe(503)
    expect(mocks.sync).not.toHaveBeenCalled()
  })
})
