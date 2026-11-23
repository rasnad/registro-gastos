/**
 * Ahorro: saldo, estado contra el ahorro inicial y evolución en el tiempo.
 *
 * Reglas de diseño:
 *  - Todo se calcula por moneda. Nunca se convierten ni se suman UYU con USD.
 *  - El ahorro total = ahorro inicial + aportes − retiros.
 *  - Los retiros devuelven plata a una cuenta y **no** descuentan el avance de
 *    los objetivos: los aportes son asignaciones, el retiro es plata que sale
 *    del pozo (por eso el total puede quedar por debajo del inicial).
 *  - La línea "esperada" es acumulativa según el ahorro mensual objetivo: es lo
 *    que deberías tener si cumplieras el plan, no una predicción.
 */

import { addMonthsKey, monthKeyOf, type ISODate, type MonthKey } from '@/lib/period'

export type SavingsFundSnapshot = {
  currency: 'UYU' | 'USD'
  initialCents: number
  startDate: ISODate
}

export type SavingsWithdrawalSnapshot = {
  id: string
  currency: 'UYU' | 'USD'
  amountCents: number
  date: ISODate
  accountId: string | null
  note: string | null
}

export type SavingsPoint = {
  period: MonthKey
  realCents: number
  plannedCents: number
}

export type SavingsStatus = {
  totalCents: number
  initialCents: number
  /** Diferencia contra el ahorro inicial (negativa = estás por debajo). */
  deltaCents: number
  belowInitial: boolean
}

/** Ahorro disponible: inicial + aportes − retiros. */
export function savingsTotalCents(input: {
  initialCents: number
  contributionsCents: number
  withdrawalsCents: number
}): number {
  return input.initialCents + input.contributionsCents - input.withdrawalsCents
}

export function savingsStatus(totalCents: number, initialCents: number): SavingsStatus {
  const deltaCents = totalCents - initialCents
  return {
    totalCents,
    initialCents,
    deltaCents,
    belowInitial: totalCents < initialCents,
  }
}

function sumUntil(
  items: Array<{ date: ISODate; amountCents: number }>,
  limit: ISODate,
): number {
  return items.reduce((sum, item) => (item.date <= limit ? sum + item.amountCents : sum), 0)
}

/**
 * Serie mensual de ahorro real vs. esperado.
 * `months` viene ordenado del más viejo al más nuevo y la serie arranca en el
 * mes del ahorro inicial (los meses anteriores no tienen sentido).
 */
export function savingsSeries(input: {
  months: MonthKey[]
  fund: SavingsFundSnapshot | null
  contributions: Array<{ date: ISODate; amountCents: number }>
  withdrawals: Array<{ date: ISODate; amountCents: number }>
  plannedMonthlyCents: number
}): SavingsPoint[] {
  const { fund, contributions, withdrawals, plannedMonthlyCents } = input
  const initialCents = fund?.initialCents ?? 0
  const startMonth = fund ? monthKeyOf(fund.startDate) : null
  const points: SavingsPoint[] = []
  let plannedMonths = 0

  for (const period of input.months) {
    if (startMonth && period < startMonth) continue
    plannedMonths += 1
    // Se compara contra el último día del mes (incluye los movimientos del mes).
    const limit = `${period}-31`
    const realCents =
      initialCents + sumUntil(contributions, limit) - sumUntil(withdrawals, limit)
    points.push({
      period,
      realCents,
      plannedCents: initialCents + plannedMonthlyCents * plannedMonths,
    })
  }

  return points
}

/** Meses a graficar: desde el ahorro inicial (o el primer movimiento) hasta hoy. */
export function savingsMonths(input: {
  today: MonthKey
  fund: SavingsFundSnapshot | null
  contributions: Array<{ date: ISODate }>
  withdrawals: Array<{ date: ISODate }>
  max?: number
}): MonthKey[] {
  const candidates = [
    ...input.contributions.map((item) => monthKeyOf(item.date)),
    ...input.withdrawals.map((item) => monthKeyOf(item.date)),
    input.fund ? monthKeyOf(input.fund.startDate) : null,
    input.today,
  ].filter((value): value is MonthKey => value !== null)

  const start = candidates.reduce((min, value) => (value < min ? value : min), input.today)
  const months: MonthKey[] = []
  let cursor = start
  // Tope defensivo: nunca más de 60 puntos.
  let guard = 0
  while (cursor <= input.today && guard < 60) {
    months.push(cursor)
    cursor = addMonthsKey(cursor, 1)
    guard += 1
  }

  const max = input.max ?? 12
  return months.slice(-max)
}
