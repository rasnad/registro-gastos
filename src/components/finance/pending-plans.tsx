'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { Dialog } from '@/components/dialog'
import { InstallmentForm } from '@/components/forms/other-forms'
import { Money, SectionHead } from '@/components/ui'
import type { InstallmentSnapshot } from '@/lib/finance/engine'
import { convertUsdToUyu, fromCents } from '@/lib/money'
import { monthLabel } from '@/lib/period'

export function PendingPlans({ installments, merchants, current, usdRateCents }: {
  installments: InstallmentSnapshot[]
  merchants: Record<string, string>
  current: string
  usdRateCents: number
}) {
  const [expanded, setExpanded] = useState(false)
  const [heights, setHeights] = useState({ collapsed: 0, full: 0 })
  const tableRef = useRef<HTMLTableElement>(null)
  const previewRef = useRef<HTMLTableRowElement>(null)
  const grouped = new Map<string, InstallmentSnapshot[]>()
  for (const item of installments) {
    const group = grouped.get(item.expenseId) ?? []
    group.push(item)
    grouped.set(item.expenseId, group)
  }
  const plans = [...grouped.entries()].map(([expenseId, items]) => {
    items.sort((a, b) => a.number - b.number)
    const total = items.reduce((sum, item) => sum + item.amountCents, 0)
    return { expenseId, items, total, sortAmount: items[0].currency === 'USD' ? convertUsdToUyu(total, usdRateCents) : total }
  }).sort((a, b) => b.sortAmount - a.sortAmount || a.expenseId.localeCompare(b.expenseId))

  useLayoutEffect(() => {
    const table = tableRef.current
    if (!table || plans.length <= 10) return
    const measure = () => {
      const preview = previewRef.current
      if (!preview) return
      const collapsed = preview.offsetTop + Math.min(preview.offsetHeight * 0.55, 28)
      setHeights({ collapsed, full: table.offsetHeight })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(table)
    return () => observer.disconnect()
  }, [plans.length])

  return (
    <section className="panel">
      <SectionHead title="Cuotas pendientes" action={<span className="count-chip">{plans.length} compras</span>} />
      {plans.length === 0 ? <p className="hint">No hay cuotas pendientes registradas.</p> : (
        <>
          <div className="pending-expandable">
          <div className="table-wrap pending-table-clip" id="pending-plans-table" style={plans.length > 10 && heights.full ? { height: expanded ? heights.full + 2 : heights.collapsed + 2 } : undefined}>
            <table className="table" ref={tableRef}>
              <thead><tr><th>Comercio</th><th>Próxima cuota pendiente</th><th>Resumen</th><th className="num">Saldo pendiente</th><th /></tr></thead>
              <tbody>
                {plans.map(({ expenseId, items, total }, index) => {
                  const item = items[0]
                  return (
                    <tr key={expenseId} ref={index === 10 ? previewRef : undefined} inert={!expanded && index >= 10 ? true : undefined} aria-hidden={!expanded && index >= 10 ? true : undefined}>
                      <td>{merchants[expenseId] ?? 'Compra'}</td>
                      <td>{item.number} de {item.count} · <Money cents={item.amountCents} currency={item.currency} className={`currency-amount ${item.currency.toLowerCase()}`} /></td>
                      <td>{monthLabel(item.period)}{item.period < current ? ' · Vencida' : ''}</td>
                      <td className="num"><Money cents={total} currency={item.currency} className={`currency-amount ${item.currency.toLowerCase()}`} /></td>
                      <td>
                        <details className="disclosure">
                          <summary><span>Editar cuotas</span></summary>
                          <div className="disclosure-body">
                            {items.map((installment) => (
                              <Dialog key={installment.id} label={`Cuota ${installment.number} de ${installment.count}`} icon="edit" buttonClassName="ghost-button small-button" title="Corregir cuota" description="Ajustá el importe o el resumen si el banco lo ubicó distinto.">
                                <InstallmentForm installment={{ id: installment.id, number: installment.number, count: installment.count, amount: fromCents(installment.amountCents), period: installment.period, isPaid: installment.isPaid, dueDate: installment.dueDate }} />
                              </Dialog>
                            ))}
                          </div>
                        </details>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {plans.length > 10 ? (
            <div className={`pending-expand-control ${expanded ? 'is-expanded' : 'is-collapsed'}`}>
              <button type="button" className="pending-expand-button" aria-label={expanded ? 'Contraer compras' : 'Mostrar todas las compras'} aria-expanded={expanded} aria-controls="pending-plans-table" onClick={() => setExpanded((value) => !value)}>{expanded ? '−' : '+'}</button>
            </div>
          ) : null}
          </div>
        </>
      )}
    </section>
  )
}
