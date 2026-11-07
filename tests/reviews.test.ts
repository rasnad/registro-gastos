import { describe, expect, it } from 'vitest'
import { countPendingReviews } from '@/lib/finance/reviews'

describe('conteo de revisiones', () => {
  it('cuenta un correo y su movimiento pendiente una sola vez', () => {
    expect(countPendingReviews([{ id: 'a', status: 'NEEDS_REVIEW' }], [{ expenseId: 'a' }])).toBe(1)
  })
  it('ignora correos antiguos vinculados a movimientos confirmados o descartados', () => {
    expect(countPendingReviews([{ id: 'a', status: 'CONFIRMED' }, { id: 'b', status: 'DISCARDED' }], [{ expenseId: 'a' }, { expenseId: 'b' }])).toBe(0)
  })
  it('mantiene los correos sin movimiento y los movimientos pendientes independientes', () => {
    expect(countPendingReviews([{ id: 'a', status: 'NEEDS_REVIEW' }], [{ expenseId: null }, { expenseId: 'missing' }])).toBe(3)
  })
})
