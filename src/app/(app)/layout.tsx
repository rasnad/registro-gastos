import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { AppShell } from '@/components/app-shell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  const [expensesToReview, messagesToReview] = await Promise.all([
    prisma.expense.count({ where: { userId: user.id, status: 'NEEDS_REVIEW' } }),
    prisma.processedGmailMessage.count({
      where: { connection: { userId: user.id }, status: 'NEEDS_REVIEW' },
    }),
  ])

  return (
    <AppShell user={user} reviewCount={expensesToReview + messagesToReview}>
      {children}
    </AppShell>
  )
}
