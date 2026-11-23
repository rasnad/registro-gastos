import type { CurrencyCode } from '@/lib/money'
import { formatMoney } from '@/lib/money'
import { monthLabel } from '@/lib/period'
import type { SavingsPoint } from '@/lib/finance/savings'

/**
 * Evolución del ahorro: línea llena = lo que tenés, línea punteada = lo que
 * deberías tener según el ahorro mensual de tus objetivos.
 */
export function SavingsChart({
  points,
  currency,
  plannedLabel,
}: {
  points: SavingsPoint[]
  currency: CurrencyCode
  plannedLabel: string
}) {
  if (points.length < 2) {
    return (
      <p className="hint">
        Necesitás al menos dos meses de datos para ver la evolución. Cargá el ahorro inicial o
        registrá aportes.
      </p>
    )
  }

  const width = 720
  const height = 220
  const padX = 8
  const padTop = 14
  const padBottom = 26

  const values = points.flatMap((point) => [point.realCents, point.plannedCents])
  const max = Math.max(...values, 0)
  const min = Math.min(...values, 0)
  const span = max - min || 1

  const x = (index: number) => padX + (index * (width - padX * 2)) / (points.length - 1)
  const y = (cents: number) => padTop + (1 - (cents - min) / span) * (height - padTop - padBottom)

  const line = (key: 'realCents' | 'plannedCents') =>
    points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(index).toFixed(1)} ${y(point[key]).toFixed(1)}`).join(' ')

  const area = `${line('realCents')} L ${x(points.length - 1).toFixed(1)} ${y(min).toFixed(1)} L ${x(0).toFixed(1)} ${y(min).toFixed(1)} Z`
  const last = points[points.length - 1]
  const lastReal = last.realCents

  return (
    <div className="savings-chart">
      <div className="savings-chart-head">
        <div>
          <span className="eyebrow">AHORRO EN {currency}</span>
          <strong>{formatMoney(lastReal, currency)}</strong>
        </div>
        <div className="savings-chart-legend">
          <span>
            <i className="real" /> Real
          </span>
          <span>
            <i className="planned" /> {plannedLabel}
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Evolución del ahorro en ${currency}`}>
        <defs>
          <linearGradient id={`savings-area-${currency}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8fc7b0" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#8fc7b0" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 0.5, 1].map((ratio) => {
          const value = max - (max - min) * ratio
          return (
            <g key={ratio}>
              <line
                x1={padX}
                x2={width - padX}
                y1={y(value)}
                y2={y(value)}
                stroke="#f0efec"
                strokeWidth="1"
              />
              <text x={padX} y={y(value) - 4} className="chart-axis">
                {formatMoney(Math.round(value), currency)}
              </text>
            </g>
          )
        })}

        <path d={area} fill={`url(#savings-area-${currency})`} />
        <path d={line('plannedCents')} fill="none" stroke="#b7a8d7" strokeWidth="2" strokeDasharray="5 5" />
        <path d={line('realCents')} fill="none" stroke="#4f8371" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx={x(points.length - 1)} cy={y(lastReal)} r="4.5" fill="#4f8371" />

        {points.map((point, index) => (
          <g key={point.period}>
            {(index === 0 || index === points.length - 1 || points.length <= 8 || index % 2 === 0) && (
              <text x={x(index)} y={height - 8} textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'} className="chart-axis">
                {monthLabel(point.period, { short: true, year: false })}
              </text>
            )}
            <circle cx={x(index)} cy={y(point.realCents)} r="9" fill="transparent">
              <title>{`${monthLabel(point.period)}: ${formatMoney(point.realCents, currency)} · esperado ${formatMoney(point.plannedCents, currency)}`}</title>
            </circle>
          </g>
        ))}
      </svg>
    </div>
  )
}
