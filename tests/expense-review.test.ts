import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ expense: { updateMany: vi.fn() }, message: { updateMany: vi.fn() }, revalidate: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth', () => ({ requireUser: async () => ({ id: 'user-1' }) }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
vi.mock('@/lib/db', () => ({ prisma: { $transaction: async (callback: (tx: unknown) => unknown) => callback({ expense: mocks.expense, processedGmailMessage: mocks.message }) } }))
import { setExpenseStatus } from '@/app/actions/expenses'

beforeEach(() => { vi.resetAllMocks(); mocks.expense.updateMany.mockResolvedValue({ count: 1 }); mocks.message.updateMany.mockResolvedValue({ count: 1 }) })
function form(id: string, status: string) { const f = new FormData(); f.set('id', id); f.set('status', status); return f }

describe('confirmación de gastos importados', () => {
  it('resuelve el correo asociado y actualiza el layout', async () => {
    expect(await setExpenseStatus({}, form('expense-1', 'CONFIRMED'))).toEqual({ ok: true })
    expect(mocks.message.updateMany).toHaveBeenCalledWith({ where: { expenseId: 'expense-1', connection: { userId: 'user-1' }, status: 'NEEDS_REVIEW' }, data: { status: 'IMPORTED', reason: null } })
    expect(mocks.revalidate).toHaveBeenCalledWith('/', 'layout')
  })
  it('no cambia correos vinculados a un gasto ajeno', async () => {
    mocks.expense.updateMany.mockResolvedValue({ count: 0 })
    expect(await setExpenseStatus({}, form('other', 'CONFIRMED'))).toHaveProperty('error')
    expect(mocks.message.updateMany).not.toHaveBeenCalled()
  })
})
