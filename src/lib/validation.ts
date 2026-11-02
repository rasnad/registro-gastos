import { CURRENCIES, parseAmountInput, type CurrencyCode } from '@/lib/money'

export function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim()
}

export function optStr(formData: FormData, key: string): string | null {
  const value = str(formData, key)
  return value.length > 0 ? value : null
}

export function int(formData: FormData, key: string, fallback = 0): number {
  const value = Number(str(formData, key))
  return Number.isFinite(value) ? Math.trunc(value) : fallback
}

export function bool(formData: FormData, key: string): boolean {
  const value = formData.get(key)
  return value === 'on' || value === 'true' || value === '1'
}

export function cents(formData: FormData, key: string): number | null {
  return parseAmountInput(str(formData, key))
}

export function currency(formData: FormData, key = 'currency'): CurrencyCode | null {
  const value = str(formData, key)
  return (CURRENCIES as string[]).includes(value) ? (value as CurrencyCode) : null
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function isoDate(formData: FormData, key: string): string | null {
  const value = str(formData, key)
  return ISO_DATE.test(value) ? value : null
}

export function monthKey(formData: FormData, key: string): string | null {
  const value = str(formData, key)
  return /^\d{4}-\d{2}$/.test(value) ? value : null
}

export function dayOfMonth(formData: FormData, key: string, fallback = 1): number {
  const value = int(formData, key, fallback)
  return Math.min(31, Math.max(1, value))
}

/** Convierte una fecha ISO a Date UTC a medianoche (columnas @db.Date). */
export function dateValue(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}
