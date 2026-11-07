'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { Badge, Money, SectionHead } from '@/components/ui'
import type { InstallmentSnapshot } from '@/lib/finance/engine'
import { monthLabel, monthsBetween, nextMonths } from '@/lib/period'

export function UpcomingStatements({ installments, current, cardId, totals }: { installments: InstallmentSnapshot[]; current: string; cardId: string; totals: Record<string, { UYU: number; USD: number }> }) {
  const [expanded, setExpanded] = useState(false)
  const [heights, setHeights] = useState({ collapsed: 0, full: 0 })
  const tableRef = useRef<HTMLTableElement>(null)
  const previewRef = useRef<HTMLTableRowElement>(null)
  const last = installments.reduce((latest, item) => item.period > latest ? item.period : latest, current)
  const periods = nextMonths(current, Math.max(5, monthsBetween(current, last) + 1))
  useLayoutEffect(() => {
    const table = tableRef.current
    if (!table || periods.length <= 5) return
    const measure = () => {
      const preview = previewRef.current
      if (preview) setHeights({ collapsed: preview.offsetTop + Math.min(preview.offsetHeight * 0.55, 28), full: table.offsetHeight })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(table)
    return () => observer.disconnect()
  }, [periods.length])
  return (
    <section className="panel">
      <SectionHead title="Próximos resúmenes" />
      <div className="pending-expandable">
        <div className="table-wrap pending-table-clip" id={`statements-${cardId}`} style={periods.length > 5 && heights.full ? { height: (expanded ? heights.full : heights.collapsed) + 2 } : undefined}>
          <table className="table" ref={tableRef}>
            <thead><tr><th>Resumen</th><th className="num">Pesos</th><th className="num">Dólares</th><th className="num">Cuotas</th><th>Estado</th></tr></thead>
            <tbody>{periods.map((period, index) => {
              const items = installments.filter((item) => item.period === period)
              const uyu = totals[period]?.UYU ?? 0
              const usd = totals[period]?.USD ?? 0
              return <tr key={period} ref={index === 5 ? previewRef : undefined} inert={!expanded && index >= 5 ? true : undefined} aria-hidden={!expanded && index >= 5 ? true : undefined}>
                <td>{monthLabel(period)}</td><td className="num">{uyu > 0 ? <Money cents={uyu} currency="UYU" /> : <span className="hint">—</span>}</td><td className="num">{usd > 0 ? <Money cents={usd} currency="USD" /> : <span className="hint">—</span>}</td><td className="num">{items.filter((item) => item.count > 1).length}</td><td><Badge tone={period === current ? 'info' : 'neutral'}>{period === current ? 'En curso' : 'Estimado'}</Badge></td>
              </tr>
            })}</tbody>
          </table>
        </div>
        {periods.length > 5 ? <div className={`pending-expand-control ${expanded ? 'is-expanded' : 'is-collapsed'}`}><button type="button" className="pending-expand-button" aria-label={expanded ? 'Contraer resúmenes' : 'Mostrar todos los resúmenes'} aria-expanded={expanded} aria-controls={`statements-${cardId}`} onClick={() => setExpanded((value) => !value)}>{expanded ? '−' : '+'}</button></div> : null}
      </div>
    </section>
  )
}
