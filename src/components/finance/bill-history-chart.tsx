'use client'

import { useState } from 'react'
import { Money, SectionHead } from '@/components/ui'
import { addMonthsKey, monthLabel } from '@/lib/period'
import type { CurrencyCode } from '@/lib/money'
import type { billComparisonHistory } from '@/lib/finance/engine'

function monthColor(period: string) {
  const [year, month] = period.split('-').map(Number)
  return 'hsl(' + (((year * 12 + month) * 137.508) % 360) + ' 42% 45%)'
}

export function BillHistoryChart({ history, current }: { history: ReturnType<typeof billComparisonHistory>; current: string }) {
  const [currency, setCurrency] = useState<CurrencyCode>(() => history.items.length > 0 && !history.items.some(item => item.currency === 'UYU') ? 'USD' : 'UYU')
  const periods = [...new Set([...history.items.map(item => item.period), current])].sort()
  const [selected, setSelected] = useState<string[]>(() => periods.filter(period => period >= addMonthsKey(current, -2)))
  const [preset, setPreset] = useState<number | null>(3)
  const [excludeRent, setExcludeRent] = useState(true)
  const selectedPeriods = periods.filter(period => selected.includes(period))
  const items = history.items.filter(item => item.currency === currency && selected.includes(item.period) && (!excludeRent || !/\balquiler\b/i.test(item.name)))
  const bills = [...new Map(items.map(item => [item.billId, item.name])).entries()].sort((a, b) => {
    const latest = (id: string) => items.filter(item => item.billId === id).sort((x, y) => y.period.localeCompare(x.period))[0]?.amountCents ?? 0
    return latest(b[0]) - latest(a[0]) || a[1].localeCompare(b[1], 'es')
  })
  const max = Math.max(1, ...items.map(item => item.amountCents))
  const selectRecent = (months: number) => {
    setPreset(months)
    setSelected(periods.filter(period => period >= addMonthsKey(current, 1 - months)))
  }

  return <section className="panel">
    <SectionHead title="Evolución de cuentas fijas" />
    {history.ambiguousCount > 0 ? <p className="hint">Hay {history.ambiguousCount} cuenta(s) con pagos históricos y nuevos en el mismo mes que requieren revisión; no se incluyeron.</p> : null}
    {history.items.some(item => item.currency === 'USD') ? <div className="segmented bill-history-currency" aria-label="Moneda">
      {(['UYU', 'USD'] as const).map(cur => <button type="button" key={cur} className={currency === cur ? 'selected' : ''} aria-pressed={currency === cur} onClick={() => setCurrency(cur)}>{cur === 'UYU' ? 'Pesos' : 'Dólares'}</button>)}
    </div> : null}
    <div className="bill-comparison-filters" aria-label="Filtrar meses">
      <span>Ver últimos:</span>
      {[3, 6, 12].map(count => <button type="button" className="bill-comparison-preset" aria-pressed={preset === count} key={count} onClick={() => selectRecent(count)}>{count} meses</button>)}
      <label className="bill-comparison-rent"><input type="checkbox" checked={excludeRent} onChange={event => setExcludeRent(event.target.checked)} /> Excluir alquiler</label>
    </div>
    {bills.length === 0 ? <p className="hint">No hay importes reales para los meses y la moneda seleccionados.</p> :
      <div className="bill-comparison-scroll" role="region" aria-label="Comparación de importes reales por cuenta" tabIndex={0}>
        <div className="bill-comparison-layout">
          <div className="bill-comparison-axis"><span><Money cents={max} currency={currency} /></span><span><Money cents={Math.round(max / 2)} currency={currency} /></span><span>0</span></div>
          <div className="bill-comparison-groups">{bills.map(([id, name]) => <div className="bill-comparison-group" key={id}>
            <div className="bill-comparison-plot">{selectedPeriods.map(period => {
              const item = items.find(row => row.billId === id && row.period === period)
              const label = item ? name + ' · ' + monthLabel(period) + ' · ' + new Intl.NumberFormat('es-UY', { style: 'currency', currency }).format(item.amountCents / 100) + ' · ' + (item.status === 'PAID' ? 'Pagada' : 'Pendiente') : ''
              return item ? <div key={period} className="bill-comparison-point-slot">
                <button type="button" className={'bill-comparison-point ' + (item.status === 'PENDING' ? 'pending' : '')} style={{ bottom: item.amountCents / max * 100 + '%', color: monthColor(period) }} aria-label={label}>
                  <span className="bill-comparison-tooltip" role="tooltip">
                    <strong>{name} · {monthLabel(period)}</strong>
                    <span><Money cents={item.amountCents} currency={currency} /></span>
                    <small>{item.status === 'PAID' ? 'Pagada' : 'Pendiente'}</small>
                  </span>
                </button>
              </div> : <span key={period} className="bill-comparison-point-slot" />
            })}</div>
            <span className="bill-comparison-name">{name}</span>
          </div>)}</div>
        </div>
      </div>}
  </section>
}
