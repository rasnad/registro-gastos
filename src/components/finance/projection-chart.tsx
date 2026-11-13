import Link from 'next/link'
import { Money } from '@/components/ui'
import { monthLabel, dateLabel, todayISO } from '@/lib/period'
import type { MonthlyFlow } from '@/lib/finance/engine'
import type { CurrencyCode } from '@/lib/money'
import { Icon } from '@/components/icons'
import type { ReactNode } from 'react'

export function ProjectionChart({
  flows,
  currency,
  compact = false,
  compactOnMobile = false,
}: {
  flows: MonthlyFlow[]
  currency: CurrencyCode
  compact?: boolean
  compactOnMobile?: boolean
}) {
  if (flows.length === 0) return null
  const availableOf = (flow: MonthlyFlow) => flow.startCents + flow.incomeCents
  const outflowsOf = (flow: MonthlyFlow) =>
    flow.cardCents + flow.billsCents + flow.otherExpensesCents + flow.savingsCents
  const max = Math.max(1, ...flows.map((flow) => Math.max(availableOf(flow), outflowsOf(flow))))
  const visible = compact ? flows.slice(0, 4) : flows

  return (
    <div className={`bar-chart${compactOnMobile ? ' bar-chart-mobile-compact' : ''}`} role="img" aria-label={`Proyección mensual en ${currency}`}>
      {visible.map((flow) => {
        const available = availableOf(flow)
        const outflows = outflowsOf(flow)
        return (
          <div className="chart-column" key={flow.period}>
            <div className="bars">
              <span className="income-bar" style={{ height: `${Math.max(2, (available / max) * 100)}%` }} />
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
  actions,
}: {
  actions?: Record<string, (content: ReactNode) => ReactNode>
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
  const today = todayISO()
  if (items.length === 0) {
    return <p className="hint">No hay pagos previstos en los próximos meses.</p>
  }
  return (
    <div className="due-list">
      {items.map((item) => {
        const day = item.dueDate.slice(8, 10)
        const month = monthLabel(item.dueDate.slice(0, 7), { year: false }).slice(0, 3).toUpperCase()
        const overdue = item.dueDate < today
        const content = (
          <>
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
          </>
        )
        const className = `due-item ${item.dueDate.slice(0, 7) <= today.slice(0, 7) ? 'due-current' : 'due-future'}`
        return actions?.[item.id] ? (
          <div key={item.id} className={className}>{actions[item.id](content)}</div>
        ) : (
          <Link key={item.id} href={item.href} className={className} style={{ textDecoration: 'none', color: 'inherit' }}>{content}</Link>
        )
      })}
    </div>
  )
}
