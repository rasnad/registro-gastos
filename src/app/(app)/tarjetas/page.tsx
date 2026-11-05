import Link from 'next/link'
import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { loadFinanceData, loadFormOptions } from '@/lib/finance/data'
import { cardChargedBillsForPeriod, type CurrencyCode } from '@/lib/finance/engine'
import { sumCents, fromCents, convertUsdToUyu, formatRate } from '@/lib/money'
import { monthLabel, todayISO } from '@/lib/period'
import { Money, Badge, SectionHead, EmptyState } from '@/components/ui'
import { Icon } from '@/components/icons'
import { Dialog } from '@/components/dialog'
import { ExpenseForm } from '@/components/forms/money-forms'
import { CardForm, CardPaymentForm, InstallmentForm, MiniForm } from '@/components/forms/other-forms'
import { deleteCardPayment } from '@/app/actions/cards'

export const metadata: Metadata = { title: 'Tarjetas' }
export const dynamic = 'force-dynamic'

const CURRENCIES: CurrencyCode[] = ['UYU', 'USD']

export default async function TarjetasPage() {
  const user = await requireUser()
  const [data, options, cardRows, statementImports] = await Promise.all([
    loadFinanceData(user.id, { months: 6 }),
    loadFormOptions(user.id),
    prisma.creditCard.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
      include: {
        payments: { orderBy: { paidAt: 'desc' }, take: 24, include: { account: true } },
      },
    }),
    prisma.statementImport.findMany({
      where: { userId: user.id, status: 'IMPORTED' },
      orderBy: { createdAt: 'desc' },
      take: 24,
      select: { creditCardId: true, period: true, totalUyu: true, totalUsd: true, totalAmount: true },
    }),
  ])
  const today = todayISO()
  const current = data.overview.currentMonth

  if (cardRows.length === 0) {
    return (
      <div className="stack">
        <EmptyState title="Todavía no registraste tarjetas">
          Agregá tu tarjeta con su fecha de cierre y vencimiento para imputar las cuotas al resumen correcto.
        </EmptyState>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Dialog label="Agregar tarjeta" icon="plus" title="Nueva tarjeta de crédito" description="Las fechas definen a qué resumen cae cada compra.">
            <CardForm />
          </Dialog>
        </div>
      </div>
    )
  }

  return (
    <div className="stack">
      <div className="between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <p className="hint" style={{ maxWidth: 640 }}>
          Una compra con tarjeta no descuenta el saldo bancario: genera una obligación por período. Una misma
          tarjeta puede tener resumen en pesos y en dólares; cada uno se paga por separado.
        </p>
        <Dialog label="Agregar tarjeta" icon="plus" buttonClassName="secondary-button" title="Nueva tarjeta de crédito">
          <CardForm />
        </Dialog>
      </div>

      {cardRows.map((card) => {
        const installments = data.input.installments.filter(
          (item) => item.cardId === card.id && item.expenseStatus !== 'DISCARDED',
        )
        const unpaid = installments.filter((item) => !item.isPaid)

        const currencies = CURRENCIES.filter((cur) => {
          if (installments.some((item) => item.currency === cur)) return true
          if (card.payments.some((payment) => payment.currency === cur)) return true
          if (
            cardChargedBillsForPeriod(data.input, cur, current).some(
              (item) => item.bill.creditCardId === card.id,
            )
          ) {
            return true
          }
          return cur === card.currency
        })

        return (
          <div className="stack" key={card.id}>
            <div className="cards-layout">
              <div className={`credit-card ${card.currency === 'UYU' ? 'uyu' : ''}`}>
                <div className="card-top">
                  <span>{card.name}</span>
                  <span>{currencies.length > 1 ? 'UYU / USD' : card.currency}</span>
                </div>
                <div className="card-chip" />
                <div className="card-number">•••• &nbsp; •••• &nbsp; •••• &nbsp; {card.last4 ?? '····'}</div>
                <div className="card-bottom">
                  <span>
                    <small>CIERRE</small>
                    Día {card.closingDay}
                  </span>
                  <span>
                    <small>VENCIMIENTO</small>
                    Día {card.dueDay}
                  </span>
                </div>
                <div className="row" style={{ marginTop: 16, gap: 6, flexWrap: 'wrap' }}>
                  <Dialog
                    label="Nueva compra"
                    icon="plus"
                    buttonClassName="secondary-button small-button"
                    title={`Compra con ${card.name}`}
                  >
                    <ExpenseForm
                      accounts={options.accounts}
                      cards={options.cards}
                      categories={options.categories}
                      rules={options.rules}
                      today={today}
                      defaults={{ source: 'CREDIT_CARD', creditCardId: card.id, currency: card.currency }}
                    />
                  </Dialog>
                  <Dialog
                    label="Editar"
                    icon="edit"
                    buttonClassName="ghost-button small-button"
                    title="Editar tarjeta"
                  >
                    <CardForm
                      defaults={{
                        id: card.id,
                        name: card.name,
                        last4: card.last4,
                        currency: card.currency,
                        closingDay: card.closingDay,
                        dueDay: card.dueDay,
                        notes: card.notes,
                        isActive: card.isActive,
                      }}
                    />
                  </Dialog>
                  <Link href={`/ajustes/importar?tarjeta=${card.id}`} className="ghost-button small-button">
                    <Icon name="upload" size={14} /> Importar resumen
                  </Link>
                </div>
              </div>

              <div className="stack-sm">
                {currencies.map((cur) => {
                  const thisMonth = unpaid.filter((item) => item.currency === cur && item.period === current)
                  const overdue = unpaid.filter((item) => item.currency === cur && item.period < current)
                  const future = unpaid.filter((item) => item.currency === cur && item.period > current)
                  const cardBills = cardChargedBillsForPeriod(data.input, cur, current).filter(
                    (item) => item.bill.creditCardId === card.id,
                  )
                  const dueThisMonth = sumCents(thisMonth.map((item) => item.amountCents))
                  const dueBills = sumCents(cardBills.map((item) => item.expectedCents))
                  const overdueCents = sumCents(overdue.map((item) => item.amountCents))
                  const futureCents = sumCents(future.map((item) => item.amountCents))
                  const remaining = dueThisMonth + dueBills + overdueCents
                  const payment = card.payments.find(
                    (item) => item.period === current && item.currency === cur,
                  )
                  const paidAmount = payment ? Math.round(Number(payment.amount) * 100) : 0
                  const cardStatements = statementImports
                    .filter((item) => item.creditCardId === card.id && item.period)
                    .sort((first, second) => (first.period! < second.period! ? 1 : -1))
                  const latestStatement = cardStatements[0]
                  const totalFor = (item?: (typeof cardStatements)[number]) =>
                    item
                      ? cur === 'UYU'
                        ? item.totalUyu != null
                          ? Math.round(Number(item.totalUyu) * 100)
                          : item.totalAmount != null
                            ? Math.round(Number(item.totalAmount) * 100)
                            : null
                        : item.totalUsd != null
                          ? Math.round(Number(item.totalUsd) * 100)
                          : null
                      : null
                  const currentStatement = cardStatements.find((item) => item.period === current)
                  const statementTotal = totalFor(currentStatement)
                  const latestTotal = totalFor(latestStatement)
                  const displayAmount = remaining > 0 ? remaining : paidAmount
                  const paymentDefault = statementTotal ?? displayAmount
                  const activePlans = new Set(
                    unpaid.filter((item) => item.currency === cur && item.count > 1).map((item) => item.expenseId),
                  ).size

                  return (
                    <section className="panel card-summary" key={cur}>
                      <div className="between" style={{ gap: 8 }}>
                        <p>
                          {overdueCents > 0
                            ? `Pendiente total en ${cur === 'UYU' ? 'pesos' : 'dólares'}`
                            : `${cur === 'UYU' ? 'Resumen en pesos' : 'Resumen en dólares'} · ${monthLabel(current)}`}
                        </p>
                        {remaining === 0 && payment ? (
                          <Badge tone="ok">Pagado</Badge>
                        ) : overdueCents > 0 ? (
                          <Badge tone="danger">Vencido</Badge>
                        ) : (
                          <Badge tone="info">A pagar</Badge>
                        )}
                      </div>
                      <strong>
                        <Money cents={displayAmount} currency={cur} />
                      </strong>
                      <span>
                        Vence el día {card.dueDay}
                        {cardBills.length > 0 ? ' · incluye cuentas cargadas a la tarjeta' : ''}
                      </span>
                      {cur === 'USD' && displayAmount > 0 ? (
                        <p className="hint" style={{ marginTop: 4 }}>
                          ≈ <Money cents={convertUsdToUyu(displayAmount, user.usdRateCents)} currency="UYU" /> a la
                          cotización configurada ({formatRate(user.usdRateCents)} por dólar).
                        </p>
                      ) : null}
                      {statementTotal != null ? (
                        <p className="hint" style={{ marginTop: 6 }}>
                          Total del resumen de {monthLabel(current)}: <Money cents={statementTotal} currency={cur} />.
                          La deuda registrada puede diferir por pagos o créditos ya aplicados por el banco.
                        </p>
                      ) : latestTotal != null && latestStatement?.period ? (
                        <p className="hint" style={{ marginTop: 6 }}>
                          Último resumen importado ({monthLabel(latestStatement.period)}):{' '}
                          <Money cents={latestTotal} currency={cur} />.
                        </p>
                      ) : null}

                      <div className="card-summary-row">
                        <div>
                          <small>Cuotas futuras</small>
                          <b>
                            <Money cents={futureCents} currency={cur} />
                          </b>
                        </div>
                        <div>
                          <small>Cuotas activas</small>
                          <b>{activePlans}</b>
                        </div>
                      </div>

                      <div className="row" style={{ marginTop: 12, gap: 8, flexWrap: 'wrap' }}>
                        <Dialog
                          label={remaining === 0 && payment ? 'Corregir pago' : 'Registrar pago'}
                          icon="check"
                          buttonClassName="primary-button small-button"
                          title={`Pago de ${card.name} · ${cur}`}
                          description="Se descuenta la cuenta elegida y se marcan las cuotas del período como pagadas."
                        >
                          <CardPaymentForm
                            cards={options.cards}
                            accounts={options.accounts}
                            defaultCardId={card.id}
                            defaultPeriod={current}
                            defaultCurrency={cur}
                            defaultAmount={fromCents(paymentDefault)}
                            usdRateCents={user.usdRateCents}
                          />
                        </Dialog>
                        {payment ? (
                          <span className="hint">
                            Pagado: <Money cents={paidAmount} currency={cur} /> el{' '}
                            {payment.paidAt.toISOString().slice(0, 10)}
                          </span>
                        ) : null}
                      </div>
                    </section>
                  )
                })}
              </div>
            </div>

            {(() => {
              const bills = CURRENCIES.flatMap((cur) =>
                cardChargedBillsForPeriod(data.input, cur, current).filter(
                  (item) => item.bill.creditCardId === card.id,
                ),
              )
              if (bills.length === 0) return null
              return (
                <section className="panel tight">
                  <SectionHead title="Cuentas cargadas a esta tarjeta" note={`Resumen de ${monthLabel(current)}`} />
                  <div className="transaction-list">
                    {bills.map((item) => (
                      <div className="transaction" key={`${item.bill.id}-${item.dueDate}-${item.bill.currency}`}>
                        <span className="category-icon lavender">
                          <Icon name="receipt" size={15} />
                        </span>
                        <div className="item-main">
                          <strong>{item.bill.name}</strong>
                          <small>Vence el {item.dueDate} · se paga con el resumen</small>
                        </div>
                        <div className="item-amount">
                          <strong>
                            <Money cents={item.expectedCents} currency={item.bill.currency} />
                          </strong>
                          <span className={item.exact ? 'paid' : 'estimated'}>{item.exact ? 'Fijo' : 'Estimado'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )
            })()}

            {(() => {
              const periods = [...new Set(unpaid.map((item) => item.period))].sort()
              if (periods.length === 0) return null
              return (
                <section className="panel">
                  <SectionHead
                    title="Próximos resúmenes"
                    note="Suma de las cuotas pendientes en cada vencimiento"
                  />
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Resumen</th>
                          <th className="num">Pesos</th>
                          <th className="num">Dólares</th>
                          <th className="num">Cuotas</th>
                          <th>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {periods.slice(0, 12).map((period) => {
                          const items = unpaid.filter((item) => item.period === period)
                          const uyu = sumCents(items.filter((item) => item.currency === 'UYU').map((item) => item.amountCents))
                          const usd = sumCents(items.filter((item) => item.currency === 'USD').map((item) => item.amountCents))
                          return (
                            <tr key={period}>
                              <td>{monthLabel(period)}</td>
                              <td className="num">
                                {uyu > 0 ? <Money cents={uyu} currency="UYU" /> : <span className="hint">—</span>}
                              </td>
                              <td className="num">
                                {usd > 0 ? <Money cents={usd} currency="USD" /> : <span className="hint">—</span>}
                              </td>
                              <td className="num">{items.length}</td>
                              <td>
                                {period < current ? (
                                  <Badge tone="danger">Vencido</Badge>
                                ) : period === current ? (
                                  <Badge tone="info">En curso</Badge>
                                ) : (
                                  <Badge tone="neutral">Estimado</Badge>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              )
            })()}

            <section className="panel">
              <SectionHead
                title="Cuotas pendientes"
                note="Cada cuota se imputa al resumen que corresponde, no al mes de la compra"
                action={<span className="count-chip">{unpaid.length} cuotas</span>}
              />
              {unpaid.length === 0 ? (
                <p className="hint">No hay cuotas pendientes registradas.</p>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Comercio</th>
                        <th>Cuota</th>
                        <th>Resumen</th>
                        <th>Moneda</th>
                        <th className="num">Importe</th>
                        <th>Estado</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {unpaid
                        .slice()
                        .sort((a, b) => (a.period < b.period ? -1 : a.period > b.period ? 1 : a.number - b.number))
                        .slice(0, 60)
                        .map((item) => {
                          const expense = data.input.expenses.find((row) => row.id === item.expenseId)
                          return (
                            <tr key={item.id}>
                              <td>{expense?.merchant ?? 'Compra'}</td>
                              <td>
                                {item.number} de {item.count}
                              </td>
                              <td>
                                {monthLabel(item.period)}
                                {item.period < current ? (
                                  <span className="badge danger" style={{ marginLeft: 6 }}>
                                    Vencida
                                  </span>
                                ) : null}
                              </td>
                              <td>{item.currency}</td>
                              <td className="num">
                                <Money cents={item.amountCents} currency={item.currency} />
                              </td>
                              <td>
                                {item.isEstimated ? <Badge tone="warn">Estimada</Badge> : <Badge tone="ok">Calculada</Badge>}
                              </td>
                              <td>
                                <Dialog
                                  label="Editar cuota"
                                  icon="edit"
                                  buttonClassName="ghost-button small-button"
                                  title="Corregir cuota"
                                  description="Ajustá el importe o el resumen si el banco lo ubicó distinto."
                                >
                                  <InstallmentForm
                                    installment={{
                                      id: item.id,
                                      number: item.number,
                                      count: item.count,
                                      amount: fromCents(item.amountCents),
                                      period: item.period,
                                      isPaid: item.isPaid,
                                      dueDate: item.dueDate,
                                    }}
                                  />
                                </Dialog>
                              </td>
                            </tr>
                          )
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="panel">
              <SectionHead title="Pagos de resumen registrados" note="Descuentan la cuenta y saldan las cuotas del período" />
              {card.payments.length === 0 ? (
                <p className="hint">Todavía no registraste pagos de resumen.</p>
              ) : (
                <div className="transaction-list">
                  {card.payments.map((payment) => (
                    <div className="transaction" key={payment.id}>
                      <span className="category-icon mint">
                        <Icon name="check" size={15} />
                      </span>
                      <div className="item-main">
                        <strong>
                          Resumen {monthLabel(payment.period)} · {payment.currency}
                        </strong>
                        <small>
                          Pagado el {payment.paidAt.toISOString().slice(0, 10)}
                          {payment.account ? ` desde ${payment.account.name}` : ' fuera de las cuentas registradas'}
                          {payment.accountAmount != null &&
                          Math.round(Number(payment.accountAmount) * 100) !==
                            Math.round(Number(payment.amount) * 100) ? (
                            <>
                              {' '}
                              · debitado{' '}
                              <Money
                                cents={Math.round(Number(payment.accountAmount) * 100)}
                                currency={payment.account?.currency ?? 'UYU'}
                              />
                              {payment.exchangeRate
                                ? ` (cotización ${formatRate(payment.exchangeRate)})`
                                : ''}
                            </>
                          ) : null}
                          {payment.note ? ` · ${payment.note}` : ''}
                        </small>
                      </div>
                      <div className="item-amount">
                        <strong>
                          <Money cents={Math.round(Number(payment.amount) * 100)} currency={payment.currency} />
                        </strong>
                        <MiniForm
                          action={deleteCardPayment}
                          hidden={{ id: payment.id }}
                          label="Deshacer"
                          className="ghost-button small-button"
                          confirmMessage="¿Deshacer este pago? Las cuotas del período vuelven a quedar pendientes y el saldo se recalcula."
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )
      })}
    </div>
  )
}
