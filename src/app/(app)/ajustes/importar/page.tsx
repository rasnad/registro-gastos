import Link from 'next/link'
import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { todayISO } from '@/lib/period'
import { StatementWizard } from '@/components/statement-wizard'
import { Alert } from '@/components/ui'

export const metadata: Metadata = { title: 'Importar resumen' }
export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Params = Promise<Record<string, string | string[] | undefined>>

export default async function ImportarPage({ searchParams }: { searchParams: Params }) {
  const user = await requireUser()
  const params = await searchParams
  const cardParam = typeof params.tarjeta === 'string' ? params.tarjeta : undefined

  const [cards, categories] = await Promise.all([
    prisma.creditCard.findMany({
      where: { userId: user.id, isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, currency: true, closingDay: true, dueDay: true },
    }),
    prisma.category.findMany({
      where: { userId: user.id, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ])

  if (cards.length === 0) {
    return (
      <Alert tone="warn" title="Primero necesitás una tarjeta">
        <p>
          El resumen se imputa a una tarjeta concreta. Creala en <Link href="/ajustes#tarjetas">Ajustes → Tarjetas</Link>{' '}
          y volvé a esta pantalla.
        </p>
      </Alert>
    )
  }

  return (
    <div className="stack">
      <p className="hint" style={{ maxWidth: 760 }}>
        Importá el resumen actual para partir de una situación realista, incluyendo las cuotas que todavía te faltan
        pagar. Después de confirmar, cada compra se concilia contra lo que ya tenés cargado para no duplicarla.
      </p>
      <StatementWizard
        cards={cards}
        categories={categories}
        defaultCardId={cardParams(cardParam, cards)}
        today={todayISO()}
      />
    </div>
  )
}

function cardParams(value: string | undefined, cards: Array<{ id: string }>): string | undefined {
  return value && cards.some((card) => card.id === value) ? value : undefined
}
