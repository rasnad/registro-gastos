import { describe, expect, it } from 'vitest'
import { buildTransferExpense, transferMerchantName } from '@/lib/gmail/transfer-expense'
import type { ParsedTransfer } from '@/lib/gmail/transfer-parser'

const base: ParsedTransfer = {
  amountCents: 200000,
  currency: 'UYU',
  destinationAccount: '0075001201099761',
  destinationBank: 'Santander',
  originLast4: '6166',
  recipient: null,
  date: '2026-11-19',
  dateFromEmail: true,
}

describe('transferencia como gasto a revisar', () => {
  it('registra la transferencia en pesos tal cual viene', () => {
    const { draft, reason } = buildTransferExpense({ parsed: base, usdRateCents: 4100 })
    expect(reason).toBeNull()
    expect(draft).toEqual({
      merchant: 'Transferencia a Santander',
      amountCents: 200000,
      currency: 'UYU',
      notes: null,
      converted: false,
      purchaseDate: '2026-11-19',
    })
  })

  it('convierte los dólares a pesos con la cotización configurada y deja el origen anotado', () => {
    const { draft, reason } = buildTransferExpense({
      parsed: { ...base, amountCents: 6400, currency: 'USD' },
      usdRateCents: 4100,
    })
    expect(reason).toBeNull()
    // US$ 64,00 × $U 41,00 = $U 2.624,00
    expect(draft?.amountCents).toBe(262400)
    expect(draft?.currency).toBe('UYU')
    expect(draft?.converted).toBe(true)
    expect(draft?.notes).toBe('Origen en US$ 64,00 · cotización $U 41,00')
  })

  it('si no hay cotización no inventa pesos: deja el gasto en dólares y lo avisa', () => {
    const { draft, reason } = buildTransferExpense({
      parsed: { ...base, amountCents: 6400, currency: 'USD' },
      usdRateCents: 0,
    })
    expect(draft?.currency).toBe('USD')
    expect(draft?.amountCents).toBe(6400)
    expect(draft?.converted).toBe(false)
    expect(reason).toContain('cotización')
  })

  it('sin importe o sin moneda no arma el gasto', () => {
    expect(buildTransferExpense({ parsed: { ...base, amountCents: null }, usdRateCents: 4100 })).toMatchObject({
      draft: null,
      reason: expect.stringContaining('importe'),
    })
    expect(buildTransferExpense({ parsed: { ...base, currency: null }, usdRateCents: 4100 }).draft).toBeNull()
  })

  it('usa el destino disponible para nombrar el movimiento', () => {
    expect(transferMerchantName(base)).toBe('Transferencia a Santander')
    expect(transferMerchantName({ ...base, destinationBank: null })).toBe(
      'Transferencia a cuenta 0075001201099761',
    )
    expect(transferMerchantName({ ...base, destinationBank: null, destinationAccount: null })).toBe(
      'Transferencia realizada',
    )
  })
})
