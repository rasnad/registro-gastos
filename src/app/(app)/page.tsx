import Link from 'next/link'
import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth'
import { loadFinanceData, loadFormOptions } from '@/lib/finance/data'
import { billObligationBalance, cardObligationBalance, dashboardCommitments, accountBalanceBreakdown, unassignedIncomeByCurrency } from '@/lib/finance/engine'
import { fromCents } from '@/lib/money'
import { Dialog } from '@/components/dialog'
import { PayBillForm, CardPaymentForm } from '@/components/forms/other-forms'
import type { ReactNode } from 'react'
import { Money, Alert, SectionHead, Badge } from '@/components/ui'
import { Icon } from '@/components/icons'
import { monthLabel } from '@/lib/period'
import { ProjectionChart, UpcomingList } from '@/components/finance/projection-chart'

export const metadata: Metadata = { title: 'Inicio' }
export const dynamic = 'force-dynamic'

export default async function HomePage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const user = await requireUser()
  const data = await loadFinanceData(user.id, { months: 6 })
  const [options, params] = await Promise.all([loadFormOptions(user.id),searchParams])
  const selected = params.mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.mes) ? params.mes : data.overview.currentMonth
  const dashboard = dashboardCommitments(data.input,selected,user.usdRateCents)
  const { overview } = data
  const uyu = overview.summaries.UYU
  const usd = overview.summaries.USD
  const unassignedIncome = unassignedIncomeByCurrency(data.input)

  const hasUsd =
    data.input.accounts.some((account) => account.currency === 'USD') ||
    usd.availableCents !== 0 ||
    usd.cardFutureCents > 0 ||
    usd.committedCents > 0
  const hasUsdFinances =
    data.input.accounts.some((account) => account.currency === 'USD') ||
    data.input.incomes.some((income) => income.currency === 'USD' && income.isActive)
  const usdWarnings = hasUsdFinances
    ? usd.missing
    : usd.missing.filter(
        (item) =>
          item !== 'No hay cuentas con saldo registradas en esta moneda.' &&
          item !== 'No registraste ingresos para este mes.',
      )

  const noData =
    data.input.accounts.length === 0 &&
    data.input.incomes.length === 0 &&
    data.input.expenses.length === 0 &&
    data.input.installments.length === 0
  const upcoming = overview.upcoming.slice(0, 5)
  const paymentActions: Record<string, (content: ReactNode) => ReactNode> = {}
  for (const item of upcoming) {
    if (item.kind === 'BILL') {
      const bill = data.input.bills.find((row) => item.id === `bill-${row.id}-${item.dueDate.slice(0, 7)}`)
      if (!bill) continue
      const period = item.dueDate.slice(0, 7)
      const occurrence = data.input.billOccurrences.find((row) => row.billId === bill.id && row.period === period)
      paymentActions[item.id] = (content) => (
        <Dialog label={`Pagar ${bill.name}`} buttonClassName="upcoming-pay-button" title={`Pagar ${bill.name} · ${monthLabel(period)}`} description="Ingresá el importe real y elegí la cuenta desde la que pagaste." triggerContent={content}>
          <PayBillForm bill={bill} accounts={options.accounts} period={period} defaultAmount={fromCents(billObligationBalance(data.input,bill,period,occurrence).remainingCents)} chargedToCard={false} usdRateCents={user.usdRateCents} />
        </Dialog>
      )
    } else if (item.kind === 'CARD') {
      const card = data.input.cards.find(c => item.id === `card-${c.id}-${item.dueDate.slice(0,7)}-${item.currency}`)
      if (!card) continue
      paymentActions[item.id] = content => <Dialog label={`Pagar ${card.name}`} buttonClassName="upcoming-pay-button" title={`Pagar resumen · ${monthLabel(item.dueDate.slice(0,7))}`} triggerContent={content}>
        <CardPaymentForm cards={options.cards} accounts={options.accounts} defaultCardId={card.id} defaultPeriod={item.dueDate.slice(0,7)} defaultCurrency={item.currency} defaultAmount={fromCents(item.amountCents)} usdRateCents={user.usdRateCents} />
      </Dialog>
    } else if (item.kind === 'INSTALLMENT') {
      const installment = data.input.installments.find((row) => item.id === `inst-${row.id}`)
      if (!installment?.cardId || !options.cards.some((card) => card.id === installment.cardId)) continue
      const cardId = installment.cardId
      const period = installment.period
      const amount = cardObligationBalance(data.input,cardId,period,item.currency).remainingCents
      paymentActions[item.id] = (content) => (
        <Dialog label={`Pagar ${item.title}`} buttonClassName="upcoming-pay-button" title={`Pagar resumen · ${monthLabel(period)}`} description="Este pago corresponde al resumen completo de la tarjeta en esta moneda y período." triggerContent={content}>
          <CardPaymentForm cards={options.cards} accounts={options.accounts} defaultCardId={cardId} defaultPeriod={period} defaultCurrency={item.currency} defaultAmount={fromCents(amount)} usdRateCents={user.usdRateCents} />
        </Dialog>
      )
    }
  }
  const uyuFlows = overview.projections.UYU
  const tight = uyuFlows.filter((flow) => flow.endMinCents < 0)

  return (
    <div className="stack">
      {overview.reviewCount > 0 ? (
        <div className="review-banner">
          <Icon name="warning" size={17} />
          <span>
            {overview.reviewCount} dato{overview.reviewCount === 1 ? '' : 's'} importado
            {overview.reviewCount === 1 ? '' : 's'} espera{overview.reviewCount === 1 ? '' : 'n'} revisión. Ya se incluyen en los
            cálculos como estimados: confirmalos para validar los datos.
          </span>
          <span className="spacer" />
          <Link href="/movimientos?estado=revision" className="link-button">
            Revisar <Icon name="arrow" size={14} />
          </Link>
        </div>
      ) : null}

      {uyu.missing.length > 0 || (hasUsd && usdWarnings.length > 0) ? (
        <Alert tone="warn" title="Faltan datos para una proyección confiable">
          <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
            {[
              ...new Set([
                ...uyu.missing.map((item) => `Pesos: ${item}`),
                ...(hasUsd ? usdWarnings.map((item) => `Dólares: ${item}`) : []),
              ]),
            ]
              .slice(0, 3)
              .map((item) => (
                <li key={item}>{item}</li>
              ))}
          </ul>
        </Alert>
      ) : null}

      <div className="page-grid home-top">
        <section className="balance-card" aria-label="Saldo disponible">
          <div className="balance-top">
            <form className="dashboard-month" action="/">
              <label htmlFor="dashboard-month">Mes</label>
              <input id="dashboard-month" name="mes" type="month" defaultValue={selected} required />
              <button type="submit">Ver</button>
            </form>
          </div>
          <div className="balance-copy">
            <p>Disponible después de compromisos{dashboard.warnings.length ? ' · estimado' : ''}</p>
            <div className="balance-value"><Money cents={dashboard.availableAfterCommitmentsCents} currency="UYU" /></div>
            <div className="balance-subline">Saldo actual <b><Money cents={dashboard.currentBalanceUyuCents} currency="UYU" /></b></div>
          </div>
          {(usd.availableCents !== 0 || unassignedIncome.USD !== 0 || unassignedIncome.UYU !== 0) ? (
            <div className="balance-extra">
              {usd.availableCents !== 0 ? <div>Saldo en dólares <strong><Money cents={usd.availableCents} currency="USD" /></strong></div> : null}
              {(['UYU','USD'] as const).filter(cur => unassignedIncome[cur] !== 0).map(cur => (
                <div key={cur}>Ingresos recibidos sin cuenta <strong><Money cents={unassignedIncome[cur]} currency={cur} /></strong></div>
              ))}
              {(unassignedIncome.UYU !== 0 || unassignedIncome.USD !== 0) ? <small>Asignalos a una cuenta de la misma moneda para incluirlos en su saldo.</small> : null}
            </div>
          ) : null}
          <div className="hero-breakdown dashboard-breakdown">
            <div><div><span>Tarjeta · {monthLabel(selected)}</span><small>{dashboard.cards.status === 'PAID' ? 'Pagada' : dashboard.cards.status === 'PARTIAL' ? 'Pago parcial' : 'Pendiente'}</small></div><strong><Money cents={dashboard.cards.totalCents} currency="UYU" /></strong></div>
            <div><div><span>Cuentas fijas</span><small>{dashboard.bills.status === 'PAID' ? 'Todas pagadas' : dashboard.bills.status === 'PARTIAL' ? 'Parcialmente pagadas' : 'Pendientes'}</small></div><strong><Money cents={dashboard.bills.totalCents} currency="UYU" /></strong></div>
          </div>
          {dashboard.warnings.filter(warning => warning !== 'Hay cuentas variables sin importe real; los compromisos son estimados.').length ? <p className="dashboard-warning" role="status">{dashboard.warnings.filter(warning => warning !== 'Hay cuentas variables sin importe real; los compromisos son estimados.').join(' ')}</p> : null}
        </section>

        <section className="panel">
          <SectionHead
            title="Próximos pagos"
            note="Tarjeta y cuentas de los próximos meses"
            action={
              <Link href="/proyeccion" className="link-button">
                Ver todos <Icon name="arrow" size={14} />
              </Link>
            }
          />
          <UpcomingList items={upcoming} actions={paymentActions} />
          <div className="upcoming-total">
            <span>Comprometido en {monthLabel(selected)}</span>
            <strong>
              <Money cents={dashboard.cards.remainingCents + dashboard.bills.remainingCents} currency="UYU" />
            </strong>
          </div>
          <Link href="/cuentas" className="link-button" style={{ marginTop: 6 }}>
            Ver el detalle del mes <Icon name="arrow" size={13} />
          </Link>
        </section>

      </div>

      <section className="panel">
        <SectionHead
          title="Cómo se proyectan tus finanzas"
          action={
            <Link href="/proyeccion" className="link-button">
              Ajustar supuestos <Icon name="arrow" size={14} />
            </Link>
          }
        />
        {noData ? (
          <div className="empty-state" style={{ padding: '22px 18px' }}>
            <strong>Empezá por lo básico</strong>
            Con tu saldo actual, un ingreso y un par de gastos ya se puede proyectar.
            <div className="row" style={{ justifyContent: 'center', marginTop: 14 }}>
              <Link href="/ajustes#cuentas" className="secondary-button small-button">
                <Icon name="bank" size={14} /> Agregar cuenta
              </Link>
              <Link href="/ajustes#ingresos" className="secondary-button small-button">
                <Icon name="arrowDown" size={14} /> Agregar ingreso
              </Link>
              <Link href="/movimientos?nuevo=1" className="primary-button small-button">
                <Icon name="plus" size={14} /> Primer gasto
              </Link>
            </div>
          </div>
        ) : (
          <>
        <ProjectionChart flows={uyuFlows} currency="UYU" compactOnMobile />
        <div className="row" style={{ marginTop: 14, gap: 18 }}>
          {tight.length > 0 ? (
            <Badge tone="warn">
              {tight.length} mes{tight.length === 1 ? '' : 'es'} con saldo proyectado negativo
            </Badge>
          ) : (
            <Badge tone="ok">Sin meses en negativo</Badge>
          )}
        </div>
          </>
        )}
      </section>

      <section className="panel">
        <details className="disclosure">
          <summary>
            <span>
              <Icon name="info" size={15} /> De dónde sale cada número
            </span>
            <Icon name="chevron" size={15} />
          </summary>
          <div className="disclosure-body">
            {data.input.accounts.map(account => {
              const b = accountBalanceBreakdown(account,data.input)
              return <div key={account.id} className="stack-sm">
                <h3>Saldo actual · {account.name}</h3>
                <p className="hint">Inicial: <Money cents={b.openingCents} currency={account.currency} /> · Ingresos: <Money cents={b.incomeCents} currency={account.currency} /> · Ajustes: <Money cents={b.adjustmentCents} currency={account.currency} /> · Pagos de tarjeta: <Money cents={b.cardPaymentCents} currency={account.currency} /> · Pagos de cuentas fijas: <Money cents={b.billPaymentCents} currency={account.currency} /> · Otros gastos: <Money cents={b.expenseCents} currency={account.currency} /> · Aportes: <Money cents={b.contributionCents} currency={account.currency} /> · Saldo: <Money cents={b.balanceCents} currency={account.currency} /></p>
              </div>
            })}
            <div className="grid-2">
              <div>
                <h3>Saldo disponible</h3>
                <p className="hint">
                  Saldo inicial de cada cuenta + ingresos cobrados + ajustes − gastos con débito/efectivo −
                  pagos de resumen − cuentas pagadas desde la cuenta − aportes a objetivos.
                </p>
              </div>
              <div>
                <h3>Comprometido del mes</h3>
                <p className="hint">
                  Cuotas de tarjeta cuyo vencimiento cae en este mes (más las vencidas impagas) + cuentas
                  fijas/variables pendientes. Las compras con tarjeta no se descuentan del banco dos veces.
                </p>
              </div>
              <div>
                <h3>Gastado este mes</h3>
                <p className="hint">
                  Sólo gastos con débito, efectivo o transferencia. El pago del resumen de la tarjeta no
                  cuenta como consumo: salda una obligación.
                </p>
              </div>
              <div>
                <h3>Proyección</h3>
                <p className="hint">
                  Usa los ingresos fijos, las cuotas pendientes, las cuentas recurrentes y el ahorro
                  programado. Las cuentas variables se muestran como rango y los meses con datos faltantes
                  se señalan.
                </p>
              </div>
            </div>
            {uyu.missing.length > 0 ? (
              <Alert tone="info" title="Datos faltantes en pesos">
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {uyu.missing.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </Alert>
            ) : null}
          </div>
        </details>
      </section>
    </div>
  )
}
