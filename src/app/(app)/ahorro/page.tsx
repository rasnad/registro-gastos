import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { loadFinanceData, loadFormOptions } from '@/lib/finance/data'
import { fromCents, formatMoney } from '@/lib/money'
import { monthLabel, todayISO, toISODate } from '@/lib/period'
import { Money, Progress, Badge, SectionHead, EmptyState } from '@/components/ui'
import { Icon } from '@/components/icons'
import { Dialog } from '@/components/dialog'
import { ContributionForm, GoalForm, MiniForm } from '@/components/forms/other-forms'
import { deleteContribution, deleteGoal } from '@/app/actions/goals'

export const metadata: Metadata = { title: 'Ahorro' }
export const dynamic = 'force-dynamic'

export default async function AhorroPage() {
  const user = await requireUser()
  const [data, options, goalRows, contributions] = await Promise.all([
    loadFinanceData(user.id, { months: 12 }),
    loadFormOptions(user.id),
    prisma.savingsGoal.findMany({
      where: { userId: user.id },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.savingsContribution.findMany({
      where: { userId: user.id },
      orderBy: { date: 'desc' },
      take: 20,
      include: { goal: true, account: true },
    }),
  ])
  const today = todayISO()
  const plans = data.overview.goals
  const totalSaved = { UYU: 0, USD: 0 }
  const totalRequired = { UYU: 0, USD: 0 }
  for (const plan of plans) {
    totalSaved[plan.currency] += plan.savedCents
    totalRequired[plan.currency] += plan.requiredMonthlyCents
  }

  const activeGoals = goalRows.filter((goal) => goal.isActive)

  return (
    <div className="stack">
      <section className="savings-overview">
        <div>
          <span className="eyebrow">AHORRADO EN OBJETIVOS ACTIVOS</span>
          <div className="row" style={{ gap: 20 }}>
            <strong>
              <Money cents={totalSaved.UYU} currency="UYU" />
            </strong>
            {totalSaved.USD > 0 ? (
              <strong style={{ fontSize: 20 }}>
                <Money cents={totalSaved.USD} currency="USD" />
              </strong>
            ) : null}
          </div>
          <p>
            {plans.length} objetivo{plans.length === 1 ? '' : 's'} activo{plans.length === 1 ? '' : 's'} · sin
            conversión entre monedas
          </p>
        </div>
        <div className="monthly-needed">
          <span className="soft-icon">
            <Icon name="calendar" size={16} />
          </span>
          <div>
            <small>Necesitás aportar por mes</small>
            <strong>
              <Money cents={totalRequired.UYU} currency="UYU" />
            </strong>
            {totalRequired.USD > 0 ? (
              <small>
                + <Money cents={totalRequired.USD} currency="USD" />
              </small>
            ) : null}
          </div>
        </div>
      </section>

      <div className="goals-head">
        <div>
          <h2 className="section-title">Tus objetivos</h2>
          <p className="section-subtitle">La prioridad define quién recibe primero el margen libre proyectado.</p>
        </div>
        <Dialog label="Nuevo objetivo" icon="plus" buttonClassName="secondary-button" title="Nuevo objetivo de ahorro">
          <GoalForm accounts={options.accounts} today={today} />
        </Dialog>
      </div>

      {plans.length === 0 ? (
        <EmptyState title="Todavía no tenés objetivos">
          Creá un objetivo con monto y fecha para ver si es alcanzable con tus ingresos y compromisos.
        </EmptyState>
      ) : (
        <>
          <div className="goals-grid">
            {plans.map((plan) => {
              const goal = goalRows.find((row) => row.id === plan.goalId)
              const pct = plan.targetCents === 0 ? 0 : Math.round((plan.savedCents / plan.targetCents) * 100)
              return (
                <article className="goal-card" key={plan.goalId}>
                  <div className="goal-top">
                    <span className="goal-emoji">
                      <Icon name="goal" size={18} />
                    </span>
                    <Badge tone={plan.feasible ? 'ok' : 'warn'}>{plan.feasible ? 'Alcanzable' : 'Ajustado'}</Badge>
                  </div>
                  <h3>{plan.name}</h3>
                  <p>
                    <Icon name="calendar" size={13} /> {goal ? toISODate(goal.targetDate) : ''} · prioridad {plan.priority}
                  </p>
                  <div className="goal-values">
                    <strong>
                      <Money cents={plan.savedCents} currency={plan.currency} />
                    </strong>
                    <span>
                      de <Money cents={plan.targetCents} currency={plan.currency} />
                    </span>
                  </div>
                  <Progress value={plan.savedCents} max={plan.targetCents} />
                  <div className="goal-footer">
                    <span>{pct}% completado</span>
                    <strong>
                      <Money cents={plan.requiredMonthlyCents} currency={plan.currency} />/mes
                    </strong>
                  </div>
                  {plan.remainingCents === 0 ? (
                    <p className="hint" style={{ marginTop: 8 }}>
                      Objetivo cumplido. Podés desactivarlo o reasignar el aporte.
                    </p>
                  ) : (
                    <p className="hint" style={{ marginTop: 8 }}>
                      Falta <Money cents={plan.remainingCents} currency={plan.currency} /> en {plan.monthsLeft} mes
                      {plan.monthsLeft === 1 ? '' : 'es'}
                      {plan.estimatedCompletionMonth
                        ? ` · llegada estimada: ${monthLabel(plan.estimatedCompletionMonth)}`
                        : ''}
                    </p>
                  )}
                  {plan.tightMonths.length > 0 ? (
                    <p className="hint" style={{ color: 'var(--amber)' }}>
                      Meses ajustados: {plan.tightMonths.map((month) => monthLabel(month, { short: true, year: false })).join(', ')}
                    </p>
                  ) : null}
                  <div className="row" style={{ marginTop: 10, gap: 6 }}>
                    <Dialog
                      label="Aportar"
                      icon="plus"
                      buttonClassName="secondary-button small-button"
                      title={`Aportar a ${plan.name}`}
                    >
                      <ContributionForm
                        goals={activeGoals.map((row) => ({ id: row.id, name: row.name, currency: row.currency }))}
                        accounts={options.accounts}
                        defaultGoalId={plan.goalId}
                        today={today}
                      />
                    </Dialog>
                    {goal ? (
                      <Dialog
                        label="Editar"
                        icon="edit"
                        buttonClassName="ghost-button small-button"
                        title="Editar objetivo"
                      >
                        <GoalForm
                          accounts={options.accounts}
                          today={today}
                          defaults={{
                            id: goal.id,
                            name: goal.name,
                            currency: goal.currency,
                            targetAmount: fromCents(Math.round(Number(goal.targetAmount) * 100)),
                            targetDate: toISODate(goal.targetDate),
                            monthlyTarget:
                              goal.monthlyTarget != null
                                ? fromCents(Math.round(Number(goal.monthlyTarget) * 100))
                                : null,
                            priority: goal.priority,
                            isActive: goal.isActive,
                          }}
                        />
                      </Dialog>
                    ) : null}
                    <MiniForm
                      action={deleteGoal}
                      hidden={{ id: plan.goalId }}
                      label="Eliminar"
                      className="ghost-button small-button"
                      confirmMessage="¿Eliminar el objetivo y sus aportes registrados?"
                    />
                  </div>
                </article>
              )
            })}
          </div>

          <section className="panel">
            <SectionHead title="Plan conjunto" note="El margen libre se reparte por prioridad: no se promete dos veces el mismo dinero" />
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Objetivo</th>
                    <th>Prioridad</th>
                    <th className="num">Falta</th>
                    <th className="num">Meses</th>
                    <th className="num">Necesario / mes</th>
                    <th className="num">Asignado / mes</th>
                    <th>Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((plan) => (
                    <tr key={plan.goalId}>
                      <td>{plan.name}</td>
                      <td>{plan.priority}</td>
                      <td className="num">
                        <Money cents={plan.remainingCents} currency={plan.currency} />
                      </td>
                      <td className="num">{plan.monthsLeft}</td>
                      <td className="num">
                        <Money cents={plan.requiredMonthlyCents} currency={plan.currency} />
                      </td>
                      <td className="num">
                        <Money cents={plan.allocatedMonthlyCents} currency={plan.currency} />
                      </td>
                      <td>
                        {plan.feasible ? (
                          <Badge tone="ok">Alcanzable</Badge>
                        ) : (
                          <Badge tone="warn">
                            Faltan {formatMoney(plan.shortfallCents, plan.currency)}/mes
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="hint" style={{ marginTop: 10 }}>
              El cálculo usa el margen libre de la proyección (ingresos − tarjeta − cuentas − gastos) y lo asigna
              en orden de prioridad. Es una estimación: si tus ingresos o gastos variables cambian, el plan cambia.
            </p>
          </section>

          <section className="panel">
            <SectionHead title="Aportes registrados" note="Los aportes con cuenta descuentan el saldo disponible" />
            {contributions.length === 0 ? (
              <p className="hint">Todavía no registraste aportes.</p>
            ) : (
              <div className="transaction-list">
                {contributions.map((contribution) => (
                  <div className="transaction" key={contribution.id}>
                    <span className="category-icon lavender">
                      <Icon name="coins" size={16} />
                    </span>
                    <div className="item-main">
                      <strong>{contribution.goal.name}</strong>
                      <small>
                        {toISODate(contribution.date)}
                        {contribution.account ? ` · desde ${contribution.account.name}` : ''}
                        {contribution.note ? ` · ${contribution.note}` : ''}
                      </small>
                    </div>
                    <div className="item-amount">
                      <strong>
                        <Money cents={Math.round(Number(contribution.amount) * 100)} currency={contribution.currency} />
                      </strong>
                      <MiniForm
                        action={deleteContribution}
                        hidden={{ id: contribution.id }}
                        label="Eliminar"
                        className="ghost-button small-button"
                        confirmMessage="¿Eliminar este aporte?"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
