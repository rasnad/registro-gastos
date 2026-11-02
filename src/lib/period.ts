/**
 * Fechas y períodos.
 * "Período" = mes del vencimiento del resumen de tarjeta, con formato YYYY-MM.
 *
 * Uruguay es UTC-3: no usamos la fecha del servidor (Vercel corre en UTC)
 * para decidir "hoy", porque eso adelanta el día a las 21:00 locales.
 */

export const APP_TIME_ZONE = 'America/Montevideo'

export type ISODate = string // YYYY-MM-DD
export type MonthKey = string // YYYY-MM

const DATE_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function todayISO(now: Date = new Date()): ISODate {
  return DATE_FMT.format(now)
}

export function currentMonthKey(now: Date = new Date()): MonthKey {
  return todayISO(now).slice(0, 7)
}

export function toISODate(value: Date | string): ISODate {
  if (typeof value === 'string') return value.slice(0, 10)
  return value.toISOString().slice(0, 10)
}

export function dateFromISO(iso: ISODate): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00.000Z`)
}

export function monthKeyOf(value: Date | string): MonthKey {
  return toISODate(value).slice(0, 7)
}

export function monthKey(year: number, month: number): MonthKey {
  return `${year}-${String(month).padStart(2, '0')}`
}

export function parseMonthKey(key: MonthKey): { year: number; month: number } {
  const [y, m] = key.split('-').map(Number)
  return { year: y, month: m }
}

export function addMonthsKey(key: MonthKey, delta: number): MonthKey {
  const { year, month } = parseMonthKey(key)
  const idx = year * 12 + (month - 1) + delta
  return monthKey(Math.floor(idx / 12), (idx % 12) + 1)
}

export function addMonthsISO(iso: ISODate, delta: number): ISODate {
  const key = addMonthsKey(monthKeyOf(iso), delta)
  return `${key}-${String(Number(iso.slice(8, 10))).padStart(2, '0')}`
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Fecha con día acotado al último día del mes (31 de febrero → 28/29). */
export function dateInMonth(key: MonthKey, day: number): ISODate {
  const { year, month } = parseMonthKey(key)
  const safeDay = Math.min(Math.max(day, 1), daysInMonth(year, month))
  return `${monthKey(year, month)}-${String(safeDay).padStart(2, '0')}`
}

export function monthRange(key: MonthKey): { start: ISODate; end: ISODate } {
  const { year, month } = parseMonthKey(key)
  return {
    start: dateInMonth(key, 1),
    end: dateInMonth(key, daysInMonth(year, month)),
  }
}

export function monthsBetween(from: MonthKey, to: MonthKey): number {
  const a = parseMonthKey(from)
  const b = parseMonthKey(to)
  return (b.year - a.year) * 12 + (b.month - a.month)
}

export function isBeforeISO(a: ISODate, b: ISODate): boolean {
  return a < b
}

export function isWithinRange(iso: ISODate, start: ISODate, end?: ISODate | null): boolean {
  if (iso < start) return false
  if (end && iso > end) return false
  return true
}

export function nextMonths(from: MonthKey, count: number): MonthKey[] {
  return Array.from({ length: count }, (_, i) => addMonthsKey(from, i))
}

const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre',
]

export function monthLabel(key: MonthKey, opts: { short?: boolean; year?: boolean } = {}): string {
  const { year, month } = parseMonthKey(key)
  const name = MONTH_NAMES[month - 1] ?? ''
  const label = name.charAt(0).toUpperCase() + name.slice(1)
  const short = opts.short ? label.slice(0, 3) : label
  return opts.year === false ? short : `${short} ${year}`
}

export function dateLabel(iso: ISODate, today: ISODate = todayISO()): string {
  if (iso === today) return 'Hoy'
  const key = monthKeyOf(iso)
  const day = Number(iso.slice(8, 10))
  const month = monthLabel(key, { year: false })
  return `${day} ${month.slice(0, 3).toLowerCase()}`
}

/**
 * Período de resumen de una compra con tarjeta.
 *
 * Regla: si la compra es el día de cierre o después, entra en el resumen del mes
 * siguiente. El período devuelto es el mes del VENCIMIENTO del resumen.
 * Ej.: cierre 18, vence 24 → compra 17/jun ⇒ período 2025-06;
 *      compra 19/jun ⇒ cierre 18/jul, vence 24/jul ⇒ período 2025-07.
 */
export function statementPeriodForPurchase(
  purchaseISO: ISODate,
  closingDay: number,
  dueDay: number,
): MonthKey {
  const purchaseKey = monthKeyOf(purchaseISO)
  const day = Number(purchaseISO.slice(8, 10))
  const closingKey = day >= closingDay ? addMonthsKey(purchaseKey, 1) : purchaseKey
  const dueKey = dueDay > closingDay ? closingKey : addMonthsKey(closingKey, 1)
  return dueKey
}

/** Vencimiento del resumen dentro de un período (YYYY-MM). */
export function statementDueDate(period: MonthKey, dueDay: number): ISODate {
  return dateInMonth(period, dueDay)
}

/** Cuotas: la 1 corresponde al resumen de la compra y suma un mes por cuota. */
export function installmentPeriod(firstPeriod: MonthKey, index: number): MonthKey {
  return addMonthsKey(firstPeriod, index - 1)
}

export function recurrenceStepMonths(recurrence: string | null | undefined): number {
  switch (recurrence) {
    case 'BIMONTHLY': return 2
    case 'QUARTERLY': return 3
    case 'SEMIANNUAL': return 6
    case 'ANNUAL': return 12
    default: return 1
  }
}

/**
 * Cantidad de ocurrencias mensuales (o del paso indicado) entre el inicio y la
 * fecha de corte, inclusive. Devuelve 0 si todavía no empezó.
 */
export function countOccurrences(
  startISO: ISODate,
  asOfISO: ISODate,
  stepMonths = 1,
  endISO?: ISODate | null,
  /** Día del mes en que ocurre (por ejemplo, día de cobro). */
  dayOfMonth?: number | null,
): number {
  if (asOfISO < startISO) return 0
  const limit = endISO && endISO < asOfISO ? endISO : asOfISO
  const from = monthKeyOf(startISO)
  const to = monthKeyOf(limit)
  const diff = monthsBetween(from, to)
  if (diff < 0) return 0
  // Última ocurrencia posible por mes; se descarta si su día aún no llegó.
  const lastIndex = Math.floor(diff / stepMonths)
  const day = dayOfMonth ?? Number(startISO.slice(8, 10))
  const lastDate = dateInMonth(addMonthsKey(from, lastIndex * stepMonths), day)
  if (lastDate > limit) return Math.max(0, lastIndex)
  return lastIndex + 1
}

/** Fecha de la ocurrencia n (0-based) de una serie que arranca en startISO. */
export function occurrenceDate(
  startISO: ISODate,
  index: number,
  stepMonths = 1,
  day?: number | null,
): ISODate {
  const key = addMonthsKey(monthKeyOf(startISO), index * stepMonths)
  return dateInMonth(key, day ?? Number(startISO.slice(8, 10)))
}

export function isRecurringInPeriod(
  startISO: ISODate,
  endISO: ISODate | null | undefined,
  period: MonthKey,
  stepMonths = 1,
): boolean {
  const startKey = monthKeyOf(startISO)
  if (period < startKey) return false
  if (endISO && period > monthKeyOf(endISO)) return false
  return monthsBetween(startKey, period) % stepMonths === 0
}
