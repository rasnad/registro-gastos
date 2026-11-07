import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), findMany: vi.fn(), watch: vi.fn(), decrypt: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({ prisma: { gmailConnection: { findUnique: mocks.findUnique, findMany: mocks.findMany } } }))
vi.mock('@/lib/gmail/crypto', () => ({ decryptToken: mocks.decrypt }))
vi.mock('@/lib/gmail/client', () => ({ gmailForRefreshToken: () => ({ users: { watch: mocks.watch } }) }))
import { renewAllGmailWatches, renewGmailWatch } from '@/lib/gmail/watch'

beforeEach(() => {
  vi.resetAllMocks()
  process.env.GMAIL_PUBSUB_TOPIC = 'projects/example/topics/gmail'
  mocks.findUnique.mockResolvedValue({ status: 'ACTIVE', autoSync: true, refreshToken: 'encrypted' })
  mocks.decrypt.mockReturnValue('token')
  mocks.watch.mockResolvedValue({})
})

describe('vigilancia de Gmail', () => {
  it('registra el tema para una conexión activa', async () => {
    expect(await renewGmailWatch('user')).toBe(true)
    expect(mocks.watch).toHaveBeenCalledWith({ userId: 'me', requestBody: { topicName: 'projects/example/topics/gmail' } })
  })
  it('no registra la vigilancia si el usuario desactivó la sincronización', async () => {
    mocks.findUnique.mockResolvedValue({ status: 'ACTIVE', autoSync: false, refreshToken: 'encrypted' })
    expect(await renewGmailWatch('user')).toBe(false)
    expect(mocks.watch).not.toHaveBeenCalled()
  })
  it('continúa renovando otras cuentas si una falla', async () => {
    mocks.findMany.mockResolvedValue([{ userId: 'a' }, { userId: 'b' }])
    mocks.watch.mockRejectedValueOnce(new Error('failure')).mockResolvedValueOnce({})
    expect(await renewAllGmailWatches()).toEqual({ renewed: 1, failed: 1 })
  })
})
