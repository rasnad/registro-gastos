import 'server-only'
import type { CurrentUser } from '@/lib/auth'
import { loadFinanceData, loadFormOptions } from '@/lib/finance/data'
import { dashboardCommitments, billMonthlyView, cardObligationBalance, obligationPayments, projectMonthsInPesos, billComparisonHistory } from '@/lib/finance/engine'
import { prisma } from '@/lib/db'
import type { MobileSnapshot } from './contracts'

/** DTO calculado en el mismo motor que la web. Sin Prisma Decimal ni secretos. */
export async function mobileSnapshot(user: CurrentUser, period: string, includeSavings = true): Promise<MobileSnapshot> {
  const [data, options, gmail, cardDetails, paymentNotes, legacyNotes, billNotes] = await Promise.all([
    loadFinanceData(user.id, { months: 12, includeSavings }), loadFormOptions(user.id),
    prisma.gmailConnection.findUnique({ where: { userId: user.id }, select: { emailAddress: true, status: true, autoSync: true, lastSyncAt: true } }),
    prisma.creditCard.findMany({ where: { userId: user.id }, select: { id: true, last4: true, notes: true } }),
    prisma.obligationPayment.findMany({ where: { userId: user.id }, select: { id: true, note: true } }),
    prisma.cardPayment.findMany({ where: { userId: user.id }, select: { id: true, note: true } }),
    prisma.recurringBill.findMany({ where: { userId: user.id }, select: { id: true, notes: true } }),
  ])
  return {
    user, period, today: data.today, options,
    dashboard: dashboardCommitments(data.input, period, user.usdRateCents),
    overview: data.overview, balances: data.balances,
    bills: billMonthlyView(data.input, period),
    billDefinitions: data.input.bills.map(bill => ({ ...bill, notes: billNotes.find(b => b.id === bill.id)?.notes ?? null })),
    billHistory: billComparisonHistory(data.input),
    cards: data.cards.map(card => ({ ...card, last4: cardDetails.find(c => c.id === card.id)?.last4 ?? null, notes: cardDetails.find(c => c.id === card.id)?.notes ?? null, statements: (['UYU', 'USD'] as const).map(currency => ({ currency, ...cardObligationBalance(data.input, card.id, period, currency) })) })),
    payments: obligationPayments(data.input).map(payment => ({ ...payment, note: payment.id.startsWith('legacy-card:') ? legacyNotes.find(p => `legacy-card:${p.id}` === payment.id)?.note ?? null : paymentNotes.find(p => p.id === payment.id)?.note ?? null })),
    installments: data.input.installments,
    projections: projectMonthsInPesos(data.input, user.usdRateCents, 12, { includeSavings }),
    incomes: data.input.incomes, adjustments: data.input.adjustments,
    goals: data.input.goals, contributions: data.input.contributions,
    gmail: gmail ? { ...gmail, lastSyncAt: gmail.lastSyncAt?.toISOString() ?? null } : null,
  }
}
