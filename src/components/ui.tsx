import type { ReactNode } from 'react'
import { CURRENCY_SYMBOL, formatNumber, type CurrencyCode } from '@/lib/money'
import { Icon, type IconName } from '@/components/icons'

export function Money({
  cents,
  currency,
  className = '',
  signed = false,
  decimals,
}: {
  cents: number
  currency: CurrencyCode
  className?: string
  signed?: boolean
  decimals?: boolean
}) {
  const negative = cents < 0
  const value = Math.abs(cents)
  const sign = signed ? (negative ? '−' : '+') : negative ? '−' : ''
  return (
    <span className={`money ${className}`.trim()}>
      {sign}
      <span className="cur">{CURRENCY_SYMBOL[currency]}</span>
      {formatNumber(value, { decimals })}
    </span>
  )
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'outline'
}) {
  return <span className={`badge ${tone === 'neutral' ? '' : tone}`.trim()}>{children}</span>
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      {children}
    </div>
  )
}

export function Alert({
  tone = 'info',
  title,
  children,
  actions,
}: {
  tone?: 'info' | 'warn' | 'danger' | 'ok'
  title?: string
  children?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className={`alert ${tone}`} role={tone === 'danger' ? 'alert' : undefined}>
      <Icon name={tone === 'danger' || tone === 'warn' ? 'warning' : tone === 'ok' ? 'check' : 'info'} size={17} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {title ? <strong>{title}</strong> : null}
        {children ? <div>{children}</div> : null}
      </div>
      {actions ? <div className="alert-actions">{actions}</div> : null}
    </div>
  )
}

export function SectionHead({
  title,
  note,
  action,
}: {
  title: string
  note?: string
  action?: ReactNode
}) {
  return (
    <div className="section-head">
      <div>
        <h2>{title}</h2>
        {note ? <p>{note}</p> : null}
      </div>
      {action}
    </div>
  )
}

export function CategoryDot({ icon, color }: { icon?: string | null; color?: string | null }) {
  const iconName = (icon ?? 'dots') as IconName
  return (
    <span className={`category-icon ${color ?? 'gray'}`}>
      <Icon name={iconName} size={16} />
    </span>
  )
}

export function Progress({ value, max }: { value: number; max: number }) {
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(100, Math.round((value / max) * 100)))
  return (
    <div className="goal-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${pct}%` }} />
    </div>
  )
}

export function CurrencyBlock({
  currency,
  label,
  cents,
  children,
}: {
  currency: CurrencyCode
  label: string
  cents: number
  children?: ReactNode
}) {
  return (
    <div className={`currency-block ${currency === 'USD' ? 'usd' : ''}`}>
      <header>
        <span>{label}</span>
        <span>{currency}</span>
      </header>
      <strong>
        <Money cents={cents} currency={currency} />
      </strong>
      {children}
    </div>
  )
}
