import Link from 'next/link'
import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth'
import { loadFinanceData } from '@/lib/finance/data'
import { Money, Alert, SectionHead, Badge } from '@/components/ui'
import { Icon } from '@/components/icons'
import { dateLabel, monthLabel, todayISO } from '@/lib/period'
import { formatMoney } from '@/lib/money'
import { ProjectionChart, UpcomingList } from '@/components/finance/projection-chart'

export const metadata: Metadata = { title: 'Inicio' }
export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const user = await requireUser()
  const data = await loadFinanceData(user.id, { months: 6 })
  const { overview } = data
  const uyu = overview.summaries.UYU
  const usd = overview.summaries.USD
  const today = todayISO()

  const hasUsd =
    data.input.accounts.some((account) => account.currency === 'USD') ||
    usd.availableCents !== 0 ||
    usd.cardFutureCents > 0 ||
    usd.committedCents > 0

  const base = Math.max(1, uyu.availableCents + uyu.committedCents)
  const hasMoney = uyu.availableCents + uyu.committedCents > 0
  const availablePct = hasMoney ? Math.max(0, Math.min(100, Math.round((uyu.availableCents / base) * 100))) : 0
  const committedPct = hasMoney ? Math.max(0, 100 - availablePct) : 0
  const noData =
    data.input.accounts.length === 0 &&
    data.input.incomes.length === 0 &&
    data.input.expenses.length === 0 &&
    data.input.installments.length === 0
  const upcoming = overview.upcoming.slice(0, 5)
  const uyuFlows = overview.projections.UYU
  const endOfHorizon = uyuFlows[uyuFlows.length - 1]
  const tight = uyuFlows.filter((flow) => flow.endMinCents < 0)

  return (
    <div className="stack">
      {overview.reviewCount > 0 ? (
        <div className="review-banner">
          <Icon name="warning" size={17} />
          <span>
            {overview.reviewCount} dato{overview.reviewCount === 1 ? '' : 's'} importado
            {overview.reviewCount === 1 ? '' : 's'} espera{overview.reviewCount === 1 ? '' : 'n'} revisión. Ya se incluyen en los
            cálculos como estimados: confirmalos para validar los datos.
          </span>
          <span className="spacer" />
          <Link href="/movimientos?estado=revision" className="link-button">
            Revisar <Icon name="arrow" size={14} />
          </Link>
        </div>
      ) : null}

      {uyu.missing.length > 0 || (hasUsd && usd.missing.length > 0) ? (
        <Alert tone="warn" title="Faltan datos para una proyección confiable">
          <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
            {[...new Set([...uyu.missing, ...(hasUsd ? usd.missing : [])])].slice(0, 3).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <div className="page-grid">
        <section className="balance-card" aria-label="Saldo disponible">
          <div className="balance-top">
            <span className="soft-icon">
              <Icon name="wallet" size={18} />
            </span>
            <span className="status-chip">
              <i /> Saldos al {dateLabel(today)}
            </span>
          </div>

          <div className="balance-copy">
            <p>Disponible después de compromisos</p>
            <div className="balance-value">
              <Money cents={uyu.afterCommitmentsCents} currency="UYU" />
              <small>
                saldo en cuentas: <Money cents={uyu.availableCents} currency="UYU" />
              </small>
            </div>
            <small>
              Comprometido este mes: {formatMoney(uyu.committedCents, 'UYU')}
              {uyu.cardOverdueCents > 0
                ? ` · incluye ${formatMoney(uyu.cardOverdueCents, 'UYU')} de resúmenes vencidos`
                : ''}
            </small>
          </div>

          <div className="balance-stats">
            <div>
              <span className="stat-dot coral" />
              <p>Gastado</p>
              <strong>
                <Money cents={uyu.spentThisMonthCents} currency="UYU" />
              </strong>
              <small>débito, efectivo y transferencias</small>
            </div>
            <div>
              <span className="stat-dot mint" />
              <p>Cuentas pagadas</p>
              <strong>
                <Money cents={uyu.billsPaidThisMonthCents} currency="UYU" />
              </strong>
              <small>ya salieron de la cuenta</small>
            </div>
            <div>
              <span className="stat-dot purple" />
              <p>Comprometido</p>
              <strong>
                <Money cents={uyu.committedCents} currency="UYU" />
              </strong>
              <small>cuentas pendientes + tarjeta</small>
            </div>
          </div>

          {hasMoney ? (
            <div className="segmented-bar" aria-hidden="true">
              <span className="spent" style={{ width: `${committedPct}%` }} />
              <span className="committed" style={{ width: `${availablePct}%`, background: '#a8cbbc' }} />
            </div>
          ) : (
            <div className="segmented-bar" style={{ background: 'rgba(255,255,255,.12)' }} aria-hidden="true" />
          )}
          <div className="bar-legend">
            <span>
              <i className="committed" style={{ background: '#b7a8d7' }} />
              Comprometido
            </span>
            <span>
              <i className="available" />
              Disponible (incluye lo que no está comprometido)
            </span>
          </div>

          {hasUsd ? (
            <div className="hero-usd">
              <div>
                <span>Dólares disponibles</span>
                <strong>
                  <Money cents={usd.afterCommitmentsCents} currency="USD" />
                </strong>
              </div>
              <div>
                <span>Comprometido</span>
                <strong>
                  <Money cents={usd.committedCents} currency="USD" />
                </strong>
              </div>
              <Link href="/proyeccion?moneda=USD" className="link-button" style={{ color: 'rgba(255,255,255,.8)' }}>
                Ver detalle
              </Link>
            </div>
          ) : null}
        </section>

        <section className="panel">
          <SectionHead
            title="Próximos pagos"
            note="Tarjeta y cuentas de los próximos meses"
            action={
              <Link href="/proyeccion" className="link-button">
                Ver todos <Icon name="arrow" size={14} />
              </Link>
            }
          />
          <UpcomingList items={upcoming} />
        </section>

        <section className={`insight-card ${uyu.savingsCapacityRawCents < 0 ? 'is-negative' : ''}`}>
          <div className="insight-icon">
            <Icon name={uyu.savingsCapacityRawCents < 0 ? 'warning' : 'sparkles'} size={18} />
          </div>
          <div>
            <span className="eyebrow">{uyu.savingsCapacityRawCents < 0 ? 'Margen ajustado' : 'Ahorro posible'}</span>
            <h3>
              {noData
                ? 'Cargá tu saldo e ingresos para saber cuánto podés ahorrar'
                : uyu.savingsCapacityRawCents < 0
                  ? `Te faltan ${formatMoney(Math.abs(uyu.savingsCapacityRawCents), 'UYU')} para cubrir el mes`
                  : `Podrías ahorrar hasta ${formatMoney(uyu.savingsCapacityCents, 'UYU')} este mes`}
            </h3>
            <p>
              {uyu.savingsCapacityRawCents < 0
                ? 'Ingresos del mes menos tarjeta, cuentas y gastos ya registrados.'
                : 'Calculado con tus ingresos, la tarjeta del mes, las cuentas pendientes y los gastos ya registrados.'}
            </p>
          </div>
          <Link href="/ahorro" className="link-button" style={{ alignSelf: 'center' }}>
            Objetivos <Icon name="chevron" size={14} />
          </Link>
        </section>
      </div>

      <section className="panel">
        <SectionHead
          title="Cómo se proyectan tus finanzas"
          note={`Próximos ${uyuFlows.length} meses · ${monthLabel(uyuFlows[0]?.period ?? overview.currentMonth)} a ${monthLabel(endOfHorizon?.period ?? overview.currentMonth)}`}
          action={
            <Link href="/proyeccion" className="link-button">
              Ajustar supuestos <Icon name="arrow" size={14} />
            </Link>
          }
        />
        {noData ? (
          <div className="empty-state" style={{ padding: '22px 18px' }}>
            <strong>Empezá por lo básico</strong>
            Con tu saldo actual, un ingreso y un par de gastos ya se puede proyectar.
            <div className="row" style={{ justifyContent: 'center', marginTop: 14 }}>
              <Link href="/ajustes#cuentas" className="secondary-button small-button">
                <Icon name="bank" size={14} /> Agregar cuenta
              </Link>
              <Link href="/ajustes#ingresos" className="secondary-button small-button">
                <Icon name="arrowDown" size={14} /> Agregar ingreso
              </Link>
              <Link href="/movimientos?nuevo=1" className="primary-button small-button">
                <Icon name="plus" size={14} /> Primer gasto
              </Link>
            </div>
          </div>
        ) : (
          <>
        <ProjectionChart flows={uyuFlows} currency="UYU" />
        <div className="row" style={{ marginTop: 14, gap: 18 }}>
          <span className="hint">
            En {monthLabel(endOfHorizon?.period ?? overview.currentMonth)} te quedarían{' '}
            <strong>
              <Money cents={endOfHorizon?.endCents ?? 0} currency="UYU" />
            </strong>{' '}
            si se mantienen tus ingresos y compromisos.
          </span>
          {tight.length > 0 ? (
            <Badge tone="warn">
              {tight.length} mes{tight.length === 1 ? '' : 'es'} con saldo proyectado negativo
            </Badge>
          ) : (
            <Badge tone="ok">Sin meses en negativo</Badge>
          )}
        </div>
          </>
        )}
      </section>

      <section className="panel">
        <details className="disclosure">
          <summary>
            <span>
              <Icon name="info" size={15} /> De dónde sale cada número
            </span>
            <Icon name="chevron" size={15} />
          </summary>
          <div className="disclosure-body">
            <div className="grid-2">
              <div>
                <h3>Saldo disponible</h3>
                <p className="hint">
                  Saldo inicial de cada cuenta + ingresos cobrados + ajustes − gastos con débito/efectivo −
                  pagos de resumen − cuentas pagadas desde la cuenta − aportes a objetivos.
                </p>
              </div>
              <div>
                <h3>Comprometido del mes</h3>
                <p className="hint">
                  Cuotas de tarjeta cuyo vencimiento cae en este mes (más las vencidas impagas) + cuentas
                  fijas/variables pendientes. Las compras con tarjeta no se descuentan del banco dos veces.
                </p>
              </div>
              <div>
                <h3>Gastado este mes</h3>
                <p className="hint">
                  Sólo gastos con débito, efectivo o transferencia. El pago del resumen de la tarjeta no
                  cuenta como consumo: salda una obligación.
                </p>
              </div>
              <div>
                <h3>Proyección</h3>
                <p className="hint">
                  Usa los ingresos fijos, las cuotas pendientes, las cuentas recurrentes y el ahorro
                  programado. Las cuentas variables se muestran como rango y los meses con datos faltantes
                  se señalan.
                </p>
              </div>
            </div>
            {uyu.missing.length > 0 ? (
              <Alert tone="info" title="Datos faltantes en pesos">
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {uyu.missing.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </Alert>
            ) : null}
          </div>
        </details>
      </section>
    </div>
  )
}
