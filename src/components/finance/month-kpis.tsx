'use client'

import { useState } from 'react'
import { Money } from '@/components/ui'
import { monthLabel } from '@/lib/period'
import type { CurrencyCode } from '@/lib/money'

export type MonthBillItem = {
  name: string
  amountCents: number
  pendingCents: number
  paidCents: number
  currency: CurrencyCode
  frequency: string
  sharePercent: number
  chargedToCard: boolean
  estimated: boolean
  paid: boolean
}

export type MonthKpi = {
  period: string
  totals: Record<CurrencyCode, number>
  items: MonthBillItem[]
  note?: string
}

/**
 * Totales de los próximos meses con detalle al pasar el mouse (o al enfocar).
 * Las cuentas que no son mensuales se resaltan en naranja suave.
 */
export function MonthKpis({ months }: { months: MonthKpi[] }) {
  const [open, setOpen] = useState<string | null>(null)

  return (
    <div className="month-kpis">
      {months.map((month) => {
        const isOpen = open === month.period
        return (
          <div
            key={month.period}
            className="kpi-wrap"
            onMouseEnter={() => setOpen(month.period)}
            onMouseLeave={() => setOpen(null)}
          >
            <button
              type="button"
              className="kpi kpi-button"
              aria-expanded={isOpen}
              aria-label={`Ver cuentas de ${monthLabel(month.period)}`}
              onClick={() => setOpen(isOpen ? null : month.period)}
            >
              <span>{monthLabel(month.period)}</span>
              <strong>
                <Money cents={month.totals.UYU} currency="UYU" />
              </strong>
              {month.totals.USD > 0 ? (
                <small>
                  + <Money cents={month.totals.USD} currency="USD" />
                </small>
              ) : (
                <small>{month.note ?? 'Proyección de cuentas'}</small>
              )}
            </button>

            {isOpen ? (
              <div className="kpi-popover" role="tooltip">
                <div className="kpi-popover-head">
                  <strong>{monthLabel(month.period)}</strong>
                  <span>
                    {month.items.filter((item) => !item.paid).length} pendiente
                    {month.items.filter((item) => !item.paid).length === 1 ? '' : 's'}
                    {month.items.some((item) => item.paid)
                      ? ` · ${month.items.filter((item) => item.paid).length} pagada${month.items.filter((item) => item.paid).length === 1 ? '' : 's'}`
                      : ''}
                  </span>
                </div>
                {month.items.length === 0 ? (
                  <p className="hint" style={{ margin: '6px 0 0' }}>
                    No hay cuentas para este mes.
                  </p>
                ) : (
                  <ul>
                    {month.items.map((item) => (
                      <li
                        key={`${item.name}-${item.currency}-${item.chargedToCard ? 'card' : 'account'}`}
                        className={[
                          item.frequency === 'MONTHLY' ? '' : 'other',
                          item.paid ? 'paid' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        <span className="kpi-popover-name">
                          {item.name}
                          {item.chargedToCard ? <em> · tarjeta</em> : null}
                          {item.sharePercent < 100 ? <em> · {item.sharePercent}%</em> : null}
                          {item.estimated ? <em> · estimado</em> : null}
                        </span>
                        <span className="kpi-popover-amount">
                          <Money cents={item.amountCents} currency={item.currency} />
                          {!item.paid && !item.chargedToCard && item.paidCents > 0 ? (
                            <small>Pagado: <Money cents={item.paidCents} currency={item.currency} /> · Pendiente: <Money cents={item.pendingCents} currency={item.currency} /></small>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {month.items.length > 0 ? (
                  <div className="kpi-popover-total">
                    <strong>Total del mes</strong>
                    <span>
                      {(['UYU', 'USD'] as CurrencyCode[]).filter(currency => month.items.some(item => item.currency === currency)).map(currency => (
                        <Money key={currency} cents={month.items.filter(item => item.currency === currency).reduce((sum, item) => sum + item.amountCents, 0)} currency={currency} />
                      ))}
                    </span>
                  </div>
                ) : null}
                <p className="kpi-popover-legend">
                  {month.items.some((item) => item.paid) ? 'Verde tachado: ya pagada. ' : ''}
                  {month.items.some((item) => item.frequency !== 'MONTHLY' && !item.paid)
                    ? 'Naranja: cuenta que no es mensual.'
                    : ''}
                </p>
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
