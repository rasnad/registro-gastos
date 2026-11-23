import Link from 'next/link'
import type { Metadata } from 'next'
import { Prisma } from '@prisma/client'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { loadFormOptions } from '@/lib/finance/data'
import { fromCents, formatMoney, type CurrencyCode } from '@/lib/money'
import {
  addMonthsISO,
  dateLabel,
  monthKeyOf,
  monthRange,
  toISODate,
  todayISO,
} from '@/lib/period'
import { Money, Badge, CategoryDot, SectionHead } from '@/components/ui'
import { Icon } from '@/components/icons'
import { Dialog } from '@/components/dialog'
import { ExpenseForm } from '@/components/forms/money-forms'
import { MiniForm } from '@/components/forms/other-forms'
import { InlineCategoryPick, InlineMerchantEdit } from '@/components/forms/quick-edit'
import { CategoryDonut } from '@/components/finance/category-donut'
import {
  deleteExpense,
  setExpenseCategory,
  setExpenseMerchant,
  setExpenseStatus,
} from '@/app/actions/expenses'
import { applySharePercent, sharePercentFor } from '@/lib/finance/shares'
import { categorySlices, type CategoryBreakdownRow } from '@/lib/finance/breakdown'

export const metadata: Metadata = { title: 'Movimientos' }
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25

type Params = Promise<Record<string, string | string[] | undefined>>

function single(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : ''
}

const PERIODS = [
  { key: '', label: 'Rango elegido' },
  { key: 'ultimo', label: 'Último mes' },
  { key: 'anterior', label: 'Mes anterior' },
] as const

const SOURCES = [
  { key: '', label: 'Todo' },
  { key: 'tarjeta', label: 'Crédito' },
  { key: 'cuenta', label: 'Débito' },
] as const

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
  const periodo = single(params.periodo)
  const editarId = single(params.editar)
  const nuevo = single(params.nuevo) === '1'
  const page = Math.max(1, Math.trunc(Number(single(params.page))) || 1)

  const [options, categories] = await Promise.all([
    loadFormOptions(user.id),
    prisma.category.findMany({ where: { userId: user.id }, orderBy: { name: 'asc' } }),
  ])

  const today = todayISO()
  // Los atajos de período completan el rango de fechas.
  let desdeValue = desde
  let hastaValue = hasta
  if (periodo === 'ultimo') {
    desdeValue = addMonthsISO(today, -1)
    hastaValue = today
  } else if (periodo === 'anterior') {
    const range = monthRange(monthKeyOf(addMonthsISO(today, -1)))
    desdeValue = range.start
    hastaValue = range.end
  }

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
  if (desdeValue || hastaValue) {
    where.date = {
      ...(desdeValue ? { gte: new Date(`${desdeValue}T00:00:00.000Z`) } : {}),
      ...(hastaValue ? { lte: new Date(`${hastaValue}T00:00:00.000Z`) } : {}),
    }
  }
  if (q) where.merchant = { contains: q, mode: 'insensitive' }

  const withdrawalsVisible = !categoria && medio !== 'tarjeta' && estado !== 'revision'

  const [expenses, totals, counts, total, breakdownRows, withdrawals, editing] = await Promise.all([
    prisma.expense.findMany({
      where,
      include: {
        category: true,
        installmentsList: { orderBy: { number: 'asc' } },
        creditCard: true,
        shares: { select: { userId: true, sharePercent: true } },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.expense.groupBy({
      by: ['currency'],
      where,
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.expense.count({ where: { userId: user.id, status: 'NEEDS_REVIEW' } }),
    prisma.expense.count({ where }),
    prisma.expense.groupBy({
      by: ['categoryId', 'currency'],
      where,
      _sum: { amount: true },
    }),
    withdrawalsVisible
      ? prisma.savingsWithdrawal.findMany({
          where: {
            userId: user.id,
            ...(moneda === 'UYU' || moneda === 'USD' ? { currency: moneda } : {}),
            ...(desdeValue || hastaValue
              ? {
                  date: {
                    ...(desdeValue ? { gte: new Date(`${desdeValue}T00:00:00.000Z`) } : {}),
                    ...(hastaValue ? { lte: new Date(`${hastaValue}T00:00:00.000Z`) } : {}),
                  },
                }
              : {}),
          },
          orderBy: { date: 'desc' },
          take: 10,
          include: { account: true },
        })
      : Promise.resolve([]),
    editarId
      ? prisma.expense.findFirst({
          where: { id: editarId, userId: user.id },
          include: { installmentsList: true, shares: { select: { userId: true, sharePercent: true } } },
        })
      : null,
  ])

  const byCurrency = new Map(totals.map((row) => [row.currency, row]))
  const totalRows = totals.reduce((acc, row) => acc + row._count._all, 0)
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const editingHasPaid = editing?.installmentsList.some((item) => item.isPaid) ?? false

  // Torta por categoría, separada por moneda (nunca se suman UYU con USD).
  const categoryById = new Map(categories.map((category) => [category.id, category]))
  const breakdownByCurrency = new Map<CurrencyCode, CategoryBreakdownRow[]>()
  for (const row of breakdownRows) {
    const code = row.currency as CurrencyCode
    const category = row.categoryId ? categoryById.get(row.categoryId) : null
    const list = breakdownByCurrency.get(code) ?? []
    list.push({
      categoryId: row.categoryId,
      name: category?.name ?? 'Sin categorizar',
      color: category?.color ?? null,
      cents: Math.round(Number(row._sum.amount ?? 0) * 100),
    })
    breakdownByCurrency.set(code, list)
  }
  const donuts = (['UYU', 'USD'] as CurrencyCode[])
    .map((code) => ({
      code,
      rows: breakdownByCurrency.get(code) ?? [],
      slices: categorySlices(breakdownByCurrency.get(code) ?? [], 6),
      totalCents: (breakdownByCurrency.get(code) ?? []).reduce((sum, row) => sum + row.cents, 0),
    }))
    .filter((item) => item.slices.length > 0)

  const rangeLabel =
    desdeValue || hastaValue
      ? `${desdeValue ? dateLabel(desdeValue, today) : 'el inicio'} – ${hastaValue ? dateLabel(hastaValue, today) : 'hoy'}`
      : 'Todo el historial'

  function hrefWith(next: Record<string, string | number | undefined>) {
    const search = new URLSearchParams()
    const base: Record<string, string> = {
      q,
      moneda,
      categoria,
      medio,
      estado,
      desde,
      hasta,
      periodo,
    }
    for (const [key, value] of Object.entries({ ...base, ...next })) {
      if (value !== undefined && value !== '') search.set(key, String(value))
    }
    const qs = search.toString()
    return qs ? `/movimientos?${qs}` : '/movimientos'
  }

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
          <span style={{ fontSize: 12, fontWeight: 600, display: 'block' }}>
            {total} movimiento{total === 1 ? '' : 's'}
          </span>
          <small className="hint">{rangeLabel}</small>
        </div>
      </section>

      <section className="panel">
        <SectionHead
          title="¿En qué se fue la plata?"
          note="Gasto por categoría del período elegido. Las monedas se muestran por separado."
        />
        <div className="row" style={{ justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
          <div className="filter-tabs" role="tablist" aria-label="Período">
            {PERIODS.map((item) => (
              <Link
                key={item.key || 'custom'}
                href={hrefWith({ periodo: item.key, page: undefined })}
                className={periodo === item.key ? 'selected' : ''}
                role="tab"
                aria-selected={periodo === item.key}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <div className="filter-tabs" role="tablist" aria-label="Medio de pago">
            {SOURCES.map((item) => (
              <Link
                key={item.key || 'all'}
                href={hrefWith({ medio: item.key, page: undefined })}
                className={medio === item.key ? 'selected' : ''}
                role="tab"
                aria-selected={medio === item.key}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
        {donuts.length === 0 ? (
          <p className="hint">No hay gastos en el período y filtros elegidos.</p>
        ) : (
          <div className="stack" style={{ gap: 22 }}>
            {donuts.map((donut) => (
              <CategoryDonut
                key={donut.code}
                slices={donut.slices}
                currency={donut.code}
                totalCents={donut.totalCents}
                label={rangeLabel}
              />
            ))}
          </div>
        )}
      </section>

      {withdrawals.length > 0 ? (
        <section className="panel">
          <SectionHead
            title="Movimientos de ahorro"
            note="Plata que salió del ahorro y volvió a una cuenta (no es un gasto)"
          />
          <div className="transaction-list">
            {withdrawals.map((withdrawal) => (
              <div className="transaction" key={withdrawal.id}>
                <span className="category-icon mint">
                  <Icon name="wallet" size={16} />
                </span>
                <div className="item-main">
                  <strong>Transferencia a {withdrawal.account?.name ?? 'una cuenta'}</strong>
                  <small>
                    {dateLabel(toISODate(withdrawal.date), today)} · desde el ahorro
                    {withdrawal.note ? ` · ${withdrawal.note}` : ''}
                  </small>
                </div>
                <div className="item-amount">
                  <strong className="amount-in">
                    + <Money cents={Math.round(Number(withdrawal.amount) * 100)} currency={withdrawal.currency} />
                  </strong>
                  <span className="paid">Ahorro</span>
                </div>
              </div>
            ))}
          </div>
          <p className="hint" style={{ marginTop: 10 }}>
            Gestioná estas transferencias desde <Link href="/ahorro">Ahorro</Link>.
          </p>
        </section>
      ) : null}

      <section className="panel">
        <form method="get" className="toolbar" style={{ marginBottom: 14 }}>
          <input type="hidden" name="periodo" value={periodo} />
          <input type="hidden" name="medio" value={medio} />
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
          <input className="input" type="date" name="desde" defaultValue={desdeValue} style={{ width: 150 }} aria-label="Desde" />
          <input className="input" type="date" name="hasta" defaultValue={hastaValue} style={{ width: 150 }} aria-label="Hasta" />
          <select className="select" name="estado" defaultValue={estado} style={{ width: 150 }} aria-label="Estado">
            <option value="">Todos</option>
            <option value="revision">Por revisar</option>
            <option value="confirmados">Confirmados</option>
          </select>
          <button className="secondary-button" type="submit">
            Filtrar
          </button>
          {q || moneda || categoria || medio || desde || hasta || estado || periodo ? (
            <Link href="/movimientos" className="link-button">
              Limpiar
            </Link>
          ) : null}
        </form>

        <div className="date-divider">
          <span>{estado === 'revision' ? 'IMPORTADOS POR REVISAR' : 'MOVIMIENTOS'}</span>
          <span>{total}</span>
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
                // Detalle del aviso (por ejemplo la transferencia original en dólares).
                expense.notes ?? null,
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

        {totalPages > 1 ? (
          <nav className="pager" aria-label="Páginas de movimientos">
            <span>
              Página {page} de {totalPages}
            </span>
            <div className="row">
              {page > 1 ? (
                <Link href={hrefWith({ page: page - 1 })}>← Anterior</Link>
              ) : (
                <span className="disabled">← Anterior</span>
              )}
              {page < totalPages ? (
                <Link href={hrefWith({ page: page + 1 })}>Siguiente →</Link>
              ) : (
                <span className="disabled">Siguiente →</span>
              )}
            </div>
          </nav>
        ) : null}
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
