import Link from 'next/link'
import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth'
import { loadFinanceData } from '@/lib/finance/data'
import { Money, Alert, SectionHead, Badge } from '@/components/ui'
import { Icon } from '@/components/icons'
import { dateLabel, monthLabel, todayISO } from '@/lib/period'
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
  const hasUsdFinances =
    data.input.accounts.some((account) => account.currency === 'USD') ||
    data.input.incomes.some((income) => income.currency === 'USD' && income.isActive)
  const usdWarnings = hasUsdFinances
    ? usd.missing
    : usd.missing.filter(
        (item) =>
          item !== 'No hay cuentas con saldo registradas en esta moneda.' &&
          item !== 'No registraste ingresos para este mes.',
      )

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

      {uyu.missing.length > 0 || (hasUsd && usdWarnings.length > 0) ? (
        <Alert tone="warn" title="Faltan datos para una proyección confiable">
          <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
            {[
              ...new Set([
                ...uyu.missing.map((item) => `Pesos: ${item}`),
                ...(hasUsd ? usdWarnings.map((item) => `Dólares: ${item}`) : []),
              ]),
            ]
              .slice(0, 3)
              .map((item) => (
                <li key={item}>{item}</li>
              ))}
          </ul>
        </Alert>
      ) : null}

      <div className="page-grid home-top">
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
            <p>Disponibles después de cuentas</p>
            <div className="balance-value">
              <Money cents={uyu.afterCommitmentsCents} currency="UYU" />
              <small>
                saldo en cuentas: <Money cents={uyu.availableCents} currency="UYU" />
              </small>
            </div>
          </div>

          <div className="hero-breakdown">
            <div>
              <span>Cuentas fijas</span>
              <strong>
                <Money cents={uyu.billsDueNowCents} currency="UYU" />
              </strong>
            </div>
            <div>
              <span>Tarjeta a pagar</span>
              <strong>
                <Money cents={uyu.cardDueNowCents + uyu.cardOverdueCents} currency="UYU" />
              </strong>
            </div>
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
                <span>Cuentas fijas</span>
                <strong>
                  <Money cents={usd.billsDueNowCents} currency="USD" />
                </strong>
              </div>
              <div>
                <span>Tarjeta a pagar</span>
                <strong>
                  <Money cents={usd.cardDueNowCents + usd.cardOverdueCents} currency="USD" />
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
          <div className="upcoming-total">
            <span>Comprometido este mes</span>
            <strong>
              <Money cents={uyu.committedCents} currency="UYU" />
            </strong>
          </div>
          <Link href="/cuentas" className="link-button" style={{ marginTop: 6 }}>
            Ver el detalle del mes <Icon name="arrow" size={13} />
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
        <p className="hint" style={{ marginTop: 8 }}>
          La barra verde es el dinero disponible para cada mes (saldo con el que arranca + ingresos). La barra
          rosa, todo lo que sale: tarjeta, cuentas, gastos y ahorro programado.
        </p>
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
