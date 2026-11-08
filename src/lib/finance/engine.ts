import { paymentDebits, monthlyCommitments, obligationBalance, type IndependentPayment } from '@/lib/finance/obligations'
/**
 * Motor de cálculo financiero (puro, sin Prisma ni React).
 *
 * Reglas contables que implementa:
 *  1. Compra con tarjeta ⇒ obligación (cuota). No toca el saldo bancario.
 *  2. Pago del resumen ⇒ descuenta la cuenta y salda cuotas. No es consumo.
 *  3. Cuenta pagada con tarjeta ⇒ se descuenta como cuenta en el mes del resumen,
 *     nunca del banco directamente y nunca dos veces.
 *  4. Compras en cuotas ⇒ se imputan por período (mes de vencimiento del resumen),
 *     no todas en el mes de compra.
 *  5. Sin conversión de moneda: cada moneda se calcula por separado.
 */

import {
  addMonthsKey,
  countOccurrences,
  dateInMonth,
  isRecurringInPeriod,
  monthKeyOf,
  monthRange,
  monthsBetween,
  nextMonths,
  recurrenceStepMonths,
  statementPeriodForPurchase,
  statementDueDate,
  type ISODate,
  type MonthKey,
} from '@/lib/period'
import { clampZero, sumCents, toCents, convertUsdToUyu } from '@/lib/money'

export type CurrencyCode = 'UYU' | 'USD'
export type PaymentSource = 'ACCOUNT' | 'CREDIT_CARD'
export type ExpenseStatus = 'CONFIRMED' | 'NEEDS_REVIEW' | 'DISCARDED'

export type AccountSnapshot = {
  id: string
  name: string
  kind: 'BANK' | 'CASH' | 'WALLET'
  currency: CurrencyCode
  openingCents: number
  openingDate: ISODate
  isActive: boolean
}

export type CardSnapshot = {
  id: string
  name: string
  closingDay: number
  dueDay: number
  isActive: boolean
}

export type IncomeSnapshot = {
  id: string
  description: string
  amountCents: number
  currency: CurrencyCode
  kind: 'FIXED' | 'VARIABLE'
  recurrence: string | null
  dayOfMonth: number | null
  startDate: ISODate
  endDate: ISODate | null
  accountId: string | null
  isActive: boolean
}

export type AdjustmentSnapshot = {
  id: string
  accountId: string
  date: ISODate
  deltaCents: number
  currency: CurrencyCode
  reason: string
}

export type ExpenseSnapshot = {
  id: string
  date: ISODate
  merchant: string
  amountCents: number
  currency: CurrencyCode
  categoryId: string | null
  source: PaymentSource
  accountId: string | null
  creditCardId: string | null
  installments: number
  origin: 'MANUAL' | 'EMAIL' | 'STATEMENT'
  status: ExpenseStatus
  isEstimated: boolean
}

export type InstallmentSnapshot = {
  id: string
  expenseId: string
  cardId: string | null
  number: number
  count: number
  amountCents: number
  currency: CurrencyCode
  period: MonthKey
  dueDate: ISODate | null
  isPaid: boolean
  isEstimated: boolean
  expenseStatus: ExpenseStatus
}

export type CardPaymentSnapshot = {
  id: string
  creditCardId: string
  period: MonthKey
  amountCents: number
  currency: CurrencyCode
  /** Importe debitado de la cuenta, en la moneda de la cuenta. */
  accountAmountCents: number | null
  paidAt: ISODate
  accountId: string | null
}

export type BillSnapshot = {
  id: string
  name: string
  categoryId: string | null
  currency: CurrencyCode
  amountType: 'FIXED' | 'RANGE'
  amountFixedCents: number | null
  amountMinCents: number | null
  amountMaxCents: number | null
  sharePercent: number
  frequency: string
  dueDay: number
  paymentSource: PaymentSource
  accountId: string | null
  creditCardId: string | null
  startDate: ISODate
  endDate: ISODate | null
  isActive: boolean
}

export type BillOccurrenceSnapshot = {
  id: string
  billId: string
  period: MonthKey
  dueDate: ISODate
  amountMinCents: number | null
  amountMaxCents: number | null
  amountActualCents: number | null
  status: 'PENDING' | 'PAID'
  paidAt: ISODate | null
  accountId: string | null
  currency: CurrencyCode
}

export type GoalSnapshot = {
  id: string
  name: string
  currency: CurrencyCode
  targetCents: number
  targetDate: ISODate
  monthlyTargetCents: number | null
  priority: number
  isActive: boolean
}

export type ContributionSnapshot = {
  id: string
  goalId: string
  date: ISODate
  amountCents: number
  currency: CurrencyCode
  accountId: string | null
}

export type EngineInput = {
  today: ISODate
  accounts: AccountSnapshot[]
  cards: CardSnapshot[]
  incomes: IncomeSnapshot[]
  adjustments: AdjustmentSnapshot[]
  expenses: ExpenseSnapshot[]
  installments: InstallmentSnapshot[]
  cardPayments: CardPaymentSnapshot[]
  statementTotals?: StatementTotal[]
  independentPayments: IndependentPayment[]
  bills: BillSnapshot[]
  billOccurrences: BillOccurrenceSnapshot[]
  goals: GoalSnapshot[]
  contributions: ContributionSnapshot[]
}

function currentOf(input: EngineInput): MonthKey {
  return input.today.slice(0, 7)
}

/** Un ingreso sin recurrencia es una sola vez: sólo cuenta en su mes. */
export function incomeActiveInPeriod(income: IncomeSnapshot, period: MonthKey): boolean {
  if (!income.isActive) return false
  if (!income.recurrence) return monthKeyOf(income.startDate) === period
  return isRecurringInPeriod(income.startDate, income.endDate, period, recurrenceStepMonths(income.recurrence))
}

/* ------------------------------------------------------------------ */
/* Saldos                                                              */
/* ------------------------------------------------------------------ */

function activeExpenses(input: EngineInput): ExpenseSnapshot[] {
  return input.expenses.filter((e) => e.status !== 'DISCARDED')
}

/** Ingresos ya percibidos entre dos fechas (para saldo histórico). */
export function incomeReceivedUntil(income: IncomeSnapshot, asOf: ISODate): number {
  if (income.startDate > asOf) return 0
  const step = recurrenceStepMonths(income.recurrence)
  if (income.recurrence) {
    return income.amountCents * countOccurrences(income.startDate, asOf, step, income.endDate, income.dayOfMonth)
  }
  return income.amountCents
}

/** Aplica el porcentaje que te corresponde a un importe total. */
export function applyShare(cents: number, sharePercent: number): number {
  const percent = Math.min(100, Math.max(0, sharePercent ?? 100))
  return Math.round((cents * percent) / 100)
}

/** Importe total cargado (sin aplicar el porcentaje). */
export function billTotalCents(
  bill: BillSnapshot,
  occurrence?: BillOccurrenceSnapshot | null,
): number {
  if (occurrence?.amountActualCents != null) return occurrence.amountActualCents
  if (bill.amountType === 'FIXED') return bill.amountFixedCents ?? 0
  const min = occurrence?.amountMinCents ?? bill.amountMinCents ?? 0
  const max = occurrence?.amountMaxCents ?? bill.amountMaxCents ?? min
  return Math.round((min + max) / 2)
}

/** Importe que impacta tu saldo (total × porcentaje). */
export function billExpectedCents(
  bill: BillSnapshot,
  occurrence?: BillOccurrenceSnapshot | null,
): number {
  return applyShare(billTotalCents(bill, occurrence), bill.sharePercent)
}

export function billRangeCents(
  bill: BillSnapshot,
  occurrence?: BillOccurrenceSnapshot | null,
): { min: number; max: number; exact: boolean } {
  if (occurrence?.amountActualCents != null) {
    return { min: occurrence.amountActualCents, max: occurrence.amountActualCents, exact: true }
  }
  if (bill.amountType === 'FIXED') {
    const value = bill.amountFixedCents ?? 0
    return { min: value, max: value, exact: true }
  }
  const min = occurrence?.amountMinCents ?? bill.amountMinCents ?? 0
  const max = occurrence?.amountMaxCents ?? bill.amountMaxCents ?? min
  return { min, max, exact: false }
}

/** Un solo registro de pagos para saldos, obligaciones y pantallas. Las fuentes conservan sus IDs. */
export function obligationPayments(input: EngineInput): IndependentPayment[] {
  const payments: IndependentPayment[] = [
    ...input.independentPayments,
    ...input.cardPayments.map(p => ({...p, id:`legacy-card:${p.id}`, obligationId:p.creditCardId,
      obligationKind:'CARD' as const, debitAccount:true,
      accountAmountCents:p.accountAmountCents ?? (input.accounts.find(a => a.id === p.accountId)?.currency === p.currency ? p.amountCents : null),
    })),
    ...input.billOccurrences.filter(o => o.status === 'PAID' && o.paidAt && input.bills.some(b => b.id === o.billId && b.paymentSource === 'ACCOUNT')).map(o => {
      const bill = input.bills.find(b => b.id === o.billId)!
      return {id:`legacy-bill:${o.id}`, obligationId:o.billId, obligationKind:'BILL' as const, period:o.period,
        currency:o.currency, amountCents:billTotalCents(bill,o), accountAmountCents:billExpectedCents(bill,o),
        accountId:o.accountId, paidAt:o.paidAt!, debitAccount:true}
    }),
  ]
  return [...new Map(payments.map(p => [p.id,p])).values()]
}

export function accountBalanceBreakdown(account: AccountSnapshot, input: EngineInput, asOf = input.today) {
  const incomeCents = sumCents(input.incomes.filter(i => i.accountId === account.id).map(i => incomeReceivedUntil(i,asOf)))
  const adjustmentCents = sumCents(input.adjustments.filter(a => a.accountId === account.id && a.date <= asOf).map(a => a.deltaCents))
  const expenseCents = sumCents(activeExpenses(input).filter(e => e.source === 'ACCOUNT' && e.accountId === account.id && e.date <= asOf).map(e => e.amountCents))
  const payments = obligationPayments(input)
  const cardPaymentCents = paymentDebits(payments.filter(p => p.obligationKind !== 'BILL'),account.id,asOf)
  const billPaymentCents = paymentDebits(payments.filter(p => p.obligationKind === 'BILL'),account.id,asOf)
  const contributionCents = sumCents(input.contributions.filter(c => c.accountId === account.id && c.date <= asOf).map(c => c.amountCents))
  return {openingCents:account.openingCents,incomeCents,adjustmentCents,expenseCents,cardPaymentCents,billPaymentCents,contributionCents,
    balanceCents:account.openingCents+incomeCents+adjustmentCents-expenseCents-cardPaymentCents-billPaymentCents-contributionCents}
}

/** Ingresos recibidos aún sin asociar a una cuenta, separados por moneda. */
export function unassignedIncomeByCurrency(input: EngineInput): Record<CurrencyCode,number> {
  const received = input.incomes.filter(i => i.accountId === null && i.isActive)
  return {
    UYU: sumCents(received.filter(i => i.currency === 'UYU').map(i => incomeReceivedUntil(i,input.today))),
    USD: sumCents(received.filter(i => i.currency === 'USD').map(i => incomeReceivedUntil(i,input.today))),
  }
}

export type PaidBillHistoryItem = { billId: string; name: string; currency: CurrencyCode; period: string; amountCents: number }

/** Histórico de obligaciones efectivamente saldadas, sin incorporar importes estimados como gastos. */
export function paidBillHistory(input: EngineInput): { items: PaidBillHistoryItem[]; ambiguousCount: number } {
  const payments = obligationPayments(input).filter(p => p.obligationKind === 'BILL' && p.period && p.currency && p.paidAt <= input.today && p.period <= input.today.slice(0,7))
  const keys = new Set(payments.map(p => `${p.obligationId}|${p.period}|${p.currency}`))
  const items: PaidBillHistoryItem[] = []
  let ambiguousCount = 0
  for (const key of keys) {
    const [billId, period, currency] = key.split('|')
    const bill = input.bills.find(b => b.id === billId && b.currency === currency && b.paymentSource === 'ACCOUNT')
    if (!bill) continue
    const rows = payments.filter(p => p.obligationId === billId && p.period === period && p.currency === currency)
    const legacy = rows.some(p => p.id.startsWith('legacy-bill:'))
    const modern = rows.some(p => !p.id.startsWith('legacy-bill:'))
    // Sin vínculo entre las fuentes no se puede saber si representan el mismo pago.
    if (legacy && modern) { ambiguousCount++; continue }
    const occurrence = input.billOccurrences.find(o => o.billId === bill.id && o.period === period)
    const balance = billObligationBalance(input,bill,period,occurrence)
    if (!legacy && balance.status !== 'PAID') continue
    const amountCents = applyShare(sumCents(rows.map(p => p.amountCents)),bill.sharePercent)
    if (amountCents <= 0) continue
    items.push({billId,name:bill.name,currency:bill.currency,period,amountCents})
  }
  // Cuentas a tarjeta solo cuando existe importe real y su resumen está saldado.
  for (const occurrence of input.billOccurrences) {
    const bill = input.bills.find(b => b.id === occurrence.billId && b.paymentSource === 'CREDIT_CARD')
    if (!bill?.creditCardId || occurrence.status !== 'PAID' || !occurrence.paidAt || occurrence.paidAt > input.today || occurrence.period > input.today.slice(0,7) || occurrence.amountActualCents == null) continue
    const chargePeriod = billChargePeriod(bill,input.cards,occurrence.dueDate)
    const cardBalance = cardObligationBalance(input,bill.creditCardId,chargePeriod,bill.currency)
    if (cardBalance.totalCents <= 0 || cardBalance.status !== 'PAID') continue
    const amountCents = applyShare(occurrence.amountActualCents,bill.sharePercent)
    if (amountCents > 0) items.push({billId:bill.id,name:bill.name,currency:bill.currency,period:occurrence.period,amountCents})
  }
  return {items:items.sort((a,b) => a.period.localeCompare(b.period) || b.amountCents-a.amountCents || a.name.localeCompare(b.name)),ambiguousCount}
}

/** Comparación de importes reales: las obligaciones pendientes solo si tienen importe real registrado. */
export function billComparisonHistory(input: EngineInput) {
  const history = paidBillHistory(input)
  const items: Array<PaidBillHistoryItem & { status: 'PAID' | 'PENDING' }> = history.items.map(item => ({ ...item, status: 'PAID' }))
  const payments = obligationPayments(input).filter(p => p.obligationKind === 'BILL' && p.paidAt <= input.today)
  for (const occurrence of input.billOccurrences) {
    if (occurrence.period > currentOf(input) || occurrence.amountActualCents == null || occurrence.amountActualCents <= 0) continue
    const bill = input.bills.find(b => b.id === occurrence.billId && b.currency === occurrence.currency)
    if (!bill || items.some(item => item.billId === bill.id && item.period === occurrence.period && item.currency === bill.currency)) continue
    const rows = payments.filter(p => p.obligationId === bill.id && p.period === occurrence.period && p.currency === bill.currency)
    if (rows.some(p => p.id.startsWith('legacy-bill:')) && rows.some(p => !p.id.startsWith('legacy-bill:'))) continue
    // Un pago histórico sin fecha no permite determinar su estado real.
    if (bill.paymentSource === 'ACCOUNT' && occurrence.status === 'PAID' && !occurrence.paidAt) continue
    const amountCents = applyShare(occurrence.amountActualCents, bill.sharePercent)
    if (amountCents > 0) items.push({ billId: bill.id, name: bill.name, currency: bill.currency, period: occurrence.period, amountCents, status: 'PENDING' })
  }
  return { items, ambiguousCount: history.ambiguousCount }
}

export function accountBalanceAt(account: AccountSnapshot, input: EngineInput, asOf: ISODate = input.today): number {
  return accountBalanceBreakdown(account,input,asOf).balanceCents
}

export function billObligationBalance(input: EngineInput, bill: BillSnapshot, period: string, occurrence = input.billOccurrences.find(o => o.billId === bill.id && o.period === period)) {
  return obligationBalance(billTotalCents(bill,occurrence), obligationPayments(input).filter(p => p.obligationKind === 'BILL' && p.obligationId === bill.id && p.period === period && p.currency === bill.currency && p.paidAt <= input.today).map(p => p.amountCents))
}

export function accountBalances(input: EngineInput): Array<{
  accountId: string
  name: string
  currency: CurrencyCode
  balanceCents: number
}> {
  return input.accounts.map((account) => ({
    accountId: account.id,
    name: account.name,
    currency: account.currency,
    balanceCents: accountBalanceAt(account, input),
  }))
}

export function availableByCurrency(input: EngineInput): Record<CurrencyCode, number> {
  const balances = accountBalances(input)
  return {
    UYU: sumCents(balances.filter((b) => b.currency === 'UYU').map((b) => b.balanceCents)),
    USD: sumCents(balances.filter((b) => b.currency === 'USD').map((b) => b.balanceCents)),
  }
}

/* ------------------------------------------------------------------ */
/* Tarjeta                                                            */
/* ------------------------------------------------------------------ */

export function unpaidInstallments(input: EngineInput): InstallmentSnapshot[] {
  return input.installments.filter((i) => !i.isPaid && i.expenseStatus !== 'DISCARDED')
}

export function cardDueForPeriod(input: EngineInput, currency: CurrencyCode, period: MonthKey) {
  return unpaidInstallments(input).filter((i) => i.currency === currency && i.period === period)
}

/** Cuotas vencidas impagas: la señal de que el resumen quedó sin registrar. */
export function cardOverdue(input: EngineInput, currency: CurrencyCode, current: MonthKey) {
  return unpaidInstallments(input).filter(
    (i) => i.currency === currency && i.period < current,
  )
}

/**
 * Cargo de una cuenta pagada con tarjeta: el período del resumen en que aparece.
 * Se usa para no descontarla del banco y para no contarla dos veces.
 */
export function billChargePeriod(bill: BillSnapshot, cards: CardSnapshot[], dueDate: ISODate): MonthKey {
  const card = cards.find((c) => c.id === bill.creditCardId)
  if (!card) return monthKeyOf(dueDate)
  return statementPeriodForPurchase(dueDate, card.closingDay, card.dueDay)
}

/* ------------------------------------------------------------------ */
/* Cuentas recurrentes por mes                                         */
/* ------------------------------------------------------------------ */

export type BillInMonth = {
  bill: BillSnapshot
  occurrence: BillOccurrenceSnapshot | null
  dueDate: ISODate
  expectedCents: number
  minCents: number
  maxCents: number
  exact: boolean
  paid: boolean
  chargedToCard: boolean
  chargePeriod: MonthKey | null
}

export function billsInMonth(
  input: EngineInput,
  period: MonthKey,
  options: { includePaid?: boolean } = {},
): BillInMonth[] {
  const result: BillInMonth[] = []
  for (const bill of input.bills) {
    if (!bill.isActive) continue
    const step = recurrenceStepMonths(bill.frequency)
    if (!isRecurringInPeriod(bill.startDate, bill.endDate, period, step)) continue
    const occurrence =
      input.billOccurrences.find((o) => o.billId === bill.id && o.period === period) ?? null
    const paid = bill.paymentSource === 'ACCOUNT' && billObligationBalance(input,bill,period,occurrence ?? undefined).status === 'PAID'
    if (paid && !options.includePaid) continue
    const dueDate = occurrence?.dueDate ?? dateInMonth(period, bill.dueDay)
    const range = billRangeCents(bill, occurrence)
    const chargedToCard = bill.paymentSource === 'CREDIT_CARD'
    result.push({
      bill,
      occurrence,
      dueDate,
      expectedCents: billExpectedCents(bill, occurrence),
      minCents: applyShare(range.min, bill.sharePercent),
      maxCents: applyShare(range.max, bill.sharePercent),
      exact: range.exact,
      paid,
      chargedToCard,
      chargePeriod: chargedToCard ? billChargePeriod(bill, input.cards, dueDate) : null,
    })
  }
  return result
}

/* ------------------------------------------------------------------ */
/* Resumen por moneda                                                  */
/* ------------------------------------------------------------------ */

/**
 * Cuentas pagadas con tarjeta cuyo cargo cae en `period`.
 * Se revisan las ocurrencias de los 3 meses anteriores porque el cierre puede
 * empujar el cargo hasta dos meses después del vencimiento de la cuenta.
 */
export function cardChargedBillsForPeriod(
  input: EngineInput,
  currency: CurrencyCode,
  period: MonthKey,
): BillInMonth[] {
  const result: BillInMonth[] = []
  for (const bill of input.bills) {
    if (!bill.isActive || bill.paymentSource !== 'CREDIT_CARD' || bill.currency !== currency) continue
    const step = recurrenceStepMonths(bill.frequency)
    for (const offset of [0, -1, -2]) {
      const month = addMonthsKey(period, offset)
      if (!isRecurringInPeriod(bill.startDate, bill.endDate, month, step)) continue
      const occurrence =
        input.billOccurrences.find((o) => o.billId === bill.id && o.period === month) ?? null
      const dueDate = occurrence?.dueDate ?? dateInMonth(month, bill.dueDay)
      if (billChargePeriod(bill, input.cards, dueDate) !== period) continue
      const range = billRangeCents(bill, occurrence)
      result.push({
        bill,
        occurrence,
        dueDate,
        expectedCents: billExpectedCents(bill, occurrence),
        minCents: applyShare(range.min, bill.sharePercent),
        maxCents: applyShare(range.max, bill.sharePercent),
        exact: range.exact,
        paid: false,
        chargedToCard: true,
        chargePeriod: period,
      })
    }
  }
  return result
}

export type CurrencySummary = {
  currency: CurrencyCode
  availableCents: number
  accounts: Array<{ accountId: string; name: string; balanceCents: number }>
  cardCurrentCents: number
  cardOverdueCents: number
  cardDueNowCents: number
  cardFutureCents: number
  cardFutureByPeriod: Array<{ period: MonthKey; cents: number }>
  billsDueNowCents: number
  billsDueNowRange: { min: number; max: number }
  committedCents: number
  afterCommitmentsCents: number
  incomeThisMonthCents: number
  spentThisMonthCents: number
  /** Cuentas ya pagadas este mes desde la cuenta (no tarjeta). */
  billsPaidThisMonthCents: number
  plannedSavingsCents: number
  /** Margen del mes antes de ahorro programado (ingresos − gastos y compromisos). */
  operatingMarginCents: number
  savingsCapacityCents: number
  savingsCapacityRawCents: number
  goalsSavedCents: number
  missing: string[]
  reviewCount: number
}

export function computeCurrencySummary(
  input: EngineInput,
  currency: CurrencyCode,
  pendingReviewCount = 0,
): CurrencySummary {
  const current = currentOf(input)
  const balances = accountBalances(input).filter((b) => b.currency === currency)
  const availableCents = sumCents(balances.map((b) => b.balanceCents))

  const currentInstallments = cardDueForPeriod(input, currency, current)
  const overdue = cardOverdue(input, currency, current)
  const future = unpaidInstallments(input).filter(
    (i) => i.currency === currency && i.period > current,
  )
  const futureByPeriod = new Map<MonthKey, number>()
  for (const inst of future) {
    futureByPeriod.set(inst.period, (futureByPeriod.get(inst.period) ?? 0) + inst.amountCents)
  }

  const bills = billsInMonth(input, current).filter((b) => b.bill.currency === currency)
  // Las cuentas que se pagan con tarjeta no salen del banco: son deuda de tarjeta
  // y se imputan al período del resumen, no al mes del vencimiento.
  const bankBills = bills.filter((b) => !b.chargedToCard)

  const monthBalances = monthObligationBalances(input,current).filter(b => b.currency === currency)
  const cardDueNowCents = sumCents(monthBalances.filter(b => b.kind === 'CARD').map(b => b.remainingCents))
  const previousPeriods = [...new Set([...input.installments.filter(i => i.currency === currency).map(i => i.period),...(input.statementTotals ?? []).filter(s => s.currency === currency).map(s => s.period)])].filter(p => p < current)
  const cardOverdueCents = sumCents(previousPeriods.flatMap(p => input.cards.map(c => cardObligationBalance(input,c.id,p,currency).remainingCents)))
  const billsDueNowCents = sumCents(monthBalances.filter(b => b.kind === 'BILL').map(b => b.remainingCents))
  const committedCents = cardDueNowCents + cardOverdueCents + billsDueNowCents
  const afterCommitmentsCents = availableCents - committedCents

  const monthIncomes = input.incomes.filter(
    (i) => i.currency === currency && incomeActiveInPeriod(i, current),
  )
  const incomeThisMonthCents = sumCents(monthIncomes.map((i) => i.amountCents))
  const accountExpensesThisMonth = activeExpenses(input).filter(
    (e) => e.currency === currency && e.source === 'ACCOUNT' && monthKeyOf(e.date) === current,
  )
  const spentThisMonthCents = sumCents(accountExpensesThisMonth.map((e) => e.amountCents))

  const billsPaidThisMonthCents = sumCents(obligationPayments(input).filter(p => p.obligationKind === 'BILL' && p.period === current && p.currency === currency && p.paidAt <= input.today).map(p => {
    const bill = input.bills.find(b => b.id === p.obligationId)
    return bill ? applyShare(p.amountCents,bill.sharePercent) : 0
  }))

  const plannedSavingsCents = sumCents(
    input.goals
      .filter((g) => g.isActive && g.currency === currency)
      .map((g) => goalPlannedForMonth(input, g, current)),
  )

  const savingsCapacityRawCents =
    incomeThisMonthCents -
    cardDueNowCents -
    cardOverdueCents -
    billsDueNowCents -
    spentThisMonthCents -
    plannedSavingsCents
  const operatingMarginCents =
    incomeThisMonthCents - cardDueNowCents - cardOverdueCents - billsDueNowCents - spentThisMonthCents

  const missing: string[] = []
  if (!input.accounts.some((a) => a.currency === currency)) {
    missing.push('No hay cuentas con saldo registradas en esta moneda.')
  }
  if (monthIncomes.length === 0 && availableCents <= 0) {
    missing.push('No registraste ingresos para este mes.')
  }
  if (future.length === 0 && input.installments.length === 0 && input.expenses.some((e) => e.creditCardId)) {
    missing.push('Hay compras con tarjeta sin cuotas generadas.')
  }
  if (overdue.length > 0) {
    missing.push('Hay cuotas de resúmenes anteriores sin pagar: el saldo disponible puede estar sobreestimado.')
  }
  if (input.accounts.length > 0 && input.accounts.every((account) => account.openingCents === 0) && availableCents < 0) {
    missing.push('No cargaste el saldo inicial de las cuentas: por eso el disponible se ve negativo.')
  }

  return {
    currency,
    availableCents,
    accounts: balances.map((b) => ({ accountId: b.accountId, name: b.name, balanceCents: b.balanceCents })),
    cardCurrentCents: sumCents(currentInstallments.map((i) => i.amountCents)),
    cardOverdueCents,
    cardDueNowCents,
    cardFutureCents: sumCents(future.map((i) => i.amountCents)),
    cardFutureByPeriod: [...futureByPeriod.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([period, cents]) => ({ period, cents })),
    billsDueNowCents,
    billsDueNowRange: {
      min: sumCents(bankBills.map((b) => b.minCents)),
      max: sumCents(bankBills.map((b) => b.maxCents)),
    },
    committedCents,
    afterCommitmentsCents,
    incomeThisMonthCents,
    spentThisMonthCents,
    billsPaidThisMonthCents,
    plannedSavingsCents,
    operatingMarginCents,
    savingsCapacityCents: clampZero(savingsCapacityRawCents),
    savingsCapacityRawCents,
    goalsSavedCents: sumCents(
      input.contributions.filter((c) => c.currency === currency).map((c) => c.amountCents),
    ),
    missing,
    reviewCount: pendingReviewCount,
  }
}

/* ------------------------------------------------------------------ */
/* Ahorro                                                             */
/* ------------------------------------------------------------------ */

export function goalSavedCents(goal: GoalSnapshot, contributions: ContributionSnapshot[]): number {
  return sumCents(
    contributions.filter((c) => c.goalId === goal.id && c.currency === goal.currency).map((c) => c.amountCents),
  )
}

export function goalPlannedForMonth(
  input: EngineInput,
  goal: GoalSnapshot,
  period: MonthKey,
): number {
  if (goal.monthlyTargetCents == null) return 0
  const contributed = sumCents(
    input.contributions
      .filter((c) => c.goalId === goal.id && monthKeyOf(c.date) === period)
      .map((c) => c.amountCents),
  )
  return Math.max(0, goal.monthlyTargetCents - contributed)
}

/* ------------------------------------------------------------------ */
/* Proyección                                                         */
/* ------------------------------------------------------------------ */

export type MonthlyFlow = {
  period: MonthKey
  isCurrent: boolean
  startCents: number
  incomeCents: number
  cardCents: number
  billsCents: number
  billsMinCents: number
  billsMaxCents: number
  otherExpensesCents: number
  savingsCents: number
  endCents: number
  endMinCents: number
  endMaxCents: number
  assumptions: string[]
  missing: string[]
  freeMarginCents: number
}

export type ProjectionScenario = 'base' | 'conservador' | 'optimista'

export type ProjectionOptions = {
  /** Para cuentas variables: base = promedio, conservador = máximo, optimista = mínimo. */
  scenario?: ProjectionScenario
  /** Si es false, no se descuenta el ahorro programado de los objetivos. */
  includeSavings?: boolean
}

export function projectMonths(
  input: EngineInput,
  currency: CurrencyCode,
  months = 6,
  options: ProjectionOptions = {},
): MonthlyFlow[] {
  const scenario = options.scenario ?? 'base'
  const includeSavings = options.includeSavings ?? true
  const current = currentOf(input)
  const periods = nextMonths(current, months)
  const available = sumCents(
    accountBalances(input)
      .filter((b) => b.currency === currency)
      .map((b) => b.balanceCents),
  )

  const flows: MonthlyFlow[] = []
  let previousEnd = available
  const todayDay = Number(input.today.slice(8, 10))

  for (const period of periods) {
    const isCurrent = period === current
    const assumptions: string[] = []
    const missing: string[] = []
    const startCents = isCurrent ? available : previousEnd

    // Ingresos del mes (en el mes actual sólo los que faltan cobrar).
    let incomeCents = 0
    for (const income of input.incomes) {
      if (income.currency !== currency || !income.isActive) continue
      if (!incomeActiveInPeriod(income, period)) continue
      if (isCurrent && (income.dayOfMonth ?? Number(income.startDate.slice(8, 10))) < todayDay) continue
      // El saldo actual ya incorpora lo cobrado hoy en una cuenta vinculada.
      if (isCurrent && income.accountId && incomeReceivedUntil(income,input.today) > incomeReceivedUntil(income,monthRange(addMonthsKey(current,-1)).end)) continue
      incomeCents += income.amountCents
    }
    if (incomeCents === 0) {
      missing.push('No hay ingresos previstos para este mes.')
    }
    if (input.incomes.some((i) => i.currency === currency && !i.isActive)) {
      assumptions.push('Los ingresos inactivos no se proyectan.')
    }

    // Cuotas de tarjeta del período.
    const installments = unpaidInstallments(input).filter(
      (i) => i.currency === currency && i.period === period,
    )
    if (installments.some((i) => i.isEstimated)) {
      assumptions.push('Algunas cuotas están estimadas: el período se calculó con el cierre de la tarjeta.')
    }

    // Cuentas del mes pagadas desde una cuenta bancaria/caja.
    const monthBills = billsInMonth(input, period).filter(
      (b) => b.bill.currency === currency && !b.chargedToCard,
    )
    let billsCents = 0
    let billsMinCents = 0
    let billsMaxCents = 0
    for (const item of monthBills) {
      // Si sigue impaga, se debe pagar aunque el vencimiento ya haya pasado.
      const paid = applyShare(billObligationBalance(input,item.bill,period,item.occurrence ?? undefined).paidCents,item.bill.sharePercent)
      billsCents += Math.max(0,scenarioAmount(item, scenario)-paid)
      billsMinCents += Math.max(0,item.minCents-paid)
      billsMaxCents += Math.max(0,item.maxCents-paid)
      if (!item.exact) {
        assumptions.push(`${item.bill.name}: importe variable, se proyecta entre ${item.minCents} y ${item.maxCents}.`)
        missing.push(`El importe real de ${item.bill.name} todavía no se conoce.`)
      }
    }

    // Cuentas pagadas con tarjeta: se imputan al resumen que las contiene,
    // nunca al mes del vencimiento ni al banco directamente.
    let cardBillsCents = 0
    for (const item of cardChargedBillsForPeriod(input, currency, period)) {
      cardBillsCents += scenarioAmount(item, scenario)
      if (!item.exact) {
        assumptions.push(`${item.bill.name}: rango ${item.minCents}–${item.maxCents} (se usa el promedio).`)
      }
    }
    if (cardBillsCents > 0) {
      assumptions.push('Cuentas pagadas con tarjeta: se imputan al resumen correspondiente, no al banco.')
    }
    if (scenario !== 'base' && monthBills.some((item) => !item.exact)) {
      assumptions.push(
        scenario === 'conservador'
          ? 'Escenario conservador: las cuentas variables usan el máximo del rango.'
          : 'Escenario optimista: las cuentas variables usan el mínimo del rango.',
      )
    }
    if (!includeSavings && input.goals.length > 0) {
      assumptions.push('No se descuenta el ahorro programado de los objetivos.')
    }
    const cardCents = sumCents(input.cards.map(c => cardObligationBalance(input,c.id,period,currency).remainingCents))

    // Gastos ya registrados con débito/efectivo en el mes.
    const accountExpenses = activeExpenses(input).filter(
      (e) =>
        e.currency === currency &&
        e.source === 'ACCOUNT' &&
        monthKeyOf(e.date) === period &&
        (!isCurrent || e.date > input.today),
    )
    const otherExpensesCents = sumCents(accountExpenses.map((e) => e.amountCents))

    // Ahorro programado (opcional en el escenario).
    let savingsCents = 0
    if (includeSavings) {
      for (const goal of input.goals) {
        if (!goal.isActive || goal.currency !== currency) continue
        savingsCents += goalPlannedForMonth(input, goal, period)
      }
    }

    const endCents = startCents + incomeCents - cardCents - billsCents - otherExpensesCents - savingsCents
    const endMinCents = endCents - (billsMaxCents - billsCents)
    const endMaxCents = endCents + (billsCents - billsMinCents)
    const freeMarginCents = incomeCents - cardCents - billsCents - otherExpensesCents

    flows.push({
      period,
      isCurrent,
      startCents,
      incomeCents,
      cardCents,
      billsCents,
      billsMinCents,
      billsMaxCents,
      otherExpensesCents,
      savingsCents,
      endCents,
      endMinCents,
      endMaxCents,
      assumptions: [...new Set(assumptions)],
      missing: [...new Set(missing)],
      freeMarginCents,
    })
    previousEnd = endCents
  }
  return flows
}

/** Proyección consolidada en pesos para la pantalla de proyección; no modifica los movimientos originales. */
export function projectMonthsInPesos(input: EngineInput, rateCents: number, months = 6, options: ProjectionOptions = {}): MonthlyFlow[] {
  if (!Number.isSafeInteger(rateCents) || rateCents <= 0) throw new RangeError('La cotización debe ser positiva.')
  const pesos = projectMonths(input,'UYU',months,options)
  const dollars = projectMonths(input,'USD',months,options)
  let previousEnd = 0
  return pesos.map((uyu,index) => {
    const usd = dollars[index]
    if (!usd || usd.period !== uyu.period) throw new Error('Los períodos de proyección no coinciden.')
    const convert = (cents: number) => convertUsdToUyu(cents,rateCents)
    const startCents = uyu.isCurrent ? uyu.startCents + convert(usd.startCents) : previousEnd
    const incomeCents = uyu.incomeCents + convert(usd.incomeCents)
    const cardCents = uyu.cardCents + convert(usd.cardCents)
    const billsCents = uyu.billsCents + convert(usd.billsCents)
    const billsMinCents = uyu.billsMinCents + convert(usd.billsMinCents)
    const billsMaxCents = uyu.billsMaxCents + convert(usd.billsMaxCents)
    const otherExpensesCents = uyu.otherExpensesCents + convert(usd.otherExpensesCents)
    const savingsCents = uyu.savingsCents + convert(usd.savingsCents)
    const endCents = startCents + incomeCents - cardCents - billsCents - otherExpensesCents - savingsCents
    const endMinCents = endCents - (billsMaxCents - billsCents)
    const endMaxCents = endCents + (billsCents - billsMinCents)
    previousEnd = endCents
    return {...uyu,startCents,incomeCents,cardCents,billsCents,billsMinCents,billsMaxCents,otherExpensesCents,savingsCents,endCents,endMinCents,endMaxCents,
      freeMarginCents:incomeCents-cardCents-billsCents-otherExpensesCents,
      assumptions:[...new Set([...uyu.assumptions,...usd.assumptions])],
      missing:[...new Set([...uyu.missing,...usd.missing.filter(message => message !== 'No hay ingresos previstos para este mes.')])],
    }
  })
}

/* ------------------------------------------------------------------ */
/* Próximos pagos                                                     */
/* ------------------------------------------------------------------ */

export type UpcomingPayment = {
  id: string
  kind: 'CARD' | 'BILL' | 'INSTALLMENT'
  title: string
  subtitle: string
  dueDate: ISODate
  amountCents: number
  currency: CurrencyCode
  estimated: boolean
  href: string
}

export function upcomingPayments(input: EngineInput, limitPerCurrency = 6): UpcomingPayment[] {
  const current = currentOf(input)
  const items: UpcomingPayment[] = []

  const cardPeriods = [...new Set([...input.installments.map(i => i.period),...(input.statementTotals ?? []).map(s => s.period), current,addMonthsKey(current,1),addMonthsKey(current,2)])]
  for (const period of cardPeriods.filter(period => period >= current)) for (const card of input.cards) for (const currency of ['UYU','USD'] as const) {
    const balance = cardObligationBalance(input,card.id,period,currency)
    if (!balance.remainingCents) continue
    items.push({id:`card-${card.id}-${period}-${currency}`,kind:'CARD',title:card.name,subtitle:`Resumen de ${period}`,dueDate:statementDueDate(period,card.dueDay),amountCents:balance.remainingCents,currency,estimated:!input.statementTotals?.some(s => s.cardId === card.id && s.period === period && s.currency === currency),href:'/tarjetas'})
  }

  for (const period of [addMonthsKey(current, 0), addMonthsKey(current, 1), addMonthsKey(current, 2)]) {
    for (const item of billsInMonth(input, period)) {
      if (item.chargedToCard) continue
      items.push({
        id: `bill-${item.bill.id}-${period}`,
        kind: 'BILL',
        title: item.bill.name,
        subtitle: item.exact ? 'Cuenta del mes' : 'Importe estimado',
        dueDate: item.dueDate,
        amountCents: applyShare(billObligationBalance(input,item.bill,period,item.occurrence ?? undefined).remainingCents,item.bill.sharePercent),
        currency: item.bill.currency,
        estimated: !item.exact,
        href: '/cuentas',
      })
    }
  }

  const sorted = items.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0))
  const counters: Record<string, number> = {}
  return sorted.filter((item) => {
    counters[item.currency] = (counters[item.currency] ?? 0) + 1
    return counters[item.currency] <= limitPerCurrency
  })
}

/* ------------------------------------------------------------------ */
/* Objetivos: asignación conjunta por prioridad                       */
/* ------------------------------------------------------------------ */

export type GoalPlan = {
  goalId: string
  name: string
  currency: CurrencyCode
  targetCents: number
  savedCents: number
  remainingCents: number
  monthsLeft: number
  requiredMonthlyCents: number
  allocatedMonthlyCents: number
  shortfallCents: number
  feasible: boolean
  tightMonths: MonthKey[]
  estimatedCompletionMonth: MonthKey | null
  priority: number
}

/**
 * Reparte el margen libre proyectado entre objetivos según prioridad.
 * Evita prometer el mismo dinero a dos objetivos.
 */
function scenarioAmount(item: BillInMonth, scenario: ProjectionScenario): number {
  if (item.exact) return item.expectedCents
  if (scenario === 'conservador') return item.maxCents
  if (scenario === 'optimista') return item.minCents
  return item.expectedCents
}

export function planGoals(
  input: EngineInput,
  projections: Record<CurrencyCode, MonthlyFlow[]>,
): GoalPlan[] {
  const current = currentOf(input)
  const goals = input.goals
    .filter((g) => g.isActive)
    .slice()
    .sort((a, b) => a.priority - b.priority)

  const capacityByPeriod: Record<string, number> = {}
  for (const currency of ['UYU', 'USD'] as CurrencyCode[]) {
    const summary = computeCurrencySummary(input, currency)
    for (const flow of projections[currency] ?? []) {
      // En el mes en curso el saldo ya incluye ingresos cobrados y gastos pagados:
      // el margen se calcula completo pero se acota a lo realmente disponible.
      const available = flow.isCurrent
        ? Math.min(summary.operatingMarginCents, summary.afterCommitmentsCents)
        : flow.freeMarginCents
      capacityByPeriod[`${currency}-${flow.period}`] = Math.max(0, available)
    }
  }

  const plans: GoalPlan[] = []
  for (const goal of goals) {
    const saved = goalSavedCents(goal, input.contributions)
    const remaining = Math.max(0, goal.targetCents - saved)
    const targetMonth = monthKeyOf(goal.targetDate)
    const monthsLeft = Math.max(1, monthsBetween(current, targetMonth) + 1)
    const requiredMonthly = remaining === 0 ? 0 : Math.ceil(remaining / monthsLeft)

    let allocated = 0
    let accumulated = saved
    const tightMonths: MonthKey[] = []
    let completion: MonthKey | null = remaining === 0 ? current : null
    const periods = (projections[goal.currency] ?? []).map((f) => f.period)

    for (const period of periods) {
      if (completion) break
      // No se asigna ahorro después de la fecha objetivo.
      if (period > targetMonth) break
      const key = `${goal.currency}-${period}`
      const availableCapacity = Math.max(0, capacityByPeriod[key] ?? 0)
      const need = Math.min(requiredMonthly, Math.max(0, remaining - allocated))
      if (need <= 0) break
      const take = Math.min(need, availableCapacity)
      capacityByPeriod[key] = availableCapacity - take
      allocated += take
      accumulated += take
      if (take < need) tightMonths.push(period)
      if (accumulated >= goal.targetCents) completion = period
    }

    if (!completion && goal.monthlyTargetCents && goal.monthlyTargetCents > 0) {
      completion = addMonthsKey(current, Math.ceil(remaining / goal.monthlyTargetCents))
    }

    const monthsUsed = Math.max(1, Math.min(periods.length, monthsLeft))
    const allocatedMonthly = Math.round(allocated / monthsUsed)

    plans.push({
      goalId: goal.id,
      name: goal.name,
      currency: goal.currency,
      targetCents: goal.targetCents,
      savedCents: saved,
      remainingCents: remaining,
      monthsLeft,
      requiredMonthlyCents: requiredMonthly,
      allocatedMonthlyCents: allocatedMonthly,
      shortfallCents: Math.max(0, requiredMonthly - allocatedMonthly),
      feasible: remaining === 0 || (tightMonths.length === 0 && allocatedMonthly >= requiredMonthly),
      tightMonths,
      estimatedCompletionMonth: completion,
      priority: goal.priority,
    })
  }
  return plans
}

/* ------------------------------------------------------------------ */
/* Contexto completo                                                  */
/* ------------------------------------------------------------------ */

export type FinanceOverview = {
  today: ISODate
  currentMonth: MonthKey
  summaries: Record<CurrencyCode, CurrencySummary>
  projections: Record<CurrencyCode, MonthlyFlow[]>
  upcoming: UpcomingPayment[]
  goals: GoalPlan[]
  reviewCount: number
}

export function buildOverview(
  input: EngineInput,
  options: {
    months?: number
    pendingReviewCount?: number
    scenario?: ProjectionScenario
    includeSavings?: boolean
  } = {},
): FinanceOverview {
  const months = options.months ?? 6
  const reviewCount = options.pendingReviewCount ?? 0
  const summaries = {
    UYU: computeCurrencySummary(input, 'UYU', reviewCount),
    USD: computeCurrencySummary(input, 'USD', reviewCount),
  }
  const projectionOptions: ProjectionOptions = {
    scenario: options.scenario,
    includeSavings: options.includeSavings,
  }
  const projections = {
    UYU: projectMonths(input, 'UYU', months, projectionOptions),
    USD: projectMonths(input, 'USD', months, projectionOptions),
  }

  // El margen del mes en curso sale del cierre proyectado: incluye el saldo
  // inicial de las cuentas y no sólo los ingresos del mes.
  for (const currency of ['UYU', 'USD'] as CurrencyCode[]) {
    const currentFlow = projections[currency][0]
    if (!currentFlow) continue
    const capacity = currentFlow.endCents
    summaries[currency].savingsCapacityRawCents = capacity
    summaries[currency].savingsCapacityCents = clampZero(capacity)
  }

  return {
    today: input.today,
    currentMonth: currentOf(input),
    summaries,
    projections,
    upcoming: upcomingPayments(input),
    goals: planGoals(input, projections),
    reviewCount,
  }
}

/** Utilidad para la UI: meses con saldo proyectado negativo. */
export function tightMonths(flow: MonthlyFlow[]): MonthKey[] {
  return flow.filter((f) => f.endMinCents < 0).map((f) => f.period)
}

export function monthBounds(period: MonthKey) {
  return monthRange(period)
}


export type StatementTotal = { cardId: string; period: string; currency: CurrencyCode; totalCents: number }

/** Las filas llegan de más reciente a más antigua: una sola referencia por tarjeta, mes y moneda. */
export function statementTotalsFromImports(rows: {creditCardId:string|null;period:string|null;currency?:string|null;totalUyu:unknown;totalUsd:unknown;totalAmount:unknown}[]): StatementTotal[] {
  const totals: StatementTotal[] = []
  for (const row of rows) {
    if (!row.creditCardId || !row.period) continue
    for (const currency of ['UYU','USD'] as const) {
      const amount = currency === 'UYU' ? row.totalUyu ?? (row.currency !== 'USD' ? row.totalAmount : null) : row.totalUsd ?? (row.currency === 'USD' ? row.totalAmount : null)
      if (amount == null || totals.some(t => t.cardId === row.creditCardId && t.period === row.period && t.currency === currency)) continue
      totals.push({cardId:row.creditCardId,period:row.period,currency,totalCents:toCents(amount)})
    }
  }
  return totals
}

export function cardObligationBalance(input: EngineInput, cardId: string, period: string, currency: CurrencyCode) {
  const installments = input.installments.filter(i => i.cardId === cardId && i.period === period && i.currency === currency && i.expenseStatus !== 'DISCARDED')
  const imported = input.statementTotals?.find(s => s.cardId === cardId && s.period === period && s.currency === currency)
  const charged = cardChargedBillsForPeriod(input,currency,period).filter(b => b.bill.creditCardId === cardId)
  const total = imported?.totalCents ?? sumCents(installments.map(i => i.amountCents)) + sumCents(charged.map(b => b.expectedCents))
  const payments = obligationPayments(input).filter(p => p.obligationKind === 'CARD' && p.obligationId === cardId && p.period === period && p.currency === currency && p.paidAt <= input.today)
  return obligationBalance(total,payments.map(p => p.amountCents))
}

/** Obligaciones originales del mes. Los pagos sólo modifican paid/remaining, nunca total. */
export function monthObligationBalances(input: EngineInput, period: string) {
  const bills = billsInMonth(input,period,{includePaid:true}).filter(b => !b.chargedToCard).map(item => {
    const balance = billObligationBalance(input,item.bill,period,item.occurrence ?? undefined)
    const totalCents = item.expectedCents
    const paidCents = applyShare(balance.paidCents,item.bill.sharePercent)
    return {id:item.bill.id,kind:'BILL' as const,period,currency:item.bill.currency,...obligationBalance(totalCents,[paidCents])}
  })
  const cards = input.cards.flatMap(card => (['UYU','USD'] as const).map(currency => ({
    id:card.id,kind:'CARD' as const,period,currency,...cardObligationBalance(input,card.id,period,currency),
  }))).filter(b => b.totalCents > 0 || b.paidCents > 0)
  return [...cards,...bills]
}

/** Vista consolidada en pesos solicitada para el tablero; el resto de reportes conserva monedas separadas. */
export function dashboardCommitments(input: EngineInput, period: string, rate: number, statements = input.statementTotals ?? []) {
  const withStatements = {...input,statementTotals:statements}
  const balances = monthObligationBalances(withStatements,period)
  const payments: IndependentPayment[] = balances.map(b => ({id:`${b.kind}:${b.id}:${b.period}:${b.currency}`,obligationId:b.id,obligationKind:b.kind,period:b.period,currency:b.currency,amountCents:b.paidCents,accountId:null,accountAmountCents:null,paidAt:input.today,debitAccount:false}))
  const currentBalance = sumCents(accountBalances(input).filter(a => a.currency === 'UYU').map(a => a.balanceCents))
  const warnings: string[] = []
  if (billsInMonth(input,period,{includePaid:true}).some(b => !b.exact)) warnings.push('Hay cuentas variables sin importe real; los compromisos son estimados.')
  if (input.cardPayments.some(old => input.independentPayments.some(p => p.obligationKind === 'CARD' && p.obligationId === old.creditCardId && p.period === old.period && p.currency === old.currency))) warnings.push('Hay pagos históricos y nuevos para un mismo resumen; revisá el historial para descartar duplicaciones.')
  if (input.billOccurrences.some(old => old.status === 'PAID' && input.independentPayments.some(p => p.obligationKind === 'BILL' && p.obligationId === old.billId && p.period === old.period && p.currency === old.currency))) warnings.push('Hay pagos históricos y nuevos para una misma cuenta fija; revisá el historial para descartar duplicaciones.')
  return {...monthlyCommitments(period,currentBalance,balances,payments,rate),warnings}
}
