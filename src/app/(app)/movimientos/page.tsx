import Link from 'next/link'
import type { Metadata } from 'next'
import { Prisma } from '@prisma/client'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { loadFormOptions } from '@/lib/finance/data'
import { fromCents, formatMoney, type CurrencyCode } from '@/lib/money'
import { toISODate, dateLabel, todayISO } from '@/lib/period'
import { Money, Badge, CategoryDot } from '@/components/ui'
import { Icon } from '@/components/icons'
import { Dialog } from '@/components/dialog'
import { ExpenseForm } from '@/components/forms/money-forms'
import { MiniForm } from '@/components/forms/other-forms'
import { InlineCategoryPick, InlineMerchantEdit } from '@/components/forms/quick-edit'
import {
  deleteExpense,
  setExpenseCategory,
  setExpenseMerchant,
  setExpenseStatus,
} from '@/app/actions/expenses'
import { applySharePercent, sharePercentFor } from '@/lib/finance/shares'

export const metadata: Metadata = { title: 'Movimientos' }
export const dynamic = 'force-dynamic'

type Params = Promise<Record<string, string | string[] | undefined>>

function single(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : ''
}

export default async function MovimientosPage({ searchParams }: { searchParams: Params }) {
  const user = await requireUser()
  const params = await searchParams
  const q = single(params.q).slice(0, 80)
  const moneda = single(params.moneda)
  const categoria = single(params.categoria)
  const medio = single(params.medio)
  const estado = single(params.estado)
  const desde = single(params.desde)
  const hasta = single(params.hasta)
  const editarId = single(params.editar)
  const nuevo = single(params.nuevo) === '1'

  const [options, categories] = await Promise.all([
    loadFormOptions(user.id),
    prisma.category.findMany({ where: { userId: user.id }, orderBy: { name: 'asc' } }),
  ])

  const where: Prisma.ExpenseWhereInput = { userId: user.id }
  if (estado === 'revision') where.status = 'NEEDS_REVIEW'
  else if (estado === 'confirmados') where.status = 'CONFIRMED'
  else if (estado === 'tarjeta') where.source = 'CREDIT_CARD'
  else if (estado === 'cuenta') where.source = 'ACCOUNT'
  else where.status = { not: 'DISCARDED' }

  if (moneda === 'UYU' || moneda === 'USD') where.currency = moneda
  if (categoria) where.categoryId = categoria
  if (medio === 'tarjeta') where.source = 'CREDIT_CARD'
  if (medio === 'cuenta') where.source = 'ACCOUNT'
  if (desde || hasta) {
    where.date = {
      ...(desde ? { gte: new Date(`${desde}T00:00:00.000Z`) } : {}),
      ...(hasta ? { lte: new Date(`${hasta}T00:00:00.000Z`) } : {}),
    }
  }
  if (q) where.merchant = { contains: q, mode: 'insensitive' }

  const [expenses, totals, counts, editing] = await Promise.all([
    prisma.expense.findMany({
      where,
      include: {
        category: true,
        installmentsList: { orderBy: { number: 'asc' } },
        creditCard: true,
        shares: { select: { userId: true, sharePercent: true } },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    }),
    prisma.expense.groupBy({
      by: ['currency'],
      where,
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.expense.count({ where: { userId: user.id, status: 'NEEDS_REVIEW' } }),
    editarId
      ? prisma.expense.findFirst({
          where: { id: editarId, userId: user.id },
          include: { installmentsList: true, shares: { select: { userId: true, sharePercent: true } } },
        })
      : null,
  ])

  const byCurrency = new Map(totals.map((row) => [row.currency, row]))
  const totalRows = totals.reduce((acc, row) => acc + row._count._all, 0)
  const editingHasPaid = editing?.installmentsList.some((item) => item.isPaid) ?? false

  return (
    <div className="stack">
      {counts > 0 && estado !== 'revision' ? (
        <div className="review-banner">
          <Icon name="warning" size={17} />
          <span>
            {counts} movimiento{counts === 1 ? '' : 's'} importado{counts === 1 ? '' : 's'} necesita
            {counts === 1 ? '' : 'n'} revisión.
          </span>
          <span className="spacer" />
          <Link href="/movimientos?estado=revision" className="link-button">
            Revisar ahora <Icon name="arrow" size={14} />
          </Link>
        </div>
      ) : null}

      <section className="summary-strip">
        <div>
          <span className="eyebrow">{estado === 'revision' ? 'POR REVISAR' : 'TOTAL FILTRADO'}</span>
          <div className="row" style={{ gap: 18 }}>
            {['UYU', 'USD'].map((code) => {
              const row = byCurrency.get(code as CurrencyCode)
              if (!row) return null
              return (
                <strong key={code} style={{ fontSize: 26 }}>
                  <Money cents={Math.round(Number(row._sum.amount ?? 0) * 100)} currency={code as CurrencyCode} />
                </strong>
              )
            })}
            {byCurrency.size === 0 ? <strong style={{ fontSize: 24 }}>{formatMoney(0, 'UYU')}</strong> : null}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: 12, fontWeight: 600, display: 'block' }}>{totalRows} movimiento{totalRows === 1 ? '' : 's'}</span>
          <small className="hint">Se listan hasta 100 por página</small>
        </div>
      </section>

      <section className="panel">
        <form method="get" className="toolbar" style={{ marginBottom: 14 }}>
          <label className="search">
            <Icon name="search" size={17} />
            <input name="q" defaultValue={q} placeholder="Buscar por comercio" aria-label="Buscar movimiento" />
          </label>
          <select className="select" name="categoria" defaultValue={categoria} style={{ width: 150 }} aria-label="Categoría">
            <option value="">Todas las categorías</option>
            {categories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select className="select" name="moneda" defaultValue={moneda} style={{ width: 120 }} aria-label="Moneda">
            <option value="">Moneda</option>
            <option value="UYU">UYU</option>
            <option value="USD">USD</option>
          </select>
          <select className="select" name="medio" defaultValue={medio} style={{ width: 130 }} aria-label="Medio de pago">
            <option value="">Medio</option>
            <option value="cuenta">Débito / efectivo</option>
            <option value="tarjeta">Tarjeta de crédito</option>
          </select>
          <input className="input" type="date" name="desde" defaultValue={desde} style={{ width: 150 }} aria-label="Desde" />
          <input className="input" type="date" name="hasta" defaultValue={hasta} style={{ width: 150 }} aria-label="Hasta" />
          <select className="select" name="estado" defaultValue={estado} style={{ width: 150 }} aria-label="Estado">
            <option value="">Todos</option>
            <option value="revision">Por revisar</option>
            <option value="confirmados">Confirmados</option>
          </select>
          <button className="secondary-button" type="submit">
            Filtrar
          </button>
          {q || moneda || categoria || medio || desde || hasta || estado ? (
            <Link href="/movimientos" className="link-button">
              Limpiar
            </Link>
          ) : null}
        </form>

        <div className="date-divider">
          <span>{estado === 'revision' ? 'IMPORTADOS POR REVISAR' : 'MOVIMIENTOS'}</span>
          <span>{totalRows}</span>
        </div>

        {expenses.length === 0 ? (
          <div className="empty-state">
            <strong>No hay movimientos con estos filtros</strong>
            Probá limpiar los filtros o registrá un gasto manual.
          </div>
        ) : (
          <div className="transaction-list">
            {expenses.map((expense) => {
              const cents = Math.round(Number(expense.amount) * 100)
              const isReview = expense.status === 'NEEDS_REVIEW'
              const myShare = sharePercentFor(expense.shares, user.id)
              const myCents = applySharePercent(cents, myShare)
              const meta = [
                isReview ? null : expense.category?.name ?? 'Sin categorizar',
                dateLabel(toISODate(expense.date)),
                expense.source === 'CREDIT_CARD'
                  ? `${expense.creditCard?.name ?? 'Tarjeta'}${expense.installments > 1 ? ` · ${expense.installments} cuotas` : ''}`
                  : 'débito/efectivo',
                expense.origin !== 'MANUAL' ? (expense.origin === 'EMAIL' ? 'correo' : 'resumen') : null,
                myShare < 100 ? `tu parte ${myShare}%` : null,
              ].filter(Boolean)
              return (
                <div key={expense.id} className={`transaction${isReview ? ' needs-review' : ''}`} style={{ alignItems: 'flex-start' }}>
                  <CategoryDot icon={expense.category?.icon} color={expense.category?.color} />
                  <div className="item-main">
                    {isReview ? (
                      <InlineMerchantEdit
                        action={setExpenseMerchant}
                        expenseId={expense.id}
                        merchant={expense.merchant}
                      />
                    ) : (
                      <strong>{expense.merchant}</strong>
                    )}
                    <small>
                      {expense.status === 'DISCARDED' ? <Badge tone="danger">Descartado</Badge> : null}
                      {meta.join(' · ')}
                    </small>
                    <div className="row transaction-actions">
                      {isReview ? (
                        <>
                          <InlineCategoryPick
                            action={setExpenseCategory}
                            expenseId={expense.id}
                            categoryId={expense.categoryId}
                            categories={categories.map((category) => ({ id: category.id, name: category.name }))}
                          />
                          <MiniForm
                            action={setExpenseStatus}
                            hidden={{ id: expense.id, status: 'CONFIRMED' }}
                            label="Confirmar"
                            className="secondary-button small-button"
                          />
                        </>
                      ) : null}
                      <Link href={`/movimientos?editar=${expense.id}`} className="link-button">
                        Editar
                      </Link>
                    </div>
                  </div>
                  <div className="item-amount">
                    <strong>
                      <Money cents={cents} currency={expense.currency} />
                    </strong>
                    {myShare < 100 ? (
                      <span className="share-note">
                        tu parte <Money cents={myCents} currency={expense.currency} />
                      </span>
                    ) : (
                      <span className={expense.source === 'CREDIT_CARD' ? undefined : 'paid'}>
                        {expense.source === 'CREDIT_CARD'
                          ? expense.installments > 1
                            ? 'Cuotas'
                            : 'Tarjeta'
                          : 'Cuenta'}
                      </span>
                    )}
                  </div>
                  {isReview ? <span className="review-dot" title="Por revisar" aria-label="Por revisar" /> : null}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {nuevo ? (
        <Dialog
          label="Nuevo movimiento"
          title="Nuevo movimiento"
          description="Si es con tarjeta, no se descuenta del banco: se paga con el resumen."
          defaultOpen
          trigger={false}
          closeHref="/movimientos"
        >
          <ExpenseForm
            accounts={options.accounts}
            cards={options.cards}
            categories={options.categories}
            rules={options.rules}
            members={options.members}
            today={todayISO()}
          />
        </Dialog>
      ) : null}

      {editing ? (
        <Dialog
          label="Editar"
          title="Editar movimiento"
          description={
            editingHasPaid
              ? 'Esta compra tiene cuotas pagadas: el importe y las cuotas se corrigen desde Tarjetas.'
              : undefined
          }
          defaultOpen
          trigger={false}
          closeHref="/movimientos"
        >
          <ExpenseForm
            accounts={options.accounts}
            cards={options.cards}
            categories={options.categories}
            rules={options.rules}
            members={options.members}
            today={todayISO()}
            defaults={{
              id: editing.id,
              merchant: editing.merchant,
              description: editing.description,
              amount: fromCents(Math.round(Number(editing.amount) * 100)),
              currency: editing.currency,
              date: toISODate(editing.date),
              categoryId: editing.categoryId,
              source: editing.source,
              accountId: editing.accountId,
              creditCardId: editing.creditCardId,
              installments: editing.installments,
              notes: editing.notes,
              shares: editing.shares.map((share) => ({
                userId: share.userId,
                sharePercent: share.sharePercent,
              })),
            }}
          />
          <div className="danger-zone">
            {editing.status === 'NEEDS_REVIEW' ? (
              <MiniForm
                action={setExpenseStatus}
                hidden={{ id: editing.id, status: 'DISCARDED' }}
                label="Descartar movimiento"
                className="danger-button"
                confirmMessage="¿Descartar este movimiento? No se contará en los cálculos y el correo queda marcado como descartado."
                closeOnSuccess
              />
            ) : (
              <MiniForm
                action={deleteExpense}
                hidden={{ id: editing.id }}
                label="Eliminar movimiento"
                className="danger-button"
                confirmMessage="¿Eliminar definitivamente este movimiento y sus cuotas? Esta acción no se puede deshacer."
                closeOnSuccess
              />
            )}
          </div>
        </Dialog>
      ) : null}
    </div>
  )
}
