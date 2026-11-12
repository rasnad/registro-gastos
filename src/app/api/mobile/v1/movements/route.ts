import { z } from 'zod'
import { endpoint } from '@/lib/mobile/http'
import { authenticateMobile } from '@/lib/mobile/auth'
import { prisma } from '@/lib/db'
import { toCents } from '@/lib/money'

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => { const d = new Date(`${v}T00:00:00Z`); return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v })
const filters = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  search: z.string().max(100).optional(), from: date.optional(), to: date.optional(),
  currency: z.enum(['UYU', 'USD']).optional(), source: z.enum(['ACCOUNT', 'CREDIT_CARD']).optional(),
  status: z.enum(['CONFIRMED', 'NEEDS_REVIEW', 'DISCARDED']).optional(), categoryId: z.string().max(100).optional(),
})
export const runtime = 'nodejs'
export async function GET(request: Request) {
  return endpoint(async () => {
    const { user } = await authenticateMobile(request)
    const f = filters.parse(Object.fromEntries(new URL(request.url).searchParams))
    const where = {
      userId: user.id, currency: f.currency, source: f.source, categoryId: f.categoryId,
      status: f.status ?? { not: 'DISCARDED' as const },
      ...(f.search ? { merchant: { contains: f.search, mode: 'insensitive' as const } } : {}),
      ...(f.from || f.to ? { date: { ...(f.from ? { gte: new Date(f.from) } : {}), ...(f.to ? { lte: new Date(f.to) } : {}) } } : {}),
    }
    const [rows, count] = await Promise.all([
      prisma.expense.findMany({ where, orderBy: [{ date: 'desc' }, { id: 'desc' }], skip: (f.page - 1) * 30, take: 30 }), prisma.expense.count({ where }),
    ])
    return { page: f.page, hasNext: f.page * 30 < count, count, items: rows.map(row => ({ id: row.id, merchant: row.merchant, description: row.description, notes: row.notes, amountCents: toCents(row.amount), currency: row.currency, date: row.date.toISOString().slice(0, 10), categoryId: row.categoryId, source: row.source, accountId: row.accountId, creditCardId: row.creditCardId, installments: row.installments, origin: row.origin, status: row.status })) }
  })
}

export type MovementsPage = Awaited<ReturnType<typeof GET>>
