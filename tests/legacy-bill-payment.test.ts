import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ updateMany: vi.fn(), revalidate: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth', () => ({ requireUser: async () => ({ id: 'user-1' }) }))
vi.mock('@/lib/db', () => ({ prisma: { billOccurrence: { updateMany: mocks.updateMany } } }))
vi.mock('@/lib/revalidate', () => ({ revalidateFinance: mocks.revalidate }))
import { deleteLegacyBillPayment } from '@/app/actions/bills'

beforeEach(() => { vi.resetAllMocks(); mocks.updateMany.mockResolvedValue({ count: 1 }) })
function payment(id: string) { const form = new FormData(); form.set('id', id); return form }

describe('eliminación de pago histórico de cuenta fija', () => {
  it('revierte solo el pago propio y conserva el importe y la obligación', async () => {
    expect(await deleteLegacyBillPayment({}, payment('occurrence-1'))).toEqual({ ok: true })
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: 'occurrence-1', userId: 'user-1', status: 'PAID', paidAt: { not: null }, bill: { userId: 'user-1', paymentSource: 'ACCOUNT' } },
      data: { status: 'PENDING', paidAt: null, accountId: null },
    })
    expect(mocks.revalidate).toHaveBeenCalledOnce()
  })
  it('rechaza pagos ajenos, inexistentes o ya revertidos', async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 })
    expect(await deleteLegacyBillPayment({}, payment('other'))).toHaveProperty('error')
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })
})
