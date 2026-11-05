import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { loadFinanceData, loadFormOptions } from '@/lib/finance/data'
import {
  billChargePeriod,
  billExpectedCents,
  billRangeCents,
  billsInMonth,
  cardChargedBillsForPeriod,
  type BillSnapshot,
} from '@/lib/finance/engine'
import { addMonthsKey, dateInMonth, isRecurringInPeriod, monthLabel, recurrenceStepMonths, todayISO } from '@/lib/period'
import { fromCents, sumCents, type CurrencyCode } from '@/lib/money'
import { Money, Badge, SectionHead, EmptyState } from '@/components/ui'
import { Icon } from '@/components/icons'
import { Dialog } from '@/components/dialog'
import { BillActualForm, BillForm, MiniForm, PayBillForm } from '@/components/forms/other-forms'
import { deleteBill, unpayBillOccurrence } from '@/app/actions/bills'
import { MonthKpis, type MonthKpi } from '@/components/finance/month-kpis'

export const metadata: Metadata = { title: 'Cuentas fijas' }
export const dynamic = 'force-dynamic'

export default async function CuentasPage() {
  const user = await requireUser()
  const [data, options, billRows] = await Promise.all([
    loadFinanceData(user.id, { months: 6 }),
    loadFormOptions(user.id),
    prisma.recurringBill.findMany({
      where: { userId: user.id },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: {
        category: true,
        account: true,
        creditCard: true,
        occurrences: { orderBy: { period: 'desc' }, take: 24 },
      },
    }),
  ])
  const today = todayISO()
  const current = data.overview.currentMonth
  const upcomingMonths = [current, addMonthsKey(current, 1), addMonthsKey(current, 2)]

  const monthSummaries: MonthKpi[] = upcomingMonths.map((month) => {
    const bankBills = billsInMonth(data.input, month).filter((item) => !item.chargedToCard)
    const cardBills = (['UYU', 'USD'] as CurrencyCode[]).flatMap((cur) =>
      cardChargedBillsForPeriod(data.input, cur, month),
    )
    const items = [
      ...bankBills.map((item) => ({
        name: item.bill.name,
        amountCents: item.expectedCents,
        currency: item.bill.currency as CurrencyCode,
        frequency: item.bill.frequency,
        chargedToCard: false,
        estimated: !item.exact,
      })),
      ...cardBills.map((item) => ({
        name: item.bill.name,
        amountCents: item.expectedCents,
        currency: item.bill.currency as CurrencyCode,
        frequency: item.bill.frequency,
        chargedToCard: true,
        estimated: !item.exact,
      })),
    ].sort((first, second) => {
      const firstMonthly = first.frequency === 'MONTHLY' ? 1 : 0
      const secondMonthly = second.frequency === 'MONTHLY' ? 1 : 0
      if (firstMonthly !== secondMonthly) return firstMonthly - secondMonthly
      return first.name.localeCompare(second.name)
    })

    return {
      period: month,
      totals: {
        UYU: sumCents(items.filter((item) => item.currency === 'UYU').map((item) => item.amountCents)),
        USD: sumCents(items.filter((item) => item.currency === 'USD').map((item) => item.amountCents)),
      },
      items,
      note: month === current ? 'Incluye lo pendiente de este mes' : undefined,
    }
  })

  if (billRows.length === 0) {
    return (
      <div className="stack">
        <EmptyState title="Todavía no registraste cuentas fijas">
          Alquiler, internet, UTE, suscripciones: cargalas una vez y se proyectan mes a mes.
        </EmptyState>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Dialog label="Nueva cuenta fija" icon="plus" title="Nueva cuenta fija">
            <BillForm
              accounts={options.accounts}
              cards={options.cards}
              categories={options.categories}
              today={today}
            />
          </Dialog>
        </div>
      </div>
    )
  }

  return (
    <div className="stack">
      <div className="between" style={{ flexWrap: 'wrap' }}>
        <p className="hint" style={{ maxWidth: 640 }}>
          Las cuentas con importe variable se proyectan como rango. Si se pagan con tarjeta, se imputan al resumen y
          no se descuentan dos veces.
        </p>
        <Dialog label="Nueva cuenta fija" icon="plus" buttonClassName="secondary-button" title="Nueva cuenta fija">
          <BillForm accounts={options.accounts} cards={options.cards} categories={options.categories} today={today} />
        </Dialog>
      </div>

      <MonthKpis months={monthSummaries} />

      <section className="panel">
        <SectionHead title="Tus cuentas" note="Estado del mes en curso" />
        <div className="stack-sm">
          {billRows.map((bill) => {
            const snapshot = data.input.bills.find((item) => item.id === bill.id) as BillSnapshot
            const occurrence =
              data.input.billOccurrences.find((item) => item.billId === bill.id && item.period === current) ?? null
            const dueDate = occurrence?.dueDate ?? dateInMonth(current, bill.dueDay)
            const expected = snapshot ? billExpectedCents(snapshot, occurrence) : 0
            const range = snapshot ? billRangeCents(snapshot, occurrence) : { min: 0, max: 0, exact: true }
            const paid = occurrence?.status === 'PAID'
            const chargedToCard = bill.paymentSource === 'CREDIT_CARD'
            const chargePeriod = chargedToCard
              ? billChargePeriod(snapshot, data.input.cards, dueDate)
              : null
            const appliesThisMonth = isRecurringInPeriod(
              bill.startDate.toISOString().slice(0, 10),
              bill.endDate ? bill.endDate.toISOString().slice(0, 10) : null,
              current,
              recurrenceStepMonths(bill.frequency),
            )

            return (
              <div className="import-row" key={bill.id} style={{ marginBottom: 0 }}>
                <div className="row" style={{ alignItems: 'flex-start' }}>
                  <span className="category-icon lavender">
                    <Icon name="receipt" size={16} />
                  </span>
                  <div className="item-main">
                    <strong>
                      {bill.name}{' '}
                      {!bill.isActive ? <Badge tone="neutral">Inactiva</Badge> : null}
                      {chargedToCard ? <Badge tone="info">Tarjeta</Badge> : null}
                      {bill.amountType === 'RANGE' ? <Badge tone="warn">Variable</Badge> : null}
                    </strong>
                    <small>
                      {bill.category?.name ?? 'Sin categorizar'} · vence el día {bill.dueDay} ·{' '}
                      {bill.frequency === 'MONTHLY'
                        ? 'mensual'
                        : bill.frequency === 'BIMONTHLY'
                          ? 'bimestral'
                          : bill.frequency === 'QUARTERLY'
                            ? 'trimestral'
                            : bill.frequency === 'SEMIANNUAL'
                              ? 'semestral'
                              : 'anual'}
                      {' · desde '}
                      {monthLabel(bill.startDate.toISOString().slice(0, 7))}
                      {bill.account ? ` · ${bill.account.name}` : ''}
                      {bill.creditCard ? ` · ${bill.creditCard.name}` : ''}
                    </small>
                    {!appliesThisMonth ? (
                      <small style={{ color: 'var(--muted-2)' }}>No corresponde a este mes.</small>
                    ) : null}
                    {chargedToCard && chargePeriod ? (
                      <small>Se cobra en el resumen de {monthLabel(chargePeriod)}.</small>
                    ) : null}
                  </div>

                  <div className="item-amount">
                    <strong>
                      <Money cents={paid ? occurrence?.amountActualCents ?? expected : expected} currency={bill.currency} />
                    </strong>
                    {paid ? (
                      <span className="paid">Pagada</span>
                    ) : bill.amountType === 'RANGE' ? (
                      <span className="estimated">
                        {fromCents(range.min)}–{fromCents(range.max)}
                      </span>
                    ) : (
                      <span>Pendiente</span>
                    )}
                  </div>
                </div>

                <div className="row" style={{ marginTop: 8, marginLeft: 46 }}>
                  {chargedToCard ? (
                    <span className="badge info">
                      Se paga con el resumen{chargePeriod ? ` de ${monthLabel(chargePeriod)}` : ''}
                    </span>
                  ) : paid ? (
                    <MiniForm
                      action={unpayBillOccurrence}
                      hidden={{ billId: bill.id, period: current }}
                      label="Deshacer pago"
                      className="ghost-button small-button"
                      confirmMessage="¿Marcar esta cuenta como pendiente otra vez?"
                    />
                  ) : (
                    <Dialog
                      label="Registrar pago"
                      icon="check"
                      buttonClassName="secondary-button small-button"
                      title={`Pagar ${bill.name} · ${monthLabel(current)}`}
                      description={chargedToCard ? 'Se registra como pagada y se imputa al resumen de la tarjeta.' : 'Se descuenta el saldo de la cuenta elegida.'}
                    >
                      <PayBillForm
                        bill={{
                          id: bill.id,
                          name: bill.name,
                          paymentSource: bill.paymentSource,
                          currency: bill.currency,
                        }}
                        accounts={options.accounts}
                        period={current}
                        defaultAmount={fromCents(expected)}
                        chargedToCard={chargedToCard}
                      />
                    </Dialog>
                  )}
                  {bill.amountType === 'RANGE' ? (
                    <Dialog
                      label="Importe real"
                      icon="edit"
                      buttonClassName="ghost-button small-button"
                      title={`Importe real de ${bill.name}`}
                      description="Reemplaza el rango estimado en la proyección."
                    >
                      <BillActualForm billId={bill.id} period={current} defaultAmount={fromCents(expected)} />
                    </Dialog>
                  ) : null}
                  <Dialog
                    label="Editar"
                    icon="edit"
                    buttonClassName="ghost-button small-button"
                    title={`Editar ${bill.name}`}
                  >
                    <BillForm
                      accounts={options.accounts}
                      cards={options.cards}
                      categories={options.categories}
                      today={today}
                      defaults={{
                        id: bill.id,
                        name: bill.name,
                        categoryId: bill.categoryId,
                        amountType: bill.amountType,
                        amountFixed: bill.amountFixed ? fromCents(Math.round(Number(bill.amountFixed) * 100)) : null,
                        amountMin: bill.amountMin ? fromCents(Math.round(Number(bill.amountMin) * 100)) : null,
                        amountMax: bill.amountMax ? fromCents(Math.round(Number(bill.amountMax) * 100)) : null,
                        currency: bill.currency,
                        frequency: bill.frequency,
                        dueDay: bill.dueDay,
                        paymentSource: bill.paymentSource,
                        accountId: bill.accountId,
                        creditCardId: bill.creditCardId,
                        startDate: bill.startDate.toISOString().slice(0, 10),
                        endDate: bill.endDate ? bill.endDate.toISOString().slice(0, 10) : null,
                        isActive: bill.isActive,
                        notes: bill.notes,
                      }}
                    />
                  </Dialog>
                  <MiniForm
                    action={deleteBill}
                    hidden={{ id: bill.id }}
                    label="Eliminar"
                    className="ghost-button small-button"
                    confirmMessage="¿Eliminar esta cuenta y su historial de pagos?"
                  />
                  <span className="spacer" />
                  {bill.occurrences.length > 0 ? (
                    <span className="hint">
                      Último pago: {bill.occurrences[0].period} ·{' '}
                      <Money
                        cents={Math.round(Number(bill.occurrences[0].amountActual ?? 0) * 100)}
                        currency={bill.currency}
                      />
                    </span>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      </section>

    </div>
  )
}
