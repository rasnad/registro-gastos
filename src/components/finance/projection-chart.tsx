import Link from 'next/link'
import { Money } from '@/components/ui'
import { monthLabel, dateLabel } from '@/lib/period'
import type { MonthlyFlow } from '@/lib/finance/engine'
import type { CurrencyCode } from '@/lib/money'
import { Icon } from '@/components/icons'

export function ProjectionChart({
  flows,
  currency,
  compact = false,
}: {
  flows: MonthlyFlow[]
  currency: CurrencyCode
  compact?: boolean
}) {
  if (flows.length === 0) return null
  const max = Math.max(
    1,
    ...flows.map((flow) => Math.max(flow.incomeCents, flow.cardCents + flow.billsCents + flow.otherExpensesCents)),
  )
  const visible = compact ? flows.slice(0, 4) : flows

  return (
    <div className="bar-chart" role="img" aria-label={`Proyección de los próximos ${visible.length} meses en ${currency}`}>
      {visible.map((flow) => {
        const outflows = flow.cardCents + flow.billsCents + flow.otherExpensesCents
        return (
          <div className="chart-column" key={flow.period}>
            <div className="bars">
              <span className="income-bar" style={{ height: `${Math.max(2, (flow.incomeCents / max) * 100)}%` }} />
              <span className="expense-bar" style={{ height: `${Math.max(2, (outflows / max) * 100)}%` }} />
            </div>
            <strong>{monthLabel(flow.period, { short: true, year: false })}</strong>
            <small className={flow.endCents >= 0 ? 'positive' : 'negative'}>
              <Money cents={flow.endCents} currency={currency} />
            </small>
            {flow.isCurrent ? <em>HOY</em> : null}
          </div>
        )
      })}
    </div>
  )
}

export function MonthRows({ flows, currency }: { flows: MonthlyFlow[]; currency: CurrencyCode }) {
  return (
    <div className="month-list">
      {flows.map((flow) => (
        <div className="month-row" key={flow.period}>
          <span className="month-icon">
            <Icon name="calendar" size={16} />
          </span>
          <div className="item-main">
            <strong>{monthLabel(flow.period)}</strong>
            <small>
              Ingresos <Money cents={flow.incomeCents} currency={currency} />
            </small>
          </div>
          <div>
            <small>Sale</small>
            <strong>
              <Money cents={flow.cardCents + flow.billsCents + flow.otherExpensesCents + flow.savingsCents} currency={currency} />
            </strong>
          </div>
          <div className={flow.endMinCents >= 0 ? 'positive' : 'negative'}>
            <small>Queda</small>
            <strong>
              <Money cents={flow.endCents} currency={currency} />
            </strong>
          </div>
        </div>
      ))}
    </div>
  )
}

export function UpcomingList({
  items,
}: {
  items: Array<{
    id: string
    title: string
    subtitle: string
    dueDate: string
    amountCents: number
    currency: CurrencyCode
    estimated: boolean
    href: string
  }>
}) {
  const today = new Date().toISOString().slice(0, 10)
  if (items.length === 0) {
    return <p className="hint">No hay pagos previstos en los próximos meses.</p>
  }
  return (
    <div className="due-list">
      {items.map((item) => {
        const day = item.dueDate.slice(8, 10)
        const month = monthLabel(item.dueDate.slice(0, 7), { year: false }).slice(0, 3).toUpperCase()
        const overdue = item.dueDate < today
        return (
          <Link key={item.id} href={item.href} className="due-item" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="date-box" style={overdue ? { background: '#fbeae7', color: '#b3564a' } : undefined}>
              <strong>{day}</strong>
              <small>{month}</small>
            </div>
            <div className="item-main">
              <strong>{item.title}</strong>
              <small>
                {item.subtitle}
                {overdue ? ' · vencido' : ''}
              </small>
            </div>
            <div className="item-amount">
              <strong>
                <Money cents={item.amountCents} currency={item.currency} />
              </strong>
              <span className={item.estimated ? 'estimated' : ''}>
                {item.estimated ? 'Estimado' : dateLabel(item.dueDate)}
              </span>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
