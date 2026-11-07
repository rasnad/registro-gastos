import { describe, expect, it } from 'vitest'
import {
  accountBalanceAt,
  upcomingPayments,
  unassignedIncomeByCurrency,
  dashboardCommitments,
  billExpectedCents,
  billsInMonth,
  buildOverview,
  computeCurrencySummary,
  planGoals,
  projectMonths,
  projectMonthsInPesos,
  type EngineInput,
} from '@/lib/finance/engine'
import { splitInstallments } from '@/lib/money'
import { statementPeriodForPurchase } from '@/lib/period'

const CARD_CLOSING = 18
const CARD_DUE = 24

function baseInput(): EngineInput {
  return {
    today: '2025-06-20',
    accounts: [
      {
        id: 'acc-uyu',
        name: 'Cuenta Itaú',
        kind: 'BANK',
        currency: 'UYU',
        openingCents: 1_000_000,
        openingDate: '2025-01-01',
        isActive: true,
      },
    ],
    cards: [
      { id: 'card-1', name: 'Itaú Visa', closingDay: CARD_CLOSING, dueDay: CARD_DUE, isActive: true },
    ],
    incomes: [
      {
        id: 'inc-1',
        description: 'Sueldo',
        amountCents: 80_000,
        currency: 'UYU',
        kind: 'FIXED',
        recurrence: 'MONTHLY',
        dayOfMonth: 1,
        startDate: '2025-01-01',
        endDate: null,
        accountId: 'acc-uyu',
        isActive: true,
      },
    ],
    adjustments: [],
    expenses: [],
    installments: [],
    cardPayments: [],
    independentPayments: [],
    bills: [],
    billOccurrences: [],
    goals: [],
    contributions: [],
  }
}

function addCardPurchase(
  input: EngineInput,
  opts: { id: string; date: string; amountCents: number; count: number; merchant?: string },
) {
  const count = opts.count
  const parts = splitInstallments(opts.amountCents, count)
  const firstPeriod = statementPeriodForPurchase(opts.date, CARD_CLOSING, CARD_DUE)
  input.expenses.push({
    id: opts.id,
    date: opts.date,
    merchant: opts.merchant ?? 'Compra tarjeta',
    amountCents: opts.amountCents,
    currency: 'UYU',
    categoryId: null,
    source: 'CREDIT_CARD',
    accountId: null,
    creditCardId: 'card-1',
    installments: count,
    origin: 'MANUAL',
    status: 'CONFIRMED',
    isEstimated: false,
  })
  for (let i = 1; i <= count; i += 1) {
    const period = statementPeriodForPurchase(opts.date, CARD_CLOSING, CARD_DUE)
    const [y, m] = period.split('-').map(Number)
    const idx = y * 12 + (m - 1) + (i - 1)
    const key = `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`
    input.installments.push({
      id: `${opts.id}-${i}`,
      expenseId: opts.id,
      cardId: 'card-1',
      number: i,
      count,
      amountCents: parts[i - 1],
      currency: 'UYU',
      period: i === 1 ? firstPeriod : key,
      dueDate: null,
      isPaid: false,
      isEstimated: false,
      expenseStatus: 'CONFIRMED',
    })
  }
}

describe('saldos', () => {
  it('suma saldo inicial, ingresos cobrados y gastos de débito', () => {
    const input = baseInput()
    input.expenses.push({
      id: 'e-1',
      date: '2025-06-10',
      merchant: 'Disco',
      amountCents: 5_000,
      currency: 'UYU',
      categoryId: null,
      source: 'ACCOUNT',
      accountId: 'acc-uyu',
      creditCardId: null,
      installments: 1,
      origin: 'MANUAL',
      status: 'CONFIRMED',
      isEstimated: false,
    })
    // 1.000.000 + 6 sueldos (80.000) − 5.000
    expect(accountBalanceAt(input.accounts[0], input)).toBe(1_475_000)
  })

  it('no descuenta del banco una compra con tarjeta', () => {
    const input = baseInput()
    addCardPurchase(input, { id: 'p1', date: '2025-06-19', amountCents: 120_000, count: 3 })
    expect(accountBalanceAt(input.accounts[0], input)).toBe(1_480_000)
    const summary = computeCurrencySummary(input, 'UYU')
    expect(summary.availableCents).toBe(1_480_000)
    expect(summary.cardDueNowCents).toBe(0)
    expect(summary.cardFutureCents).toBe(120_000)
  })

  it('considera comprometida la cuota del resumen vigente', () => {
    const input = baseInput()
    // Compra 17/jun → cierra 18/jun → vence 24/jun → período 2025-06
    addCardPurchase(input, { id: 'p1', date: '2025-06-17', amountCents: 120_000, count: 3 })
    const summary = computeCurrencySummary(input, 'UYU')
    expect(summary.cardCurrentCents).toBe(40_000)
    expect(summary.cardDueNowCents).toBe(40_000)
    expect(summary.committedCents).toBe(40_000)
    expect(summary.afterCommitmentsCents).toBe(1_480_000 - 40_000)
  })

  it('el pago del resumen descuenta el banco una sola vez y salda la obligación', () => {
    const input = baseInput()
    addCardPurchase(input, { id: 'p1', date: '2025-06-17', amountCents: 120_000, count: 3 })
    input.cardPayments.push({
      id: 'pay-1',
      creditCardId: 'card-1',
      period: '2025-06',
      amountCents: 40_000,
      currency: 'UYU',
      accountAmountCents: 40_000,
      paidAt: '2025-06-19',
      accountId: 'acc-uyu',
    })
    for (const inst of input.installments.filter((i) => i.period === '2025-06')) {
      inst.isPaid = true
    }
    expect(accountBalanceAt(input.accounts[0], input)).toBe(1_440_000)
    const summary = computeCurrencySummary(input, 'UYU')
    expect(summary.cardDueNowCents).toBe(0)
    expect(summary.committedCents).toBe(0)
    // La compra no se cuenta como gasto de consumo del mes por pagar el resumen.
    expect(summary.spentThisMonthCents).toBe(0)
  })

  it('separa monedas sin convertirlas', () => {
    const input = baseInput()
    input.accounts.push({
      id: 'acc-usd',
      name: 'Caja USD',
      kind: 'CASH',
      currency: 'USD',
      openingCents: 50_000,
      openingDate: '2025-01-01',
      isActive: true,
    })
    input.incomes.push({
      id: 'inc-usd',
      description: 'Freelance',
      amountCents: 30_000,
      currency: 'USD',
      kind: 'VARIABLE',
      recurrence: null,
      dayOfMonth: null,
      startDate: '2025-05-10',
      endDate: null,
      accountId: 'acc-usd',
      isActive: true,
    })
    const overview = buildOverview(input)
    expect(overview.summaries.UYU.availableCents).toBe(1_480_000)
    expect(overview.summaries.USD.availableCents).toBe(80_000)
    expect(overview.summaries.USD.cardDueNowCents).toBe(0)
  })
})

describe('cuentas recurrentes', () => {
  it('una cuenta pagada con tarjeta no se descuenta del banco ni se duplica', () => {
    const input = baseInput()
    input.bills.push({
      id: 'bill-1',
      name: 'Netflix',
      categoryId: null,
      currency: 'UYU',
      amountType: 'FIXED',
      amountFixedCents: 1_000,
      amountMinCents: null,
      amountMaxCents: null,
      sharePercent: 100,
      frequency: 'MONTHLY',
      dueDay: 20,
      paymentSource: 'CREDIT_CARD',
      accountId: null,
      creditCardId: 'card-1',
      startDate: '2025-01-01',
      endDate: null,
      isActive: true,
    })
    // La cuenta de mayo (vence 20/may) cierra el 18/jun: se paga en el resumen de junio.
    // La de junio (vence 20/jun) se imputa al resumen de julio.
    const june = computeCurrencySummary(input, 'UYU')
    expect(june.billsDueNowCents).toBe(0)
    expect(june.cardDueNowCents).toBe(1_000)
    expect(accountBalanceAt(input.accounts[0], input)).toBe(1_480_000)
    const july = projectMonths(input, 'UYU', 3).find((f) => f.period === '2025-07')!
    expect(july.cardCents).toBe(1_000)
    expect(july.billsCents).toBe(0)
  })

  it('proyecta rangos de cuentas variables sin presentarlos como exactos', () => {
    const input = baseInput()
    input.bills.push({
      id: 'bill-2',
      name: 'UTE',
      categoryId: null,
      currency: 'UYU',
      amountType: 'RANGE',
      amountFixedCents: null,
      amountMinCents: 2_000,
      amountMaxCents: 4_000,
      sharePercent: 100,
      frequency: 'MONTHLY',
      dueDay: 25,
      paymentSource: 'ACCOUNT',
      accountId: 'acc-uyu',
      creditCardId: null,
      startDate: '2025-01-01',
      endDate: null,
      isActive: true,
    })
    const july = projectMonths(input, 'UYU', 3).find((f) => f.period === '2025-07')!
    expect(july.billsCents).toBe(3_000)
    expect(july.billsMinCents).toBe(2_000)
    expect(july.billsMaxCents).toBe(4_000)
    expect(july.endMinCents).toBeLessThan(july.endCents)
    expect(july.endMaxCents).toBeGreaterThan(july.endCents)
    expect(july.missing.join(' ')).toMatch(/UTE/)
  })
})

describe('proyección mensual', () => {
  it('usa el saldo real para el mes en curso y no vuelve a restar lo ya gastado', () => {
    const input = baseInput()
    input.expenses.push({
      id: 'e-1',
      date: '2025-06-10',
      merchant: 'Disco',
      amountCents: 5_000,
      currency: 'UYU',
      categoryId: null,
      source: 'ACCOUNT',
      accountId: 'acc-uyu',
      creditCardId: null,
      installments: 1,
      origin: 'MANUAL',
      status: 'CONFIRMED',
      isEstimated: false,
    })
    addCardPurchase(input, { id: 'p1', date: '2025-06-17', amountCents: 120_000, count: 3 })
    const flows = projectMonths(input, 'UYU', 3)
    const june = flows[0]
    expect(june.startCents).toBe(1_475_000)
    // El sueldo del día 1 ya está cobrado; sólo falta la cuota de junio.
    expect(june.incomeCents).toBe(0)
    expect(june.cardCents).toBe(40_000)
    expect(june.endCents).toBe(1_435_000)

    const july = flows[1]
    expect(july.startCents).toBe(1_435_000)
    expect(july.incomeCents).toBe(80_000)
    expect(july.cardCents).toBe(40_000)
    expect(july.endCents).toBe(1_475_000)
  })
})

describe('objetivos de ahorro', () => {
  it('no asigna el mismo dinero dos veces y respeta prioridad', () => {
    const input = baseInput()
    input.goals.push(
      {
        id: 'g1',
        name: 'Fondo de emergencia',
        currency: 'UYU',
        targetCents: 90_000,
        targetDate: '2025-09-30',
        monthlyTargetCents: 30_000,
        priority: 1,
        isActive: true,
      },
      {
        id: 'g2',
        name: 'Viaje',
        currency: 'UYU',
        targetCents: 500_000,
        targetDate: '2025-09-30',
        monthlyTargetCents: 70_000,
        priority: 2,
        isActive: true,
      },
    )
    const projections = {
      UYU: projectMonths(input, 'UYU', 6),
      USD: projectMonths(input, 'USD', 6),
    }
    const plans = planGoals(input, projections)
    const fondo = plans.find((p) => p.goalId === 'g1')!
    const viaje = plans.find((p) => p.goalId === 'g2')!
    expect(fondo.feasible).toBe(true)
    // El margen libre es 80.000; el fondo toma 30.000 y el viaje sólo 50.000.
    expect(fondo.requiredMonthlyCents).toBe(22_500)
    expect(fondo.allocatedMonthlyCents).toBe(fondo.requiredMonthlyCents)
    expect(viaje.allocatedMonthlyCents).toBeLessThan(viaje.requiredMonthlyCents)
    expect(viaje.feasible).toBe(false)
    expect(viaje.shortfallCents).toBeGreaterThan(0)
  })

  it('calcula cuánto falta y si el objetivo es alcanzable', () => {
    const input = baseInput()
    input.goals.push({
      id: 'g1',
      name: 'Notebook',
      currency: 'UYU',
      targetCents: 100_000,
      targetDate: '2025-08-31',
      monthlyTargetCents: null,
      priority: 1,
      isActive: true,
    })
    input.contributions.push({
      id: 'c1',
      goalId: 'g1',
      date: '2025-06-01',
      amountCents: 20_000,
      currency: 'UYU',
      accountId: 'acc-uyu',
    })
    const plans = planGoals(input, {
      UYU: projectMonths(input, 'UYU', 6),
      USD: projectMonths(input, 'USD', 6),
    })
    const plan = plans[0]
    expect(plan.savedCents).toBe(20_000)
    expect(plan.remainingCents).toBe(80_000)
    expect(plan.monthsLeft).toBe(3)
    expect(plan.requiredMonthlyCents).toBe(26_667)
  })
})

describe('resumen general', () => {
  it('marca datos faltantes en lugar de inventar cifras', () => {
    const input = baseInput()
    input.incomes = []
    // Sin saldo inicial ni ingresos no hay con qué proyectar.
    input.accounts[0].openingCents = 0
    const summary = computeCurrencySummary(input, 'UYU')
    expect(summary.incomeThisMonthCents).toBe(0)
    expect(summary.missing.join(' ')).toMatch(/ingresos/i)
  })

  it('expone la proyección por separado para cada moneda', () => {
    const overview = buildOverview(baseInput())
    expect(overview.projections.UYU).toHaveLength(6)
    expect(overview.projections.USD.every((f) => f.startCents === 0)).toBe(true)
    expect(overview.currentMonth).toBe('2025-06')
  })
})

describe('regresión: cuentas con tarjeta y pagos de resumen', () => {
  it('el cargo de una cuenta con tarjeta desaparece cuando el resumen se paga', () => {
    const input = baseInput()
    input.bills.push({
      id: 'bill-card',
      name: 'Netflix',
      categoryId: null,
      currency: 'UYU',
      amountType: 'FIXED',
      amountFixedCents: 1_000,
      amountMinCents: null,
      amountMaxCents: null,
      sharePercent: 100,
      frequency: 'MONTHLY',
      dueDay: 20,
      paymentSource: 'CREDIT_CARD',
      accountId: null,
      creditCardId: 'card-1',
      startDate: '2025-01-01',
      endDate: null,
      isActive: true,
    })
    // El resumen de junio incluye el cargo de mayo.
    expect(computeCurrencySummary(input, 'UYU').cardDueNowCents).toBe(1_000)

    input.cardPayments.push({
      id: 'pay-june',
      creditCardId: 'card-1',
      period: '2025-06',
      amountCents: 1_000,
      currency: 'UYU',
      accountAmountCents: 1_000,
      paidAt: '2025-06-20',
      accountId: 'acc-uyu',
    })
    expect(computeCurrencySummary(input, 'UYU').cardDueNowCents).toBe(0)
  })

  it('usa el día de cobro configurado y no el día de inicio del ingreso', () => {
    const input = baseInput()
    input.today = '2025-06-03'
    input.incomes[0].startDate = '2025-01-01'
    input.incomes[0].dayOfMonth = 5
    // Enero a mayo: 5 cobros. Junio todavía no llegó.
    expect(accountBalanceAt(input.accounts[0], input)).toBe(1_000_000 + 5 * 80_000)
  })
})

describe('pago de resumen en dólares desde una cuenta en pesos', () => {
  it('debita el equivalente en pesos y no el importe en dólares', () => {
    const input = baseInput()
    input.expenses.push({
      id: 'usd-1',
      date: '2025-06-17',
      merchant: 'OPENAI',
      amountCents: 10_000,
      currency: 'USD',
      categoryId: null,
      source: 'CREDIT_CARD',
      accountId: null,
      creditCardId: 'card-1',
      installments: 1,
      origin: 'MANUAL',
      status: 'CONFIRMED',
      isEstimated: false,
    })
    input.installments.push({
      id: 'usd-inst-1',
      expenseId: 'usd-1',
      cardId: 'card-1',
      number: 1,
      count: 1,
      amountCents: 10_000,
      currency: 'USD',
      period: '2025-06',
      dueDate: null,
      isPaid: false,
      isEstimated: false,
      expenseStatus: 'CONFIRMED',
    })

    // US$ 100 a $U 41 = $U 4.100 (410.000 centavos)
    input.cardPayments.push({
      id: 'pay-usd',
      creditCardId: 'card-1',
      period: '2025-06',
      amountCents: 10_000,
      currency: 'USD',
      accountAmountCents: 410_000,
      paidAt: '2025-06-20',
      accountId: 'acc-uyu',
    })
    input.installments[0].isPaid = true

    expect(accountBalanceAt(input.accounts[0], input)).toBe(1_480_000 - 410_000)
    expect(computeCurrencySummary(input, 'USD').cardDueNowCents).toBe(0)
    // La cuenta en pesos no queda con una deuda de US$ 100.
    expect(computeCurrencySummary(input, 'UYU').cardDueNowCents).toBe(0)
  })

  it('sin importe de cuenta usa el importe original (pago en la misma moneda)', () => {
    const input = baseInput()
    input.cardPayments.push({
      id: 'pay-uyu',
      creditCardId: 'card-1',
      period: '2025-06',
      amountCents: 40_000,
      currency: 'UYU',
      accountAmountCents: null,
      paidAt: '2025-06-20',
      accountId: 'acc-uyu',
    })
    expect(accountBalanceAt(input.accounts[0], input)).toBe(1_480_000 - 40_000)
  })
})


describe('gastos compartidos: porcentaje de la cuenta', () => {
  function billWithShare(sharePercent: number) {
    return {
      id: 'share-bill',
      name: 'Alquiler',
      categoryId: null,
      currency: 'UYU' as const,
      amountType: 'FIXED' as const,
      amountFixedCents: 480_000,
      amountMinCents: null,
      amountMaxCents: null,
      sharePercent,
      frequency: 'MONTHLY',
      dueDay: 5,
      paymentSource: 'ACCOUNT' as const,
      accountId: 'acc-uyu',
      creditCardId: null,
      startDate: '2025-01-01',
      endDate: null,
      isActive: true,
    }
  }

  it('el importe que impacta es el total por el porcentaje', () => {
    expect(billExpectedCents(billWithShare(50))).toBe(240_000)
    expect(billExpectedCents(billWithShare(100))).toBe(480_000)
    expect(billExpectedCents(billWithShare(33))).toBe(158_400)
  })

  it('el saldo descuenta sólo la parte del usuario al pagar la cuenta', () => {
    const input = baseInput()
    const bill = billWithShare(25)
    input.bills.push(bill)
    input.billOccurrences.push({
      id: 'occ-1',
      billId: bill.id,
      period: '2025-06',
      dueDate: '2025-06-05',
      amountMinCents: null,
      amountMaxCents: null,
      amountActualCents: 480_000,
      status: 'PAID',
      paidAt: '2025-06-05',
      accountId: 'acc-uyu',
      currency: 'UYU',
    })
    expect(accountBalanceAt(input.accounts[0], input)).toBe(1_480_000 - 120_000)
  })

  it('la proyección y los compromisos usan la parte del usuario', () => {
    const input = baseInput()
    input.bills.push(billWithShare(50))
    const june = billsInMonth(input, '2025-06')
    expect(june[0].expectedCents).toBe(240_000)
    expect(june[0].minCents).toBe(240_000)
    expect(june[0].maxCents).toBe(240_000)

    const flow = projectMonths(input, 'UYU', 3).find((item) => item.period === '2025-06')!
    expect(flow.billsCents).toBe(240_000)
  })
})


describe('pagos independientes en saldos bancarios', () => {
  it('refleja altas, múltiples pagos, edición y eliminación sin duplicar el mismo registro', () => {
    const input = baseInput()
    input.incomes = []
    const account = input.accounts[0]
    const payment = { id: 'p1', obligationId: 'card-1', amountCents: 25000, accountAmountCents: 25000, accountId: account.id, paidAt: '2025-06-10', debitAccount: true }
    input.independentPayments = [payment]
    expect(accountBalanceAt(account, input)).toBe(975000)
    input.independentPayments.push({...payment, id: 'p2', amountCents: 15000, accountAmountCents: 15000}, payment)
    expect(accountBalanceAt(account, input)).toBe(960000)
    input.independentPayments = [{...payment, amountCents: 10000, accountAmountCents: 10000}, input.independentPayments[1]]
    expect(accountBalanceAt(account, input)).toBe(975000)
    input.independentPayments = [input.independentPayments[1]]
    expect(accountBalanceAt(account, input)).toBe(985000)
  })
  it('usa el débito guardado en la moneda de cada cuenta y conserva ajustes', () => {
    const input = baseInput()
    input.incomes = []
    const uyu = input.accounts[0]
    const usd = {...uyu, id:'usd', currency:'USD' as const, openingCents: 100000}
    input.accounts.push(usd)
    input.adjustments.push({id:'a',accountId:uyu.id,date:'2025-06-01',deltaCents:5000,currency:'UYU',reason:'Conciliación'})
    input.independentPayments = [
      {id:'p1', obligationId:'card-1', amountCents:1000, accountAmountCents:41000, accountId:uyu.id, paidAt:'2025-06-10', debitAccount:true},
      {id:'p2', obligationId:'bill', amountCents:2000, accountAmountCents:2000, accountId:usd.id, paidAt:'2025-06-10', debitAccount:true},
      {id:'p3', obligationId:'bill', amountCents:500, accountAmountCents:500, accountId:usd.id, paidAt:'2025-06-10', debitAccount:false},
      {id:'p4', obligationId:'bill', amountCents:500, accountAmountCents:500, accountId:usd.id, paidAt:'2025-06-21', debitAccount:true},
    ]
    expect(accountBalanceAt(uyu, input)).toBe(964000)
    expect(accountBalanceAt(usd, input)).toBe(98000)
    expect(accountBalanceAt(usd, input, '2025-06-21')).toBe(97500)
  })
})


describe('disponible del tablero con pagos reales', () => {
  it('agrupa tarjetas y cuentas, convierte dólares y separa mes, moneda y tipo', () => {
    const input = baseInput(); input.incomes = []
    input.cards.push({...input.cards[0], id:'card-2'})
    const bill = {id:'bill', name:'Luz', categoryId:null, currency:'UYU' as const, amountType:'FIXED' as const, amountFixedCents:10000, amountMinCents:null, amountMaxCents:null, sharePercent:100, frequency:'MONTHLY', dueDay:10, paymentSource:'ACCOUNT' as const, accountId:null, creditCardId:null, startDate:'2025-01-01', endDate:null, isActive:true}
    input.bills.push(bill, {...bill, id:'bill-2', amountFixedCents:5000})
    const statements = [{cardId:'card-1', period:'2025-06', currency:'UYU' as const, totalCents:20000}, {cardId:'card-2', period:'2025-06', currency:'USD' as const, totalCents:1000}, {cardId:'card-1', period:'2025-07', currency:'UYU' as const, totalCents:90000}]
    const first = dashboardCommitments(input, '2025-06', 4100, statements)
    expect(first.cards.totalCents).toBe(61000)
    expect(first.bills.totalCents).toBe(15000)
    expect(first.availableAfterCommitmentsCents).toBe(924000)
    const pay = {id:'p1', obligationId:'card-1', obligationKind:'CARD' as const, period:'2025-06', currency:'UYU' as const, amountCents:5000, accountAmountCents:5000, accountId:'acc-uyu', paidAt:'2025-06-10', debitAccount:true}
    input.independentPayments = [pay, pay, {...pay,id:'p2', obligationId:'bill', obligationKind:'BILL',amountCents:10000,accountAmountCents:10000}, {...pay,id:'p3',period:'2025-07',accountId:null,accountAmountCents:null}]
    const partial = dashboardCommitments(input, '2025-06', 4100, statements)
    expect(partial.cards.status).toBe('PARTIAL')
    expect(partial.bills.status).toBe('PARTIAL')
    expect(partial.availableAfterCommitmentsCents).toBe(924000)
    expect(dashboardCommitments(input,'2025-07',4100,statements).cards.remainingCents).toBe(85000)
    input.independentPayments = [ {...pay,amountCents:20000,accountAmountCents:20000}, {...pay,id:'usd',obligationId:'card-2',currency:'USD',amountCents:1000,accountAmountCents:41000}, {...pay,id:'b1',obligationId:'bill',obligationKind:'BILL',amountCents:10000,accountAmountCents:10000}, {...pay,id:'b2',obligationId:'bill-2',obligationKind:'BILL',amountCents:5000,accountAmountCents:5000} ]
    const complete = dashboardCommitments(input,'2025-06',4100,statements)
    expect(complete.cards.status).toBe('PAID'); expect(complete.bills.status).toBe('PAID')
    expect(complete.availableAfterCommitmentsCents).toBe(complete.currentBalanceUyuCents)
  })
  it('reconoce pagos históricos y no suma resumen importado y cuotas dos veces', () => {
    const input = baseInput(); input.incomes = []
    addCardPurchase(input, {id:'purchase',date:'2025-06-01',amountCents:20000,count:1})
    input.cardPayments.push({id:'old',creditCardId:'card-1',period:'2025-06',currency:'UYU',amountCents:10000,accountAmountCents:10000,paidAt:'2025-06-10',accountId:'acc-uyu'})
    const result = dashboardCommitments(input,'2025-06',4100,[{cardId:'card-1',period:'2025-06',currency:'UYU',totalCents:15000}])
    expect(result.cards.totalCents).toBe(15000)
    expect(result.cards.remainingCents).toBe(5000)
    expect(result.availableAfterCommitmentsCents).toBe(985000)
    expect(result.warnings).toEqual([])
  })
})


describe('ingresos sin cuenta y próximos pagos', () => {
  it('muestra el ingreso recibido en su moneda sin sumarlo a una cuenta de otra moneda', () => {
    const input = baseInput()
    input.incomes = [{...input.incomes[0], id:'airbnb',currency:'USD',amountCents:15100,recurrence:null,startDate:'2025-06-20',accountId:null}]
    expect(unassignedIncomeByCurrency(input)).toEqual({UYU:0,USD:15100})
    expect(accountBalanceAt(input.accounts[0],input)).toBe(1000000)
    expect(unassignedIncomeByCurrency({...input,today:'2025-06-19'}).USD).toBe(0)
  })
  it('omite resúmenes de meses anteriores y ordena obligaciones vigentes por vencimiento', () => {
    const input = baseInput()
    addCardPurchase(input,{id:'old',date:'2025-02-01',amountCents:21900,count:1})
    addCardPurchase(input,{id:'current',date:'2025-06-01',amountCents:30000,count:1})
    input.bills.push({id:'bill',name:'Luz',categoryId:null,currency:'UYU',amountType:'FIXED',amountFixedCents:10000,amountMinCents:null,amountMaxCents:null,sharePercent:100,frequency:'MONTHLY',dueDay:10,paymentSource:'ACCOUNT',accountId:null,creditCardId:null,startDate:'2025-06-01',endDate:null,isActive:true})
    const items=upcomingPayments(input)
    expect(items.some(item=>item.subtitle.includes('2025-02'))).toBe(false)
    expect(items[0]).toMatchObject({kind:'BILL',dueDate:'2025-06-10'})
    expect(items[1]).toMatchObject({kind:'CARD',dueDate:'2025-06-24'})
  })
})


describe('proyección de movimientos de hoy', () => {
  it('incluye el ingreso de hoy una sola vez en el saldo proyectado', () => {
    const input=baseInput(); input.incomes=[{...input.incomes[0],id:'hoy',amountCents:620000,recurrence:null,startDate:input.today}]
    const flow=projectMonths(input,'UYU',1)[0]
    expect(flow.startCents).toBe(1620000)
    expect(flow.incomeCents).toBe(0)
    expect(flow.endCents).toBe(1620000)
  })
  it('incluye el gasto de hoy una sola vez en el saldo proyectado', () => {
    const input=baseInput(); input.incomes=[]
    input.expenses.push({id:'today',date:input.today,merchant:'Test',amountCents:10000,currency:'UYU',categoryId:null,source:'ACCOUNT',accountId:'acc-uyu',creditCardId:null,installments:1,origin:'MANUAL',status:'CONFIRMED',isEstimated:false})
    const flow=projectMonths(input,'UYU',1)[0]
    expect(flow.startCents).toBe(990000)
    expect(flow.otherExpensesCents).toBe(0)
    expect(flow.endCents).toBe(990000)
  })
})


describe('ahorro programado en la proyección', () => {
  it('descuenta el importe mensual solamente cuando está activado', () => {
    const input = baseInput()
    input.goals.push({id:'goal',name:'Meta',currency:'UYU',targetCents:1000000,targetDate:'2026-12-01',monthlyTargetCents:25000,priority:1,isActive:true})
    const enabled = projectMonths(input,'UYU',1,{includeSavings:true})[0]
    const disabled = projectMonths(input,'UYU',1,{includeSavings:false})[0]
    expect(enabled.savingsCents).toBe(25000)
    expect(disabled.savingsCents).toBe(0)
    expect(disabled.endCents - enabled.endCents).toBe(25000)
  })
})


describe('proyección consolidada en pesos', () => {
  it('incluye resúmenes USD futuros al tipo de cambio y mantiene la continuidad mensual', () => {
    const input=baseInput();input.incomes=[]
    input.statementTotals=[{cardId:'card-1',period:'2025-06',currency:'USD',totalCents:10000},{cardId:'card-1',period:'2025-07',currency:'USD',totalCents:5000}]
    const flows=projectMonthsInPesos(input,4100,2)
    expect(flows[0].cardCents).toBe(410000)
    expect(flows[0].endCents).toBe(590000)
    expect(flows[1].startCents).toBe(590000)
    expect(flows[1].cardCents).toBe(205000)
    expect(flows[1].endCents).toBe(385000)
    expect(input.statementTotals[0].totalCents).toBe(10000)
  })
  it('reconoce un pago parcial en USD debitado en pesos sin restarlo dos veces', () => {
    const input=baseInput();input.incomes=[]
    input.statementTotals=[{cardId:'card-1',period:'2025-06',currency:'USD',totalCents:10000}]
    input.independentPayments=[{id:'payment',obligationId:'card-1',obligationKind:'CARD',period:'2025-06',currency:'USD',amountCents:4000,accountAmountCents:164000,accountId:'acc-uyu',paidAt:'2025-06-20',debitAccount:true}]
    const flow=projectMonthsInPesos(input,4100,1)[0]
    expect(flow.startCents).toBe(836000)
    expect(flow.cardCents).toBe(246000)
    expect(flow.endCents).toBe(590000)
  })
  it('convierte saldo en dólares, ingresos y rangos variables sin alterar los datos originales', () => {
    const input=baseInput(); input.incomes=[]
    input.accounts.push({...input.accounts[0],id:'usd-account',currency:'USD',openingCents:10000})
    input.incomes.push({id:'income-usd',description:'USD',amountCents:5000,currency:'USD',kind:'FIXED',recurrence:null,dayOfMonth:null,startDate:'2025-06-25',endDate:null,accountId:'usd-account',isActive:true})
    input.bills.push({id:'usd-bill',name:'USD',categoryId:null,currency:'USD',amountType:'RANGE',amountFixedCents:null,amountMinCents:1000,amountMaxCents:3000,sharePercent:100,frequency:'MONTHLY',dueDay:20,paymentSource:'ACCOUNT',accountId:'usd-account',creditCardId:null,startDate:'2025-06-01',endDate:null,isActive:true})
    const flow=projectMonthsInPesos(input,4100,1)[0]
    expect(flow.startCents).toBe(1410000)
    expect(flow.incomeCents).toBe(205000)
    expect(flow.billsCents).toBe(82000)
    expect(flow.billsMinCents).toBe(41000)
    expect(flow.billsMaxCents).toBe(123000)
    expect(flow.endCents).toBe(1533000)
    expect(flow.endMinCents).toBe(1492000)
    expect(flow.endMaxCents).toBe(1574000)
  })
  it('respeta la opción de ahorro y rechaza una cotización inválida', () => {
    const input=baseInput();input.incomes=[]
    input.goals.push({id:'usd-goal',name:'Meta',currency:'USD',targetCents:100000,targetDate:'2026-12-01',monthlyTargetCents:1000,priority:1,isActive:true})
    expect(projectMonthsInPesos(input,4100,1,{includeSavings:true})[0].savingsCents).toBe(41000)
    expect(projectMonthsInPesos(input,4100,1,{includeSavings:false})[0].savingsCents).toBe(0)
    expect(()=>projectMonthsInPesos(input,0,1)).toThrow(RangeError)
  })
})
