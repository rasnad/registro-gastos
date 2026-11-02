import Link from 'next/link'
import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { loadFinanceData, loadFormOptions } from '@/lib/finance/data'
import { cardChargedBillsForPeriod, type CurrencyCode } from '@/lib/finance/engine'
import { sumCents, fromCents } from '@/lib/money'
import { monthLabel, todayISO } from '@/lib/period'
import { Money, Badge, SectionHead, EmptyState } from '@/components/ui'
import { Icon } from '@/components/icons'
import { Dialog } from '@/components/dialog'
import { ExpenseForm } from '@/components/forms/money-forms'
import { CardForm, CardPaymentForm, InstallmentForm, MiniForm } from '@/components/forms/other-forms'
import { deleteCardPayment } from '@/app/actions/cards'

export const metadata: Metadata = { title: 'Tarjetas' }
export const dynamic = 'force-dynamic'

export default async function TarjetasPage() {
  const user = await requireUser()
  const [data, options, cardRows] = await Promise.all([
    loadFinanceData(user.id, { months: 6 }),
    loadFormOptions(user.id),
    prisma.creditCard.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
      include: {
        payments: { orderBy: { paidAt: 'desc' }, take: 12, include: { account: true } },
      },
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
      <div className="between">
        <p className="hint" style={{ maxWidth: 620 }}>
          Una compra con tarjeta genera una obligación: no descuenta tu saldo bancario. Al registrar el pago del
          resumen, se descuenta la cuenta una sola vez y las cuotas quedan saldadas.
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
        const thisMonth = unpaid.filter((item) => item.period === current)
        const overdue = unpaid.filter((item) => item.period < current)
        const future = unpaid.filter((item) => item.period > current)
        const cardBills = cardChargedBillsForPeriod(data.input, card.currency, current).filter(
          (item) => item.bill.creditCardId === card.id,
        )
        const dueThisMonth = sumCents(thisMonth.map((item) => item.amountCents))
        const dueBills = sumCents(cardBills.map((item) => item.expectedCents))
        const overdueCents = sumCents(overdue.map((item) => item.amountCents))
        const futureCents = sumCents(future.map((item) => item.amountCents))
        const payAmount = dueThisMonth + dueBills
        const activePlans = new Set(unpaid.filter((item) => item.count > 1).map((item) => item.expenseId)).size
        const currency = card.currency as CurrencyCode

        const upcoming = unpaid
          .slice()
          .sort((a, b) => (a.period < b.period ? -1 : a.period > b.period ? 1 : a.number - b.number))

        return (
          <div className="stack" key={card.id}>
            <div className="cards-layout">
              <div className={`credit-card ${card.currency === 'UYU' ? 'uyu' : ''}`}>
                <div className="card-top">
                  <span>{card.name}</span>
                  <span>{card.currency}</span>
                </div>
                <div className="card-chip" />
                <div className="card-number">
                  •••• &nbsp; •••• &nbsp; •••• &nbsp; {card.last4 ?? '····'}
                </div>
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
              </div>

              <section className="panel card-summary">
                <div className="between">
                  <p>
                    {overdueCents > 0 ? 'Resúmenes vencidos + mes en curso' : `Resumen de ${monthLabel(current)}`}
                  </p>
                  {overdueCents > 0 ? <Badge tone="danger">Vencido</Badge> : <Badge tone="info">A pagar</Badge>}
                </div>
                <strong>
                  <Money cents={payAmount + overdueCents} currency={currency} />
                </strong>
                <span>
                  Vence el día {card.dueDay} · incluye {cardBills.length > 0 ? 'cuotas y cuentas con tarjeta' : 'cuotas del resumen'}
                </span>

                <div className="card-summary-row">
                  <div>
                    <small>Cuotas futuras</small>
                    <b>
                      <Money cents={futureCents} currency={currency} />
                    </b>
                  </div>
                  <div>
                    <small>Cuotas activas</small>
                    <b>{activePlans}</b>
                  </div>
                </div>

                <div className="row" style={{ marginTop: 16, gap: 8 }}>
                  <Dialog
                    label="Registrar pago"
                    icon="check"
                    buttonClassName="primary-button small-button"
                    title={`Pago de ${card.name}`}
                    description="Se descuenta la cuenta elegida y se marcan las cuotas del período como pagadas."
                  >
                    <CardPaymentForm
                      cards={options.cards}
                      accounts={options.accounts}
                      defaultCardId={card.id}
                      defaultPeriod={current}
                      defaultAmount={fromCents(payAmount + overdueCents)}
                    />
                  </Dialog>
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
                      defaults={{ source: 'CREDIT_CARD', creditCardId: card.id, currency }}
                    />
                  </Dialog>
                  <Dialog
                    label="Editar tarjeta"
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
              </section>
            </div>

            {cardBills.length > 0 ? (
              <section className="panel tight">
                <SectionHead title="Cuentas cargadas a esta tarjeta" note={`Resumen de ${monthLabel(current)}`} />
                <div className="transaction-list">
                  {cardBills.map((item) => (
                    <div className="transaction" key={`${item.bill.id}-${item.dueDate}`}>
                      <span className="category-icon lavender">
                        <Icon name="receipt" size={15} />
                      </span>
                      <div className="item-main">
                        <strong>{item.bill.name}</strong>
                        <small>Vence el {item.dueDate} · se paga con el resumen</small>
                      </div>
                      <div className="item-amount">
                        <strong>
                          <Money cents={item.expectedCents} currency={currency} />
                        </strong>
                        <span className={item.exact ? 'paid' : 'estimated'}>{item.exact ? 'Fijo' : 'Estimado'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="panel">
              <SectionHead
                title="Cuotas pendientes"
                note="Cada cuota se imputa al resumen que corresponde, no al mes de la compra"
                action={<span className="count-chip">{upcoming.length} cuotas</span>}
              />
              {upcoming.length === 0 ? (
                <p className="hint">No hay cuotas pendientes registradas.</p>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Comercio</th>
                        <th>Cuota</th>
                        <th>Resumen</th>
                        <th className="num">Importe</th>
                        <th>Estado</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {upcoming.slice(0, 40).map((item) => {
                        const expense = data.input.expenses.find((row) => row.id === item.expenseId)
                        return (
                          <tr key={item.id}>
                            <td>{expense?.merchant ?? 'Compra'}</td>
                            <td>
                              {item.number} de {item.count}
                            </td>
                            <td>
                              {monthLabel(item.period)}
                              {item.period < current ? <span className="badge danger" style={{ marginLeft: 6 }}>Vencida</span> : null}
                            </td>
                            <td className="num">
                              <Money cents={item.amountCents} currency={currency} />
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
                        <strong>Resumen {monthLabel(payment.period)}</strong>
                        <small>
                          Pagado el {payment.paidAt.toISOString().slice(0, 10)}
                          {payment.account ? ` desde ${payment.account.name}` : ' fuera de las cuentas registradas'}
                          {payment.note ? ` · ${payment.note}` : ''}
                        </small>
                      </div>
                      <div className="item-amount">
                        <strong>
                          <Money cents={Math.round(Number(payment.amount) * 100)} currency={currency} />
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
