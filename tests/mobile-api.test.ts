import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ session: { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn(), update: vi.fn() }, user: { findUnique: vi.fn() }, limit: { upsert: vi.fn() }, requests: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() }, savePayment: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({ prisma: { mobileSession: mocks.session, mobileLoginLimit: mocks.limit, mobileRequest: mocks.requests, user: mocks.user } }))
vi.mock('@/lib/services/obligation-payments', () => ({ saveObligationPayment: mocks.savePayment, deleteObligationPayment: vi.fn() }))
import { authenticateMobile, hashToken, refreshMobile, logoutMobile, loginMobile } from '@/lib/mobile/auth'
import { executeCommand, validateMobileFields } from '@/lib/mobile/commands'
import { endpoint, readJson } from '@/lib/mobile/http'

const token = 'a'.repeat(43)
const user = { id: 'owner', email: 'owner@example.invalid', name: 'Owner', usdRateCents: 4100 }
const request = () => new Request('https://app.test/api/mobile/v1/snapshot', { headers: { Authorization: `Bearer ${token}` } })
beforeEach(() => { vi.resetAllMocks(); process.env.AUTH_SECRET = 'test-secret'; mocks.session.findUnique.mockResolvedValue({ id: 'session', user, revokedAt: null, expiresAt: new Date(Date.now() + 100000), accessExpiresAt: new Date(Date.now() + 50000) }); mocks.requests.update.mockResolvedValue({}); mocks.savePayment.mockResolvedValue({ ok: true }) })

describe('sesiones nativas', () => {
  it('no acepta cookies web, tokens arbitrarios ni tokens ausentes', async () => {
    for (const headers of [{}, { Cookie: 'rg_session=web' }, { Authorization: 'Bearer bad' }] as Record<string,string>[]) await expect(authenticateMobile(new Request('https://app.test', { headers }))).rejects.toMatchObject({ status: 401 })
    expect(mocks.session.findUnique).not.toHaveBeenCalled()
  })
  it('resuelve el usuario desde el hash de token, sin guardar el token plano', async () => {
    expect(await authenticateMobile(request())).toEqual({ user, sessionId: 'session' })
    expect(mocks.session.findUnique.mock.calls[0][0].where).toEqual({ accessHash: hashToken(token) })
    expect(hashToken(token)).not.toContain(token)
  })
  it.each(['revoked', 'expired'])('rechaza una sesión %s', async kind => {
    mocks.session.findUnique.mockResolvedValue({ revokedAt: kind === 'revoked' ? new Date() : null, accessExpiresAt: new Date(0), expiresAt: new Date(0) })
    await expect(authenticateMobile(request())).rejects.toMatchObject({ status: 401 })
  })
  it('rota ambos tokens mediante actualización condicional', async () => {
    mocks.session.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })
    const result = await refreshMobile(token)
    expect(result.accessToken).toHaveLength(43); expect(result.refreshToken).not.toBe(token)
    expect(mocks.session.updateMany.mock.calls[0][0].data.accessHash).toBe(hashToken(result.accessToken))
    await expect(refreshMobile(token)).rejects.toMatchObject({ status: 401 })
  })
  it('revoca sólo la sesión autenticada', async () => {
    await logoutMobile(request())
    expect(mocks.session.update).toHaveBeenCalledWith({ where: { id: 'session' }, data: { revokedAt: expect.any(Date) } })
  })
  it('limita intentos antes de comparar contraseñas', async () => {
    mocks.limit.upsert.mockResolvedValue({ attempts: 11 })
    await expect(loginMobile(user.email, 'wrong')).rejects.toMatchObject({ status: 429 })
    expect(mocks.user.findUnique).not.toHaveBeenCalled()
  })
})

describe('contratos y reintentos', () => {
  const input = { command: 'saveObligationPayment', fields: { obligationId: 'card', amount: '25.00', period: '2026-11', paidAt: '2026-11-11' } }
  const key = 'operation-key-123456'
  it('ejecuta el servicio existente con el usuario de la sesión', async () => {
    await executeCommand(user, key, input)
    expect(mocks.savePayment).toHaveBeenCalledOnce()
    expect(mocks.savePayment.mock.calls[0][0]).toBe(user)
    expect(mocks.savePayment.mock.calls[0][1].get('amount')).toBe('25.00')
    expect(mocks.requests.create.mock.calls[0][0].data.userId).toBe(user.id)
  })
  it('repite la respuesta, no el pago, ante un reintento', async () => {
    await executeCommand(user, key, input)
    const fingerprint = mocks.requests.create.mock.calls[0][0].data.fingerprint
    mocks.requests.create.mockRejectedValue({ code: 'P2002' })
    mocks.requests.findUnique.mockResolvedValue({ fingerprint, result: { ok: true } })
    expect(await executeCommand(user, key, input)).toEqual({ ok: true })
    expect(mocks.savePayment).toHaveBeenCalledOnce()
  })
  it('rechaza cambiar el cuerpo de una clave ya utilizada', async () => {
    mocks.requests.create.mockRejectedValue({ code: 'P2002' }); mocks.requests.findUnique.mockResolvedValue({ fingerprint: 'other', result: { ok: true } })
    await expect(executeCommand(user, key, input)).rejects.toMatchObject({ status: 409, code: 'KEY_REUSED' })
  })
  it('no reejecuta una operación cuyo resultado es ambiguo', async () => {
    await executeCommand(user, key, input)
    const fingerprint = mocks.requests.create.mock.calls[0][0].data.fingerprint
    mocks.requests.create.mockRejectedValue({ code: 'P2002' }); mocks.requests.findUnique.mockResolvedValue({ fingerprint, result: null })
    await expect(executeCommand(user, key, input)).rejects.toMatchObject({ code: 'IN_PROGRESS' })
    expect(mocks.savePayment).toHaveBeenCalledOnce()
  })
  it('rechaza suplantación del usuario y comandos históricos de creación', async () => {
    await expect(executeCommand(user, key, { ...input, fields: { userId: 'other' } })).rejects.toMatchObject({ status: 400 })
    await expect(executeCommand(user, key, { command: 'registerCardPayment', fields: {} })).rejects.toThrow()
    expect(mocks.savePayment).not.toHaveBeenCalled()
  })
  const invalidFields: Record<string, string>[] = [{ paidAt: '2026-02-30' }, { period: '2026-13' }, { amount: 'Infinity' }, { amount: '9999999999999999999' }]
  it.each(invalidFields)('valida datos antes de escribir %j', fields => {
    expect(() => validateMobileFields(fields)).toThrow()
  })
  it('devuelve errores uniformes sin detalles internos y sin cache', async () => {
    const response = await endpoint(async () => { throw new Error('postgresql://secret') })
    expect(response.status).toBe(500)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.text()).not.toContain('secret')
  })
  it('limita el cuerpo incluso sin Content-Length', async () => {
    await expect(readJson(new Request('https://app.test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: 'x'.repeat(65536) }) }))).rejects.toMatchObject({ status: 413 })
  })
})
