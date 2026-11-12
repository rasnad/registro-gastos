// Sólo tipos: este contrato se comparte con Expo sin importar código de servidor.
import type { dashboardCommitments, billMonthlyView, billComparisonHistory, accountBalances, CardSnapshot, BillSnapshot, IncomeSnapshot, AdjustmentSnapshot, GoalSnapshot, ContributionSnapshot, InstallmentSnapshot, MonthlyFlow, FinanceOverview } from '../finance/engine'
import type { IndependentPayment, ObligationBalance } from '../finance/obligations'

export type Currency = 'UYU' | 'USD'
export type MobileSnapshot = {
  user: { id: string; email: string; name: string; usdRateCents: number }
  period: string; today: string
  options: {
    today: string
    accounts: { id: string; name: string; currency: Currency; kind: string; isDefault: boolean }[]
    cards: { id: string; name: string; closingDay: number; dueDay: number }[]
    categories: { id: string; name: string; isActive: boolean; icon: string | null; color: string | null }[]
    rules: { pattern: string; categoryId: string }[]
  }
  dashboard: ReturnType<typeof dashboardCommitments>
  overview: FinanceOverview
  balances: ReturnType<typeof accountBalances>
  bills: ReturnType<typeof billMonthlyView>
  billDefinitions: (BillSnapshot & { notes: string | null })[]
  billHistory: ReturnType<typeof billComparisonHistory>
  cards: (CardSnapshot & { last4: string | null; notes: string | null; statements: (ObligationBalance & { currency: Currency })[] })[]
  payments: (IndependentPayment & { note: string | null })[]
  installments: InstallmentSnapshot[]
  projections: MonthlyFlow[]
  incomes: IncomeSnapshot[]; adjustments: AdjustmentSnapshot[]
  goals: GoalSnapshot[]; contributions: ContributionSnapshot[]
  gmail: { emailAddress: string; status: string; autoSync: boolean; lastSyncAt: string | null } | null
}
export type Movement = {
  id: string; merchant: string; description: string | null; notes: string | null
  amountCents: number; currency: Currency; date: string; categoryId: string | null
  source: 'ACCOUNT' | 'CREDIT_CARD'; accountId: string | null; creditCardId: string | null
  installments: number; origin: string; status: string
}
export type MovementPage = { items: Movement[]; count: number; page: number; hasNext: boolean }
export type TokenPair = { accessToken: string; refreshToken: string; expiresIn: number }
