import { describe, expect, it } from 'vitest'
import { accountBalanceBreakdown, type EngineInput } from '@/lib/finance/engine'
import {
  savingsMonths,
  savingsSeries,
  savingsStatus,
  savingsTotalCents,
} from '@/lib/finance/savings'

describe('saldo de ahorro', () => {
  it('suma el ahorro inicial más los aportes y resta los retiros', () => {
    expect(
      savingsTotalCents({ initialCents: 500_000, contributionsCents: 120_000, withdrawalsCents: 30_000 }),
    ).toBe(590_000)
    expect(
      savingsTotalCents({ initialCents: 0, contributionsCents: 0, withdrawalsCents: 0 }),
    ).toBe(0)
  })

  it('marca cuándo estás por debajo del ahorro inicial', () => {
    expect(savingsStatus(450_000, 500_000)).toEqual({
      totalCents: 450_000,
      initialCents: 500_000,
      deltaCents: -50_000,
      belowInitial: true,
    })
    expect(savingsStatus(500_000, 500_000).belowInitial).toBe(false)
    expect(savingsStatus(620_000, 500_000).deltaCents).toBe(120_000)
  })
})

describe('evolución del ahorro', () => {
  const fund = { currency: 'UYU' as const, initialCents: 500_000, startDate: '2026-09-01' }

  it('acumula aportes y retiros mes a mes y compara con el plan', () => {
    const points = savingsSeries({
      months: ['2026-08', '2026-09', '2026-10', '2026-11'],
      fund,
      contributions: [
        { date: '2026-09-10', amountCents: 50_000 },
        { date: '2026-10-05', amountCents: 70_000 },
      ],
      withdrawals: [{ date: '2026-11-02', amountCents: 200_000 }],
      plannedMonthlyCents: 60_000,
    })

    // Agosto es anterior al ahorro inicial: no aparece.
    expect(points.map((point) => point.period)).toEqual(['2026-09', '2026-10', '2026-11'])
    expect(points.map((point) => point.realCents)).toEqual([550_000, 620_000, 420_000])
    // Lo esperado es acumulativo según el objetivo mensual.
    expect(points.map((point) => point.plannedCents)).toEqual([560_000, 620_000, 680_000])
  })

  it('incluye los movimientos del último día del mes', () => {
    const points = savingsSeries({
      months: ['2026-09'],
      fund,
      contributions: [{ date: '2026-09-30', amountCents: 10_000 }],
      withdrawals: [],
      plannedMonthlyCents: 0,
    })
    expect(points[0].realCents).toBe(510_000)
    expect(points[0].plannedCents).toBe(500_000)
  })

  it('sin ahorro inicial arranca en cero y acumula igual', () => {
    const points = savingsSeries({
      months: ['2026-10'],
      fund: null,
      contributions: [{ date: '2026-10-01', amountCents: 25_000 }],
      withdrawals: [],
      plannedMonthlyCents: 25_000,
    })
    expect(points).toEqual([{ period: '2026-10', realCents: 25_000, plannedCents: 25_000 }])
  })

  it('limita los meses al rango pedido', () => {
    const months = savingsMonths({
      today: '2026-11',
      fund: { ...fund, startDate: '2026-01-15' },
      contributions: [],
      withdrawals: [],
      max: 3,
    })
    expect(months).toEqual(['2026-09', '2026-10', '2026-11'])
  })

  it('arranca en el primer movimiento si no hay ahorro inicial', () => {
    expect(
      savingsMonths({
        today: '2026-11',
        fund: null,
        contributions: [{ date: '2026-10-20' }],
        withdrawals: [],
        max: 12,
      }),
    ).toEqual(['2026-10', '2026-11'])
  })
})

describe('transferencias del ahorro a la cuenta', () => {
  const account = {
    id: 'bank',
    name: 'Banco',
    kind: 'BANK' as const,
    currency: 'UYU' as const,
    openingCents: 1_000_000,
    openingDate: '2026-11-01',
    isActive: true,
  }

  const input = (savingsWithdrawals: EngineInput['savingsWithdrawals']): EngineInput => ({
    today: '2026-11-20',
    accounts: [account],
    cards: [],
    incomes: [],
    adjustments: [],
    expenses: [],
    installments: [],
    cardPayments: [],
    independentPayments: [],
    bills: [],
    billOccurrences: [],
    goals: [],
    contributions: [],
    savingsWithdrawals,
  })

  it('devuelve la plata a la cuenta: el saldo disponible sube', () => {
    const breakdown = accountBalanceBreakdown(
      account,
      input([
        { id: 'w1', currency: 'UYU', amountCents: 250_000, date: '2026-11-10', accountId: 'bank', note: null },
      ]),
    )
    expect(breakdown.withdrawalCents).toBe(250_000)
    expect(breakdown.balanceCents).toBe(1_250_000)
  })

  it('no afecta otras cuentas ni movimientos futuros', () => {
    const breakdown = accountBalanceBreakdown(
      account,
      input([
        { id: 'w1', currency: 'UYU', amountCents: 250_000, date: '2026-11-10', accountId: 'otra', note: null },
        { id: 'w2', currency: 'UYU', amountCents: 900_000, date: '2026-12-01', accountId: 'bank', note: null },
      ]),
    )
    expect(breakdown.balanceCents).toBe(1_000_000)
  })

  it('sin retiros el saldo no cambia', () => {
    expect(accountBalanceBreakdown(account, input(undefined)).balanceCents).toBe(1_000_000)
  })
})
