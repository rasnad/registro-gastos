import { Money } from '@/components/ui'
import type { CategorySlice } from '@/lib/finance/breakdown'
import { formatMoney, type CurrencyCode } from '@/lib/money'

/**
 * Torta (dona) del gasto por categoría. SVG puro, sin librerías: los tramos
 * salen de `categorySlices` y la suma siempre cierra en 100%.
 */
export function CategoryDonut({
  slices,
  currency,
  totalCents,
  label,
}: {
  slices: CategorySlice[]
  currency: CurrencyCode
  totalCents: number
  label: string
}) {
  const radius = 54
  const stroke = 20
  const circumference = 2 * Math.PI * radius

  if (slices.length === 0) {
    return (
      <div className="donut-chart">
        <div className="donut-empty">
          <strong>Sin gastos</strong>
          <span>No hay movimientos en {label.toLowerCase()}.</span>
        </div>
      </div>
    )
  }

  return (
    <div className="donut-chart">
      <div className="donut-figure">
        <svg viewBox="0 0 140 140" role="img" aria-label={`Gasto por categoría · ${label}`}>
          <circle cx="70" cy="70" r={radius} fill="none" stroke="#f2f1ef" strokeWidth={stroke} />
          {slices.map((slice) => (
            <circle
              key={slice.key}
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              stroke={slice.color}
              strokeWidth={stroke}
              strokeDasharray={`${(slice.to - slice.from) * circumference} ${circumference}`}
              strokeDashoffset={-slice.from * circumference}
              transform="rotate(-90 70 70)"
            >
              <title>{`${slice.label}: ${formatMoney(slice.cents, currency)} (${slice.percent}%)`}</title>
            </circle>
          ))}
        </svg>
        <div className="donut-center">
          <small>Total</small>
          <strong>
            <Money cents={totalCents} currency={currency} />
          </strong>
        </div>
      </div>
      <ul className="donut-legend">
        {slices.map((slice) => (
          <li key={slice.key}>
            <span className="donut-dot" style={{ background: slice.color }} aria-hidden="true" />
            <span className="donut-label">{slice.label}</span>
            <span className="donut-percent">{slice.percent}%</span>
            <span className="donut-amount">
              <Money cents={slice.cents} currency={currency} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
