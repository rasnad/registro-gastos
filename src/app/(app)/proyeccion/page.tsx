import Link from 'next/link'
import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth'
import { loadFinanceData } from '@/lib/finance/data'
import { projectMonthsInPesos } from '@/lib/finance/engine'
import { formatRate } from '@/lib/money'
import { monthLabel } from '@/lib/period'
import { Money, Alert, SectionHead, Badge } from '@/components/ui'
import { Icon } from '@/components/icons'
import { ProjectionChart } from '@/components/finance/projection-chart'

export const metadata: Metadata = { title: 'Proyección' }
export const dynamic = 'force-dynamic'

type Params = Promise<Record<string, string | string[] | undefined>>

export default async function ProyeccionPage({ searchParams }: { searchParams: Params }) {
  const user = await requireUser()
  const params = await searchParams
  const currency = 'UYU' as const
  const savingsParam = params.ahorro
  const includeSavings = savingsParam === undefined || (Array.isArray(savingsParam) ? savingsParam.includes('1') : savingsParam === '1')

  const data = await loadFinanceData(user.id, {
    months: 12,
    includeSavings,
  })
  const summary = data.overview.summaries[currency]
  const flows = projectMonthsInPesos(data.input,user.usdRateCents,12,{includeSavings})
  const last = flows[flows.length - 1]
  const hasData = data.input.accounts.length > 0 || data.input.expenses.length > 0 || data.input.installments.length > 0 || data.input.incomes.length > 0 || data.input.bills.length > 0

  return (
    <div className="stack">
      <div className="between" style={{ flexWrap: 'wrap' }}>
        <form method="get" className="row" style={{ gap: 8 }}>
          <input type="hidden" name="ahorro" value="0" />
          <label className="checkbox" style={{ margin: 0 }}>
            <input type="checkbox" name="ahorro" value="1" defaultChecked={includeSavings} />
            <span>Descontar ahorro programado</span>
          </label>
          <button className="secondary-button" type="submit">
            Aplicar
          </button>
        </form>
      </div>

      {includeSavings && !data.input.goals.some(goal => goal.isActive && (goal.monthlyTargetCents ?? 0) > 0) ? (
        <p className="hint">No hay un importe mensual programado para ahorrar. Podés configurarlo en <Link href="/ahorro" className="link-button">Ahorro</Link>.</p>
      ) : null}

      {!hasData ? (
        <Alert tone="info" title="No hay datos para proyectar">
          <p>
            Registrá una cuenta, un ingreso o un gasto para ver su proyección.
          </p>
          <p style={{ marginTop: 8 }}>
            <Link href="/ajustes#cuentas" className="link-button">
              Ir a cuentas <Icon name="arrow" size={13} />
            </Link>
          </p>
        </Alert>
      ) : (
        <>
          <section className="projection-hero">
            <div>
              <span className="eyebrow">SALDO PROYECTADO EN {monthLabel(last.period).toUpperCase()}</span>
              <strong>
                <Money cents={last.endCents} currency={currency} />
              </strong>
              <p>
                {last.endMinCents !== last.endMaxCents ? (
                  <>
                    Entre <Money cents={last.endMinCents} currency={currency} /> y{' '}
                    <Money cents={last.endMaxCents} currency={currency} /> según los rangos de cuentas variables.
                  </>
                ) : (
                  <>Si se mantienen tus ingresos y compromisos registrados.</>
                )}
              </p>
            </div>
            <div className="projection-legend">
              <span>
                <i className="income" /> Disponible (inicio + ingresos)
              </span>
              <span>
                <i className="expense" /> Tarjeta, cuentas y gastos
              </span>
              {includeSavings ? (
                <span>
                  <i className="savings" /> Ahorro programado
                </span>
              ) : null}
            </div>
          </section>

          {summary.missing.length > 0 ? (
            <Alert tone="warn" title="Datos faltantes">
              <ul>
                {summary.missing.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Alert>
          ) : null}

          <section className="panel chart-panel">
            <SectionHead
              title="Panorama en pesos"
              note={`Saldo estimado al cierre de cada mes · dólar a $U ${formatRate(user.usdRateCents)}`}
            />
            <ProjectionChart flows={flows} currency={currency} />
          </section>

          <section className="panel">
            <SectionHead title="Mes por mes" note="El detalle de cada cálculo" />
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Mes</th>
                    <th className="num">Inicio</th>
                    <th className="num">Ingresos</th>
                    <th className="num">Tarjeta</th>
                    <th className="num">Cuentas</th>
                    <th className="num">Otros gastos</th>
                    <th className="num">Ahorro</th>
                    <th className="num">Fin</th>
                  </tr>
                </thead>
                <tbody>
                  {flows.map((flow) => (
                    <tr key={flow.period}>
                      <td>
                        {monthLabel(flow.period)}
                        {flow.isCurrent ? <span className="badge info" style={{ marginLeft: 6 }}>Hoy</span> : null}
                      </td>
                      <td className="num">
                        <Money cents={flow.startCents} currency={currency} />
                      </td>
                      <td className="num">
                        <Money cents={flow.incomeCents} currency={currency} />
                      </td>
                      <td className="num">
                        <Money cents={flow.cardCents} currency={currency} />
                      </td>
                      <td className="num">
                        <Money cents={flow.billsCents} currency={currency} />
                        {flow.billsMaxCents !== flow.billsMinCents ? (
                          <span className="hint" style={{ display: 'block' }}>
                            {Math.round(flow.billsMinCents / 100)}–{Math.round(flow.billsMaxCents / 100)}
                          </span>
                        ) : null}
                      </td>
                      <td className="num">
                        <Money cents={flow.otherExpensesCents} currency={currency} />
                      </td>
                      <td className="num">
                        <Money cents={flow.savingsCents} currency={currency} />
                      </td>
                      <td className="num" style={{ fontWeight: 600 }}>
                        <Money cents={flow.endCents} currency={currency} className={flow.endCents < 0 ? 'negative' : ''} />
                        {flow.endMinCents < 0 ? (
                          <span className="badge danger" style={{ display: 'block', marginTop: 4 }}>
                            Puede quedar en negativo
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <SectionHead title="Supuestos y datos faltantes" note="Qué se usó para calcular cada mes" />
            <div className="stack-sm">
              {flows.map((flow) => (
                <details className="disclosure" key={flow.period}>
                  <summary>
                    <span>
                      <Icon name="calendar" size={15} /> {monthLabel(flow.period)}
                      {flow.missing.length > 0 ? <Badge tone="warn">Datos faltantes</Badge> : null}
                    </span>
                    <Icon name="chevron" size={15} />
                  </summary>
                  <div className="disclosure-body">
                    {flow.assumptions.length === 0 && flow.missing.length === 0 ? (
                      <p className="hint">Sin supuestos adicionales: todos los importes están definidos.</p>
                    ) : (
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {flow.assumptions.map((item) => (
                          <li key={item} className="hint">
                            {item}
                          </li>
                        ))}
                        {flow.missing.map((item) => (
                          <li key={item} className="hint" style={{ color: 'var(--amber)' }}>
                            {item}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </details>
              ))}
            </div>
          </section>

          <section className="panel tight">
            <div className="between" style={{ flexWrap: 'wrap', gap: 12 }}>
              <div className="row" style={{ gap: 10 }}>
                <span className="soft-icon">
                  <Icon name="info" size={16} />
                </span>
                <p className="hint" style={{ maxWidth: 620 }}>
                  El pago del resumen no se resta como gasto: se descuentan las cuotas y las cuentas cargadas a la
                  tarjeta. Así una compra nunca se cuenta dos veces. Los meses futuros usan tu configuración actual.
                </p>
              </div>
              <Link href="/ajustes#tarjetas" className="secondary-button small-button">
                Revisar configuración
              </Link>
            </div>
          </section>

          <p className="hint" style={{ textAlign: 'center' }}>
            Proyección estimada. Los importes en dólares se convierten a pesos usando la cotización vigente de Ajustes; los pagos realizados conservan su débito registrado.
          </p>
        </>
      )}
    </div>
  )
}
