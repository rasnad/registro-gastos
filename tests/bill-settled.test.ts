import { describe, expect, it } from 'vitest'
import {
  billMonthlyView,
  billObligationBalance,
  billPaidCents,
  dashboardCommitments,
  monthObligationBalances,
  type BillOccurrenceSnapshot,
  type BillSnapshot,
  type EngineInput,
} from '@/lib/finance/engine'

const bill: BillSnapshot = {
  id: 'ute',
  name: 'UTE',
  categoryId: null,
  currency: 'UYU',
  amountType: 'RANGE',
  amountFixedCents: null,
  amountMinCents: 380_000,
  amountMaxCents: 700_000,
  sharePercent: 50,
  frequency: 'MONTHLY',
  dueDay: 5,
  paymentSource: 'ACCOUNT',
  accountId: 'bank',
  creditCardId: null,
  startDate: '2026-01-05',
  endDate: null,
  isActive: true,
}

const occurrence = (overrides: Partial<BillOccurrenceSnapshot>): BillOccurrenceSnapshot => ({
  id: 'occ',
  billId: 'ute',
  period: '2026-11',
  dueDate: '2026-11-05',
  amountMinCents: null,
  amountMaxCents: null,
  amountActualCents: null,
  status: 'PENDING',
  paidAt: null,
  accountId: null,
  currency: 'UYU',
  ...overrides,
})

function input(options: {
  occurrences?: BillOccurrenceSnapshot[]
  payments?: EngineInput['independentPayments']
} = {}): EngineInput {
  return {
    today: '2026-11-20',
    accounts: [
      {
        id: 'bank',
        name: 'Banco',
        kind: 'BANK',
        currency: 'UYU',
        openingCents: 5_000_000,
        openingDate: '2026-11-01',
        isActive: true,
      },
    ],
    cards: [],
    incomes: [],
    adjustments: [],
    expenses: [],
    installments: [],
    cardPayments: [],
    independentPayments: options.payments ?? [],
    bills: [bill],
    billOccurrences: options.occurrences ?? [],
    goals: [],
    contributions: [],
  }
}

describe('cuenta fija marcada como pagada', () => {
  const settled = input({
    occurrences: [occurrence({ status: 'PAID', amountActualCents: 300_000, paidAt: '2026-11-06' })],
  })

  it('queda saldada aunque lo abonado sea menor al mínimo estimado', () => {
    const balance = billObligationBalance(settled, bill, '2026-11')
    expect(balance.status).toBe('PAID')
    expect(balance.remainingCents).toBe(0)
    expect(balance.paidCents).toBe(300_000)
  })

  it('no deja diferencia pendiente en la vista del mes ni en el tablero', () => {
    expect(billMonthlyView(settled, '2026-11').items[0]).toMatchObject({
      status: 'PAID',
      remainingCents: 0,
      // tu parte (50%) de lo efectivamente abonado
      paidCents: 150_000,
    })
    expect(monthObligationBalances(settled, '2026-11')[0]).toMatchObject({
      status: 'PAID',
      remainingCents: 0,
    })
    expect(dashboardCommitments(settled, '2026-11', 4100).bills.remainingCents).toBe(0)
  })

  it('expone el importe realmente abonado', () => {
    expect(billPaidCents(settled, bill, '2026-11')).toBe(300_000)
  })
})

describe('cuenta fija pendiente', () => {
  it('mantiene la estimación como pendiente', () => {
    const pending = input({ occurrences: [occurrence({ amountActualCents: 480_000 })] })
    const balance = billObligationBalance(pending, bill, '2026-11')
    expect(balance.status).toBe('PENDING')
    // importe real cargado (4800) sin pagos todavía
    expect(balance.remainingCents).toBe(480_000)
    expect(billMonthlyView(pending, '2026-11').items[0]).toMatchObject({
      status: 'PENDING',
      remainingCents: 240_000,
    })
  })

  it('sin ocurrencia usa el promedio del rango para proyectar', () => {
    const empty = input()
    expect(billObligationBalance(empty, bill, '2026-11').remainingCents).toBe(540_000)
    expect(billPaidCents(empty, bill, '2026-11')).toBe(540_000)
  })
})

describe('cuenta pagada con pago registrado', () => {
  it('muestra lo abonado en vez del estimado (aunque sea mayor al promedio)', () => {
    const paid = input({
      payments: [
        {
          id: 'p1',
          obligationId: 'ute',
          obligationKind: 'BILL',
          period: '2026-11',
          currency: 'UYU',
          amountCents: 612_000,
          paidAt: '2026-11-18',
          accountId: null,
          accountAmountCents: null,
          debitAccount: false,
        },
      ],
    })
    expect(billObligationBalance(paid, bill, '2026-11').status).toBe('PAID')
    expect(billPaidCents(paid, bill, '2026-11')).toBe(612_000)
  })
})
