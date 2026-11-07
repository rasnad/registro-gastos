import { PaymentHistory } from '@/components/finance/payment-history'
import { cardObligationBalance, obligationPayments } from '@/lib/finance/engine'
import Link from 'next/link'
import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { loadFinanceData, loadFormOptions } from '@/lib/finance/data'
import { cardChargedBillsForPeriod, type CurrencyCode } from '@/lib/finance/engine'
import { sumCents, fromCents, convertUsdToUyu, formatRate } from '@/lib/money'
import { monthLabel, todayISO, nextMonths, monthsBetween } from '@/lib/period'
import { Money, Badge, SectionHead, EmptyState } from '@/components/ui'
import { Icon } from '@/components/icons'
import { Dialog } from '@/components/dialog'
import { ExpenseForm } from '@/components/forms/money-forms'
import { CardForm, CardPaymentForm } from '@/components/forms/other-forms'
import { PendingPlans } from '@/components/finance/pending-plans'
import { UpcomingStatements } from '@/components/finance/upcoming-statements'

export const metadata: Metadata = { title: 'Tarjetas' }
export const dynamic = 'force-dynamic'

const CURRENCIES: CurrencyCode[] = ['UYU', 'USD']

export default async function TarjetasPage() {
  const user = await requireUser()
  const [data, options, cardRows, ledger] = await Promise.all([
    loadFinanceData(user.id, { months: 6 }),
    loadFormOptions(user.id),
    prisma.creditCard.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
      include: {
        payments: { orderBy: { paidAt: 'desc' }, take: 24, include: { account: true } },
      },
    }),
    prisma.obligationPayment.findMany({ where: { userId: user.id, obligationKind: 'CARD' }, orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }] }),
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
        <Dialog label="Agregar tarjeta" icon="plus" buttonClassName="secondary-button" title="Nueva tarjeta de crédito">
          <CardForm />
        </Dialog>
      </div>

      {cardRows.map((card) => {
        const installments = data.input.installments.filter(
          (item) => item.cardId === card.id && item.expenseStatus !== 'DISCARDED',
        )
        const unpaid = installments.filter((item) => !item.isPaid)
        const unpaidPlans = unpaid.filter((item) => item.count > 1)

        const currencies = CURRENCIES.filter((cur) => {
          if (installments.some((item) => item.currency === cur) || data.input.statementTotals?.some(s => s.cardId === card.id && s.currency === cur)) return true
          if (ledger.some((payment) => payment.obligationId === card.id && payment.currency === cur)) return true
          if (
            cardChargedBillsForPeriod(data.input, cur, current).some(
              (item) => item.bill.creditCardId === card.id,
            )
          ) {
            return true
          }
          return cur === 'UYU'
        })

        return (
          <div className="stack" key={card.id}>
            <div className="cards-layout">
              <div className="credit-card uyu">
                <div className="card-top">
                  <span>{card.name}</span>
                  <span>UYU / USD</span>
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
                      defaults={{ source: 'CREDIT_CARD', creditCardId: card.id, currency: 'UYU' }}
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

              <div className="card-summaries">
                {currencies.map((cur) => {
                  const future = unpaid.filter((item) => item.currency === cur && item.period > current)
                  const cardBills = cardChargedBillsForPeriod(data.input, cur, current).filter(
                    (item) => item.bill.creditCardId === card.id,
                  )
                  const futureCents = sumCents(future.map((item) => item.amountCents))
                  const balance = cardObligationBalance(data.input,card.id,current,cur)
                  const paidAmount = balance.paidCents
                  const partialBalance = balance.status === 'PARTIAL' ? balance.remainingCents : 0
                  const fullyPaid = balance.status === 'PAID'
                  const displayAmount = balance.totalCents
                  const paymentDefault = balance.remainingCents
                  const activePlans = new Set(
                    unpaid.filter((item) => item.currency === cur && item.count > 1).map((item) => item.expenseId),
                  ).size

                  return (
                    <section className={`panel card-summary card-summary-${cur.toLowerCase()}`} key={cur}>
                      <div className="between" style={{ gap: 8 }}>
                        <p>
                          {`${cur === 'UYU' ? 'Resumen en pesos' : 'Resumen en dólares'} · ${monthLabel(current)}`}
                        </p>
                        {partialBalance > 0 ? (
                          <Badge tone="warn">Pago parcial</Badge>
                        ) : fullyPaid ? (
                          <Badge tone="ok">Pagado</Badge>
                        ) : (
                          <Badge tone="info">Pendiente</Badge>
                        )}
                      </div>
                      <strong className={fullyPaid ? 'card-paid-amount' : undefined}>
                        <Money cents={displayAmount} currency={cur} />
                      </strong>
                      {partialBalance > 0 ? (
                        <p className="card-partial-balance">
                          Aún debés <Money cents={partialBalance} currency={cur} /> del resumen.
                        </p>
                      ) : null}
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

                      <div className="card-summary-row">
                        <div>
                          <small>Consumos futuros</small>
                          <b>
                            <Money cents={futureCents} currency={cur} />
                          </b>
                        </div>
                        <div>
                          <small>Cuotas activas</small>
                          <b>{activePlans}</b>
                        </div>
                      </div>

                      <div className="row card-summary-actions">
                        <Dialog
                          label="Registrar pago"
                          icon="check"
                          buttonClassName="primary-button small-button"
                          title={`Pago de ${card.name} · ${cur}`}
                          description="Registrá un pago parcial o completo para el período elegido."
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
                        <span className="hint">Pagado: <Money cents={paidAmount} currency={cur} /> · Pendiente: <Money cents={balance.remainingCents} currency={cur} /></span>
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

            <PaymentHistory legacyCardNotes={Object.fromEntries(card.payments.map(p => [p.id,p.note]))} legacyPayments={obligationPayments(data.input).filter(p => p.id.startsWith('legacy-card:') && p.obligationId === card.id)} payments={ledger.filter(item => item.obligationId === card.id)} accounts={options.accounts} name={card.name} usdRateCents={user.usdRateCents} />

            <UpcomingStatements installments={installments} current={current} cardId={card.id} totals={Object.fromEntries(
              nextMonths(current,Math.max(5,monthsBetween(current,installments.reduce((last,i) => i.period > last ? i.period : last,current))+1)).map(period => [period,{
                UYU:cardObligationBalance(data.input,card.id,period,'UYU').totalCents,
                USD:cardObligationBalance(data.input,card.id,period,'USD').totalCents,
              }])
            )} />

            <PendingPlans
              installments={unpaidPlans}
              merchants={Object.fromEntries(data.input.expenses.map((expense) => [expense.id, expense.merchant]))}
              current={current}
              usdRateCents={user.usdRateCents}
            />

          </div>
        )
      })}
    </div>
  )
}
