'use client'

import { useState } from 'react'
import { Money } from '@/components/ui'
import { monthLabel } from '@/lib/period'
import type { CurrencyCode } from '@/lib/money'

export type MonthBillItem = {
  name: string
  amountCents: number
  currency: CurrencyCode
  frequency: string
  chargedToCard: boolean
  estimated: boolean
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
              onFocus={() => setOpen(month.period)}
              onBlur={() => setOpen(null)}
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
                  <span>{month.items.length} cuenta{month.items.length === 1 ? '' : 's'}</span>
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
                        className={item.frequency === 'MONTHLY' ? '' : 'other'}
                      >
                        <span className="kpi-popover-name">
                          {item.name}
                          {item.chargedToCard ? <em> · tarjeta</em> : null}
                          {item.estimated ? <em> · estimado</em> : null}
                        </span>
                        <Money cents={item.amountCents} currency={item.currency} />
                      </li>
                    ))}
                  </ul>
                )}
                {month.items.some((item) => item.frequency !== 'MONTHLY') ? (
                  <p className="kpi-popover-legend">Naranja: cuentas que no son mensuales.</p>
                ) : null}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
