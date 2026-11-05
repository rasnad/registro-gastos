/**
 * Dinero: todo el cálculo se hace en centavos enteros para evitar errores de
 * coma flotante. Prisma guarda Decimal(14,2); acá convertimos en el borde.
 */

export type CurrencyCode = 'UYU' | 'USD'
export const CURRENCIES: CurrencyCode[] = ['UYU', 'USD']

export const CURRENCY_SYMBOL: Record<CurrencyCode, string> = {
  UYU: '$U',
  USD: 'US$',
}

export function isCurrency(value: unknown): value is CurrencyCode {
  return value === 'UYU' || value === 'USD'
}

/** Acepta Decimal de Prisma, string o number. */
export function toCents(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0
  if (typeof value === 'number') return Math.round(value * 100)
  if (typeof value === 'bigint') return Number(value) * 100
  const raw = String(value).trim()
  // Decimal de Prisma serializa como "1234.56"
  const normalized = raw.includes(',') && raw.includes('.')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.replace(',', '.')
  const n = Number(normalized)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

export function fromCents(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(Math.round(cents))
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

export function centsToNumber(cents: number): number {
  return Math.round(cents) / 100
}

export function sumCents(values: Array<number | null | undefined>): number {
  return values.reduce<number>((acc, v) => acc + (v ?? 0), 0)
}

export function clampZero(cents: number): number {
  return cents < 0 ? 0 : cents
}

/** Parseo tolerante de importes escritos por una persona: "1.234,56" o "1,234.56". */
export function parseAmountInput(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null
  if (typeof input === 'number') return Number.isFinite(input) ? Math.round(input * 100) : null
  let raw = input.replace(/\s|\$|U|S/g, '').trim()
  if (!raw) return null
  const negative = /^-|^\(.*\)$/.test(raw)
  raw = raw.replace(/[()]/g, '').replace(/^-/, '')
  const lastComma = raw.lastIndexOf(',')
  const lastDot = raw.lastIndexOf('.')
  if (lastComma > -1 && lastDot > -1) {
    // El separador decimal es el último que aparece.
    if (lastComma > lastDot) raw = raw.replace(/\./g, '').replace(',', '.')
    else raw = raw.replace(/,/g, '')
  } else if (lastComma > -1) {
    const decimals = raw.length - lastComma - 1
    raw = decimals === 3 ? raw.replace(/,/g, '') : raw.replace(',', '.')
  } else if (lastDot > -1) {
    const decimals = raw.length - lastDot - 1
    if (decimals === 3) raw = raw.replace(/\./g, '')
  }
  const value = Number(raw)
  if (!Number.isFinite(value)) return null
  return Math.round((negative ? -value : value) * 100)
}

export function formatNumber(cents: number, opts: { decimals?: boolean } = {}): string {
  const value = centsToNumber(cents)
  const hasDecimals = cents % 100 !== 0
  return new Intl.NumberFormat('es-UY', {
    minimumFractionDigits: opts.decimals || hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatMoney(cents: number, currency: CurrencyCode, opts?: { decimals?: boolean }): string {
  return `${CURRENCY_SYMBOL[currency]} ${formatNumber(cents, opts)}`
}

export function formatSigned(cents: number, currency: CurrencyCode): string {
  const sign = cents > 0 ? '+' : cents < 0 ? '−' : ''
  return `${sign}${formatMoney(Math.abs(cents), currency)}`
}

/** Reparte un total en N cuotas sin perder centavos (la última absorbe el redondeo). */
export function splitInstallments(totalCents: number, count: number): number[] {
  if (count <= 0) return [totalCents]
  const base = Math.trunc(totalCents / count)
  const remainder = totalCents - base * count
  return Array.from({ length: count }, (_, i) => (i === count - 1 ? base + remainder : base))
}

/**
 * Convierte centavos de dólar a centavos de peso con la cotización configurada.
 * `rateCents` es cuántos centavos de UYU vale 1 USD (4100 = $U 41,00).
 * Sólo se usa para el pago de obligaciones USD desde una cuenta en pesos.
 */
export function convertUsdToUyu(usdCents: number, rateCents: number): number {
  if (rateCents <= 0) return 0
  return Math.round((usdCents * rateCents) / 100)
}

/** Formatea una cotización (centavos) como "41,00". */
export function formatRate(rateCents: number): string {
  return formatNumber(rateCents, { decimals: true })
}
