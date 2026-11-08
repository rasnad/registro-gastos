import { BillHistoryChart } from '@/components/finance/bill-history-chart'
import { PaymentHistory } from '@/components/finance/payment-history'
import { billObligationBalance, cardObligationBalance, applyShare, obligationPayments, billComparisonHistory, billMonthlyView } from '@/lib/finance/engine'
import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { loadFinanceData, loadFormOptions } from '@/lib/finance/data'
import {
  billTotalCents,
  billsInMonth,
  cardChargedBillsForPeriod,
} from '@/lib/finance/engine'
import { addMonthsKey, monthLabel, todayISO } from '@/lib/period'
import { formatMoney, fromCents, sumCents, type CurrencyCode } from '@/lib/money'
import { Money, Badge, SectionHead, EmptyState } from '@/components/ui'
import { Icon, type IconName } from '@/components/icons'
import { Dialog } from '@/components/dialog'
import { BillActualForm, BillForm, MiniForm, PayBillForm } from '@/components/forms/other-forms'
import { deleteBill } from '@/app/actions/bills'
import { MonthKpis, type MonthKpi } from '@/components/finance/month-kpis'

export const metadata: Metadata = { title: 'Cuentas fijas' }
export const dynamic = 'force-dynamic'

function accountIcon(name: string): IconName | 'bps' {
  const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (normalized.includes('tenis')) return 'tennis'
  if (normalized.includes('jubilatorio') || /\bbps\b/.test(normalized)) return 'bps'
  if (/\b(iva|fonasa)\b/.test(normalized)) return 'scale'
  if (/\b(claro|antel)\b/.test(normalized)) return 'phone'
  if (normalized.includes('alquiler')) return 'home'
  if (normalized.includes('puerta')) return 'road'
  if (/\bute\b/.test(normalized)) return 'bulb'
  if (normalized.includes('contadora') || normalized.includes('contador')) return 'landmark'
  return 'receipt'
}

export default async function CuentasPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const user = await requireUser()
  const [data, options, billRows, ledger] = await Promise.all([
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
    prisma.obligationPayment.findMany({ where: { userId: user.id, obligationKind: 'BILL' }, orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }] }),
  ])
  const today = todayISO()
  const current = data.overview.currentMonth
  const params = await searchParams
  const selected = params.mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.mes) ? params.mes : current
  const monthly = billMonthlyView(data.input, selected)
  const upcomingMonths = [current, addMonthsKey(current, 1), addMonthsKey(current, 2)]

  const monthSummaries: MonthKpi[] = upcomingMonths.map((month) => {
    const bankBills = billsInMonth(data.input, month, { includePaid: true }).filter(
      (item) => !item.chargedToCard,
    )
    const cardBills = (['UYU', 'USD'] as CurrencyCode[]).flatMap((cur) =>
      cardChargedBillsForPeriod(data.input, cur, month),
    )
    const items = [
      ...bankBills.map((item) => ({
        name: item.bill.name,
        amountCents: item.expectedCents,
        pendingCents: applyShare(billObligationBalance(data.input,item.bill,month,item.occurrence ?? undefined).remainingCents,item.bill.sharePercent),
        paidCents: applyShare(billObligationBalance(data.input,item.bill,month,item.occurrence ?? undefined).paidCents,item.bill.sharePercent),
        currency: item.bill.currency as CurrencyCode,
        frequency: item.bill.frequency,
        sharePercent: item.bill.sharePercent,
        chargedToCard: false,
        estimated: !item.exact,
        paid: item.paid,
      })),
      ...cardBills.map((item) => ({
        name: item.bill.name,
        amountCents: item.expectedCents,
        currency: item.bill.currency as CurrencyCode,
        frequency: item.bill.frequency,
        sharePercent: item.bill.sharePercent,
        pendingCents: item.expectedCents,
        paidCents: 0,
        chargedToCard: true,
        estimated: !item.exact,
        paid: cardObligationBalance(data.input,item.bill.creditCardId!,month,item.bill.currency).status === 'PAID',
      })),
    ].sort((first, second) => {
      // Primero las pendientes, después las pagadas.
      if (first.paid !== second.paid) return first.paid ? 1 : -1
      const firstMonthly = first.frequency === 'MONTHLY' ? 1 : 0
      const secondMonthly = second.frequency === 'MONTHLY' ? 1 : 0
      if (firstMonthly !== secondMonthly) return firstMonthly - secondMonthly
      return first.name.localeCompare(second.name)
    })

    return {
      period: month,
      totals: {
        UYU: sumCents(
          items.filter((item) => !item.paid && item.currency === 'UYU').map((item) => item.pendingCents),
        ),
        USD: sumCents(
          items.filter((item) => !item.paid && item.currency === 'USD').map((item) => item.pendingCents),
        ),
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
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Dialog label="Nueva cuenta fija" icon="plus" buttonClassName="secondary-button" title="Nueva cuenta fija">
          <BillForm accounts={options.accounts} cards={options.cards} categories={options.categories} today={today} />
        </Dialog>
      </div>

      <MonthKpis months={monthSummaries} />

      <BillHistoryChart history={billComparisonHistory(data.input)} current={current} />

      <section className="panel bill-list-panel">
        <div className="bill-list-heading">
          <div><h2>Tus cuentas</h2><p className="hint">{monthLabel(selected)}</p></div>
          <form className="bill-month-selector" action="/cuentas">
            <label htmlFor="bill-month">Mes</label>
            <input id="bill-month" type="month" name="mes" defaultValue={selected} required />
            <button className="secondary-button small-button" type="submit">Ver</button>
          </form>
        </div>
        <div className="bill-period-summary">
          {(['UYU', 'USD'] as CurrencyCode[]).filter(cur => cur === 'UYU' || monthly.items.some(item => item.bill.currency === cur)).map(cur => (
            <div className="bill-period-currency" key={cur}>
              <div><span>Pagado</span><strong><Money cents={monthly.totals[cur].paidCents} currency={cur} /></strong></div>
              <div><span>Pendiente</span><strong><Money cents={monthly.totals[cur].remainingCents} currency={cur} /></strong></div>
            </div>
          ))}
        </div>
        <div className="bill-table-head" aria-hidden="true"><span>Cuenta</span><span>Vencimiento</span><span>Importe</span><span>Estado</span><span>Acciones</span></div>
        {monthly.items.length === 0 ? <p className="hint bill-empty">No hay cuentas para este mes.</p> : (
          <div className="bill-list">
            {monthly.items.map(item => {
              const bill = billRows.find(row => row.id === item.bill.id)
              if (!bill) return null
              const icon = accountIcon(bill.name)
              const { balance, dueDate, chargedToCard, chargePeriod, status } = item
              const occurrence = item.occurrence
              const totalCents = billTotalCents(item.bill, occurrence)
              const payments = ledger.filter(payment => payment.obligationId === bill.id && payment.period === selected)
              const legacyPayments = obligationPayments(data.input).filter(payment => payment.id.startsWith('legacy-bill:') && payment.obligationId === bill.id && payment.period === selected)
              const dueLabel = new Intl.DateTimeFormat('es-UY', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(dueDate + 'T12:00:00Z')).replace('.', '')
              return (
                <div className="bill-list-row" key={bill.id}>
                  <details className="bill-row-details">
                    <summary className="bill-row-summary">
                      <span className="bill-row-name"><span className="bill-row-chevron" aria-hidden="true">›</span><span className="bill-row-icon" aria-hidden="true">{icon === 'bps' ? <b>BPS</b> : <Icon name={icon} size={16} />}</span><strong>{bill.name}</strong>{bill.sharePercent < 100 ? <Badge tone="info">{bill.sharePercent}%</Badge> : null}</span>
                      <span className="bill-row-date" aria-label={'Vence ' + dueLabel}>{dueLabel}</span>
                      <strong className="bill-row-amount"><Money cents={item.expectedCents} currency={bill.currency} /></strong>
                      <span className="bill-row-state"><Badge tone={status === 'PAID' ? 'ok' : status === 'PARTIAL' ? 'warn' : 'info'}>{status === 'PAID' ? 'Pagada' : status === 'PARTIAL' ? 'Pago parcial' : 'Pendiente'}</Badge></span>
                    </summary>
                    <div className="bill-row-expanded">
                      {bill.sharePercent < 100 ? <p className="hint">Importe total: {formatMoney(totalCents, bill.currency)} · tu parte: {bill.sharePercent}%</p> : null}
                      {!item.exact ? <p className="hint">Importe estimado: {formatMoney(item.minCents, bill.currency)} – {formatMoney(item.maxCents, bill.currency)}</p> : null}
                      {chargedToCard && chargePeriod ? <p className="hint">Se paga con el resumen de {monthLabel(chargePeriod)} · {bill.creditCard?.name}</p> : null}
                      {!chargedToCard ? <>
                        <p className="hint">Pagado: <Money cents={applyShare(balance.paidCents, bill.sharePercent)} currency={bill.currency} /> · Pendiente: <Money cents={applyShare(balance.remainingCents, bill.sharePercent)} currency={bill.currency} /></p>
                        <PaymentHistory defaultOpen legacyPayments={legacyPayments} payments={payments} accounts={options.accounts} name={bill.name} usdRateCents={user.usdRateCents} />
                      </> : null}
                      {bill.amountType === 'RANGE' ? <Dialog label="Importe real" icon="edit" buttonClassName="ghost-button small-button" title={`Importe real de ${bill.name} · ${monthLabel(selected)}`} description="Reemplaza el rango estimado en la proyección.">
                        <BillActualForm billId={bill.id} period={selected} defaultAmount={fromCents(totalCents)} />
                      </Dialog> : null}
                    </div>
                  </details>
                  <div className="bill-row-actions">
                    {!chargedToCard && status !== 'PAID' ? <Dialog label="Registrar pago" buttonClassName="secondary-button small-button" title={`Pagar ${bill.name} · ${monthLabel(selected)}`} description="Se descuenta el saldo de la cuenta elegida.">
                      <PayBillForm bill={{ id: bill.id, name: bill.name, paymentSource: bill.paymentSource, currency: bill.currency }} accounts={options.accounts} period={selected} defaultAmount={fromCents(balance.remainingCents)} usdRateCents={user.usdRateCents} chargedToCard={false} />
                    </Dialog> : null}
                    <details className="bill-action-menu">
                      <summary aria-label={`Acciones para ${bill.name}`}>···</summary>
                      <div className="bill-action-popover">
                        <Dialog label="Editar" icon="edit" buttonClassName="ghost-button small-button" title={`Editar ${bill.name}`}>
                          <BillForm accounts={options.accounts} cards={options.cards} categories={options.categories} today={today} defaults={{
                            id: bill.id, name: bill.name, categoryId: bill.categoryId, amountType: bill.amountType,
                            amountFixed: bill.amountFixed ? fromCents(Math.round(Number(bill.amountFixed) * 100)) : null,
                            amountMin: bill.amountMin ? fromCents(Math.round(Number(bill.amountMin) * 100)) : null,
                            amountMax: bill.amountMax ? fromCents(Math.round(Number(bill.amountMax) * 100)) : null,
                            sharePercent: bill.sharePercent, currency: bill.currency, frequency: bill.frequency, dueDay: bill.dueDay,
                            paymentSource: bill.paymentSource, accountId: bill.accountId, creditCardId: bill.creditCardId,
                            startDate: bill.startDate.toISOString().slice(0, 10), endDate: bill.endDate ? bill.endDate.toISOString().slice(0, 10) : null,
                            isActive: bill.isActive, notes: bill.notes,
                          }} />
                        </Dialog>
                        <MiniForm action={deleteBill} hidden={{ id: bill.id }} label="Eliminar" className="ghost-button small-button" confirmMessage="¿Eliminar esta cuenta y su historial de pagos?" />
                      </div>
                    </details>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

    </div>
  )
}
