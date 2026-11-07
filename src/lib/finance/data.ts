import 'server-only'
import { prisma } from '@/lib/db'
import { toCents } from '@/lib/money'
import { toISODate, todayISO } from '@/lib/period'
import {
  buildOverview,
  statementTotalsFromImports,
  accountBalances,
  type AccountSnapshot,
  type AdjustmentSnapshot,
  type BillOccurrenceSnapshot,
  type BillSnapshot,
  type CardPaymentSnapshot,
  type CardSnapshot,
  type ContributionSnapshot,
  type EngineInput,
  type ExpenseSnapshot,
  type FinanceOverview,
  type GoalSnapshot,
  type IncomeSnapshot,
  type InstallmentSnapshot,
} from '@/lib/finance/engine'
import type { ComparableExpense } from '@/lib/finance/dedupe'

export type FinanceData = {
  today: string
  input: EngineInput
  overview: FinanceOverview
  balances: ReturnType<typeof accountBalances>
  cards: CardSnapshot[]
}

/**
 * Carga todo lo necesario para calcular: cuentas, tarjetas, ingresos, gastos,
 * cuotas, pagos de resumen, cuentas recurrentes y objetivos.
 * Se filtra siempre por userId (nunca por datos que venga del cliente).
 */
export async function loadFinanceData(
  userId: string,
  options: {
    months?: number
    today?: string
    scenario?: 'base' | 'conservador' | 'optimista'
    includeSavings?: boolean
  } = {},
): Promise<FinanceData> {
  const today = options.today ?? todayISO()

  const [
    statementRows,
    accountRows,
    cardRows,
    incomeRows,
    adjustmentRows,
    expenseRows,
    installmentRows,
    paymentRows,
    independentPaymentRows,
    billRows,
    occurrenceRows,
    goalRows,
    contributionRows,
    reviewExpenses,
    reviewMessages,
  ] = await Promise.all([
    prisma.statementImport.findMany({where:{userId,status:'IMPORTED'},orderBy:[{createdAt:'desc'},{id:'desc'}]}),
    prisma.account.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    prisma.creditCard.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    prisma.income.findMany({ where: { userId }, orderBy: { startDate: 'desc' } }),
    prisma.balanceAdjustment.findMany({ where: { userId }, orderBy: { date: 'desc' } }),
    prisma.expense.findMany({
      where: { userId },
      include: { installmentsList: true },
      orderBy: { date: 'desc' },
    }),
    prisma.cardInstallment.findMany({ where: { expense: { userId } } }),
    prisma.cardPayment.findMany({ where: { userId } }),
    prisma.obligationPayment.findMany({ where: { userId } }),
    prisma.recurringBill.findMany({ where: { userId }, orderBy: { name: 'asc' } }),
    prisma.billOccurrence.findMany({ where: { userId } }),
    prisma.savingsGoal.findMany({ where: { userId }, orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }] }),
    prisma.savingsContribution.findMany({ where: { userId }, orderBy: { date: 'desc' } }),
    prisma.expense.count({ where: { userId, status: 'NEEDS_REVIEW' } }),
    prisma.processedGmailMessage.count({
      where: { connection: { userId }, status: 'NEEDS_REVIEW' },
    }),
  ])

  const accounts: AccountSnapshot[] = accountRows.map((account) => ({
    id: account.id,
    name: account.name,
    kind: account.kind,
    currency: account.currency,
    openingCents: toCents(account.openingBalance),
    openingDate: toISODate(account.openingDate),
    isActive: account.isActive,
  }))

  const cards: CardSnapshot[] = cardRows.map((card) => ({
    id: card.id,
    name: card.name,
    closingDay: card.closingDay,
    dueDay: card.dueDay,
    isActive: card.isActive,
  }))

  const incomes: IncomeSnapshot[] = incomeRows.map((income) => ({
    id: income.id,
    description: income.description,
    amountCents: toCents(income.amount),
    currency: income.currency,
    kind: income.kind,
    recurrence: income.recurrence,
    dayOfMonth: income.dayOfMonth,
    startDate: toISODate(income.startDate),
    endDate: income.endDate ? toISODate(income.endDate) : null,
    accountId: income.accountId,
    isActive: income.isActive,
  }))

  const adjustments: AdjustmentSnapshot[] = adjustmentRows.map((adjustment) => ({
    id: adjustment.id,
    accountId: adjustment.accountId,
    date: toISODate(adjustment.date),
    deltaCents: toCents(adjustment.amountDelta),
    currency: adjustment.currency,
    reason: adjustment.reason,
  }))

  const expenses: ExpenseSnapshot[] = expenseRows.map((expense) => ({
    id: expense.id,
    date: toISODate(expense.date),
    merchant: expense.merchant,
    amountCents: toCents(expense.amount),
    currency: expense.currency,
    categoryId: expense.categoryId,
    source: expense.source,
    accountId: expense.accountId,
    creditCardId: expense.creditCardId,
    installments: expense.installments,
    origin: expense.origin,
    status: expense.status,
    isEstimated: expense.isEstimated,
  }))

  const statusByExpense = new Map(expenseRows.map((expense) => [expense.id, expense.status]))
  const installments: InstallmentSnapshot[] = installmentRows.map((installment) => ({
    id: installment.id,
    expenseId: installment.expenseId,
    cardId: installment.cardId,
    number: installment.number,
    count: installment.count,
    amountCents: toCents(installment.amount),
    currency: installment.currency,
    period: installment.period,
    dueDate: installment.dueDate ? toISODate(installment.dueDate) : null,
    isPaid: installment.isPaid,
    isEstimated: installment.isEstimated,
    expenseStatus: statusByExpense.get(installment.expenseId) ?? 'CONFIRMED',
  }))

  const cardPayments: CardPaymentSnapshot[] = paymentRows.map((payment) => ({
    id: payment.id,
    creditCardId: payment.creditCardId,
    period: payment.period,
    amountCents: toCents(payment.amount),
    currency: payment.currency,
    accountAmountCents: payment.accountAmount != null ? toCents(payment.accountAmount) : null,
    paidAt: toISODate(payment.paidAt),
    accountId: payment.accountId,
  }))

  const bills: BillSnapshot[] = billRows.map((bill) => ({
    id: bill.id,
    name: bill.name,
    categoryId: bill.categoryId,
    currency: bill.currency,
    amountType: bill.amountType,
    amountFixedCents: bill.amountFixed != null ? toCents(bill.amountFixed) : null,
    amountMinCents: bill.amountMin != null ? toCents(bill.amountMin) : null,
    amountMaxCents: bill.amountMax != null ? toCents(bill.amountMax) : null,
    sharePercent: bill.sharePercent,
    frequency: bill.frequency,
    dueDay: bill.dueDay,
    paymentSource: bill.paymentSource,
    accountId: bill.accountId,
    creditCardId: bill.creditCardId,
    startDate: toISODate(bill.startDate),
    endDate: bill.endDate ? toISODate(bill.endDate) : null,
    isActive: bill.isActive,
  }))

  const billOccurrences: BillOccurrenceSnapshot[] = occurrenceRows.map((occurrence) => ({
    id: occurrence.id,
    billId: occurrence.billId,
    period: occurrence.period,
    dueDate: toISODate(occurrence.dueDate),
    amountMinCents: occurrence.amountMin != null ? toCents(occurrence.amountMin) : null,
    amountMaxCents: occurrence.amountMax != null ? toCents(occurrence.amountMax) : null,
    amountActualCents: occurrence.amountActual != null ? toCents(occurrence.amountActual) : null,
    status: occurrence.status,
    paidAt: occurrence.paidAt ? toISODate(occurrence.paidAt) : null,
    accountId: occurrence.accountId,
    currency: occurrence.currency,
  }))

  const goals: GoalSnapshot[] = goalRows.map((goal) => ({
    id: goal.id,
    name: goal.name,
    currency: goal.currency,
    targetCents: toCents(goal.targetAmount),
    targetDate: toISODate(goal.targetDate),
    monthlyTargetCents: goal.monthlyTarget != null ? toCents(goal.monthlyTarget) : null,
    priority: goal.priority,
    isActive: goal.isActive,
  }))

  const contributions: ContributionSnapshot[] = contributionRows.map((contribution) => ({
    id: contribution.id,
    goalId: contribution.goalId,
    date: toISODate(contribution.date),
    amountCents: toCents(contribution.amount),
    currency: contribution.currency,
    accountId: contribution.accountId,
  }))

  const input: EngineInput = {
    today,
    statementTotals:statementTotalsFromImports(statementRows),
    accounts,
    cards,
    incomes,
    adjustments,
    expenses,
    installments,
    cardPayments,
    independentPayments: independentPaymentRows.map((payment) => ({
      id: payment.id, obligationId: payment.obligationId, obligationKind: payment.obligationKind as 'CARD' | 'BILL', period: payment.period, currency: payment.currency, amountCents: toCents(payment.amount),
      paidAt: toISODate(payment.paidAt), accountId: payment.accountId,
      accountAmountCents: payment.accountAmount == null ? null : toCents(payment.accountAmount),
      debitAccount: payment.debitAccount,
    })),
    bills,
    billOccurrences,
    goals,
    contributions,
  }

  const reviewCount = reviewExpenses + reviewMessages
  const overview = buildOverview(input, {
    months: options.months ?? 6,
    pendingReviewCount: reviewCount,
    scenario: options.scenario,
    includeSavings: options.includeSavings,
  })

  return {
    today,
    input,
    overview,
    balances: accountBalances(input),
    cards,
  }
}

/** Gastos existentes para conciliar importaciones (Gmail / resumen). */
export async function loadComparableExpenses(userId: string): Promise<ComparableExpense[]> {
  const rows = await prisma.expense.findMany({
    where: { userId, status: { not: 'DISCARDED' } },
    select: {
      id: true,
      date: true,
      merchant: true,
      amount: true,
      currency: true,
      source: true,
      accountId: true,
      creditCardId: true,
      installments: true,
      origin: true,
      status: true,
    },
  })
  return rows.map((row) => ({
    id: row.id,
    date: toISODate(row.date),
    merchant: row.merchant,
    amountCents: toCents(row.amount),
    currency: row.currency,
    source: row.source,
    accountId: row.accountId,
    creditCardId: row.creditCardId,
    installments: row.installments,
    origin: row.origin,
    status: row.status,
  }))
}

export type FormOptions = {
  today: string
  accounts: Array<{ id: string; name: string; currency: 'UYU' | 'USD'; kind: string; isDefault: boolean }>
  cards: Array<{ id: string; name: string; closingDay: number; dueDay: number }>
  categories: Array<{ id: string; name: string; isActive: boolean; icon: string | null; color: string | null }>
  rules: Array<{ pattern: string; categoryId: string }>
}

/** Opciones para poblar formularios (cuentas, tarjetas, categorías y reglas). */
export async function loadFormOptions(userId: string): Promise<FormOptions> {
  const [accounts, cards, categories, rules] = await Promise.all([
    prisma.account.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    prisma.creditCard.findMany({ where: { userId, isActive: true }, orderBy: { createdAt: 'asc' } }),
    prisma.category.findMany({ where: { userId }, orderBy: { name: 'asc' } }),
    prisma.merchantRule.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' } }),
  ])
  return {
    today: todayISO(),
    accounts: accounts.map((account) => ({
      id: account.id,
      name: account.name,
      currency: account.currency,
      kind: account.kind,
      isDefault: account.isDefault,
    })),
    cards: cards.map((card) => ({
      id: card.id,
      name: card.name,
      closingDay: card.closingDay,
      dueDay: card.dueDay,
    })),
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      isActive: category.isActive,
      icon: category.icon,
      color: category.color,
    })),
    rules: rules.map((rule) => ({ pattern: rule.pattern, categoryId: rule.categoryId })),
  }
}
