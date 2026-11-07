import { describe, expect, it } from 'vitest'
import { obligationBalance } from '@/lib/finance/obligations'

describe('saldo de una obligación', () => {
  it('distingue pagos pendientes, parciales y completos', () => {
    expect(obligationBalance(4000000, [])).toMatchObject({ remainingCents: 4000000, status: 'PENDING' })
    expect(obligationBalance(4000000, [1500000])).toMatchObject({ remainingCents: 2500000, status: 'PARTIAL' })
    expect(obligationBalance(4000000, [1500000, 2500000])).toMatchObject({ remainingCents: 0, status: 'PAID' })
  })
  it('recalcula al corregir o eliminar un pago y no produce deuda negativa', () => {
    expect(obligationBalance(4000000, [500000, 1000000]).remainingCents).toBe(2500000)
    expect(obligationBalance(4000000, [500000]).remainingCents).toBe(3500000)
    expect(obligationBalance(4000000, [5000000]).remainingCents).toBe(0)
  })
  it('rechaza importes inválidos', () => {
    expect(() => obligationBalance(100, [-1])).toThrow(RangeError)
    expect(() => obligationBalance(100.5, [])).toThrow(RangeError)
  })
})

import { monthlyCommitments, paymentDebits, type IndependentPayment } from '@/lib/finance/obligations'
const pay = (id: string, obligationId: string, amountCents: number): IndependentPayment => ({id, obligationId, amountCents, paidAt:'2026-11-06',accountId:'bank',accountAmountCents:amountCents,debitAccount:true})
describe('compromisos mensuales y débitos', () => {
  const obligations = [
    {id:'card',kind:'CARD' as const,period:'2026-11',currency:'UYU' as const,totalCents:4000000},
    {id:'bill',kind:'BILL' as const,period:'2026-11',currency:'UYU' as const,totalCents:3000000},
  ]
  it('respeta el ejemplo de saldo actual y pagos ya debitados', () => {
    const result=monthlyCommitments('2026-11',10000000,obligations,[pay('1','card',1500000),pay('2','bill',1000000)],4100)
    expect(result.availableAfterCommitmentsCents).toBe(5500000)
    expect(result.cards.status).toBe('PARTIAL')
    expect(result.bills.status).toBe('PARTIAL')
  })
  it('conserva los totales de obligaciones pagadas y admite varios pagos', () => {
    const result=monthlyCommitments('2026-11',10000000,obligations,[pay('1','card',1500000),pay('2','card',2500000),pay('3','bill',3000000)],4100)
    expect(result.cards.totalCents).toBe(4000000)
    expect(result.availableAfterCommitmentsCents).toBe(10000000)
    expect(result.cards.status).toBe('PAID')
  })
  it('separa meses y convierte deuda USD con la cotización configurada', () => {
    const result=monthlyCommitments('2026-12',1000000,[...obligations,{id:'usd',kind:'CARD',period:'2026-12',currency:'USD',totalCents:10000}],[],4100)
    expect(result.cards.remainingCents).toBe(410000)
    expect(result.bills.totalCents).toBe(0)
  })
  it('no repite débitos y respeta conciliación, cuenta y fecha', () => {
    const p=pay('1','card',1000)
    expect(paymentDebits([p,p],'bank','2026-11-06')).toBe(1000)
    expect(paymentDebits([{...p,debitAccount:false}],'bank','2026-11-06')).toBe(0)
    expect(paymentDebits([p],'other','2026-11-06')).toBe(0)
    expect(paymentDebits([p],'bank','2026-11-05')).toBe(0)
  })
})
