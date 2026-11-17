import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { AppShell } from '@/components/app-shell'
import { countPendingReviews } from '@/lib/finance/reviews'
import { gmailConnectionAlert } from '@/lib/gmail/status'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  const [expenses, messages, gmail] = await Promise.all([
    prisma.expense.findMany({ where: { userId: user.id }, select: { id: true, status: true } }),
    prisma.processedGmailMessage.findMany({
      where: { connection: { userId: user.id }, status: 'NEEDS_REVIEW' },
      select: { expenseId: true },
    }),
    prisma.gmailConnection.findUnique({
      where: { userId: user.id },
      select: { status: true, lastSyncError: true },
    }),
  ])

  return (
    <AppShell
      user={user}
      reviewCount={countPendingReviews(expenses, messages)}
      gmailAlert={gmailConnectionAlert(gmail)}
    >
      {children}
    </AppShell>
  )
}
