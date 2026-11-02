/**
 * Detección de duplicados y conciliación.
 *
 * Una misma compra puede llegar por tres vías: Gmail, estado de cuenta y carga
 * manual. Nunca se descarta automáticamente por "parecerse": se proponen
 * coincidencias con un motivo y el usuario confirma.
 */

import { toISODate, type ISODate } from '@/lib/period'

export type ComparableExpense = {
  id: string
  date: ISODate
  merchant: string
  amountCents: number
  currency: 'UYU' | 'USD'
  source: 'ACCOUNT' | 'CREDIT_CARD'
  accountId?: string | null
  creditCardId?: string | null
  installments: number
  origin: 'MANUAL' | 'EMAIL' | 'STATEMENT'
  status: 'CONFIRMED' | 'NEEDS_REVIEW' | 'DISCARDED'
}

export function normalizeMerchant(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(s\.?a\.?|s\.?r\.?l\.?|ltda\.?|inc\.?|corp\.?)\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function merchantTokens(raw: string): string[] {
  return normalizeMerchant(raw)
    .split(' ')
    .filter((t) => t.length > 2 && !['the', 'and', 'del', 'los', 'las', 'por'].includes(t))
}

/** Similitud Jaccard entre tokens de comercio (0..1). */
export function merchantSimilarity(a: string, b: string): number {
  const setA = new Set(merchantTokens(a))
  const setB = new Set(merchantTokens(b))
  if (setA.size === 0 || setB.size === 0) return 0
  let shared = 0
  for (const token of setA) if (setB.has(token)) shared += 1
  return shared / (setA.size + setB.size - shared)
}

export function dayDistance(a: ISODate, b: ISODate): number {
  const ms = Math.abs(new Date(`${toISODate(a)}T00:00:00Z`).getTime() - new Date(`${toISODate(b)}T00:00:00Z`).getTime())
  return Math.round(ms / 86_400_000)
}

export type DedupeInput = {
  date: ISODate
  amountCents: number
  merchant: string
  currency: 'UYU' | 'USD'
  source: 'ACCOUNT' | 'CREDIT_CARD'
  accountId?: string | null
  creditCardId?: string | null
  installments?: number
}

/**
 * Clave estable de una operación. No incluye el origen: un gasto detectado por
 * correo y el mismo gasto del resumen producen la misma clave.
 */
export function buildDedupeKey(input: DedupeInput): string {
  const scope = input.source === 'CREDIT_CARD' ? `card:${input.creditCardId ?? '?'}` : `acct:${input.accountId ?? '?'}`
  return [
    scope,
    toISODate(input.date),
    input.amountCents,
    input.currency,
    normalizeMerchant(input.merchant),
    input.installments ?? 1,
  ].join('|')
}

export type MatchConfidence = 'exact' | 'likely' | 'possible'

export type MatchResult = {
  expense: ComparableExpense
  confidence: MatchConfidence
  score: number
  reasons: string[]
}

export type MatchOptions = { dayTolerance?: number; minScore?: number }

/**
 * Busca la misma operación ya registrada. Reglas:
 *  - exact: misma clave (fecha, importe, comercio normalizado y medio de pago).
 *  - likely: mismo importe/moneda/medio y fecha ±tolerancia, o comercio idéntico.
 *  - possible: importe y moneda iguales, comercio parecido, fecha más lejana.
 */
export function findDuplicates(
  candidate: DedupeInput,
  existing: ComparableExpense[],
  options: MatchOptions = {},
): MatchResult[] {
  const dayTolerance = options.dayTolerance ?? 3
  const minScore = options.minScore ?? 0.55
  const candidateKey = buildDedupeKey(candidate)
  const results: MatchResult[] = []

  for (const expense of existing) {
    if (expense.status === 'DISCARDED') continue
    if (expense.currency !== candidate.currency) continue
    if (expense.source !== candidate.source) continue
    if (candidate.source === 'CREDIT_CARD' && candidate.creditCardId && expense.creditCardId !== candidate.creditCardId) continue
    if (candidate.source === 'ACCOUNT' && candidate.accountId && expense.accountId !== candidate.accountId) continue

    const sameKey = buildDedupeKey(expense) === candidateKey
    if (sameKey) {
      results.push({ expense, confidence: 'exact', score: 1, reasons: ['Misma fecha, importe, comercio y medio de pago'] })
      continue
    }

    if (expense.amountCents !== candidate.amountCents) continue

    const distance = dayDistance(expense.date, candidate.date)
    const similarity = merchantSimilarity(expense.merchant, candidate.merchant)
    const sameInstallments = (expense.installments || 1) === (candidate.installments || 1)

    const reasons: string[] = ['Mismo importe y moneda']
    let score = 0.4

    if (distance <= dayTolerance) {
      score += 0.25
      reasons.push(`Misma fecha (${distance} día${distance === 1 ? '' : 's'} de diferencia)`)
    } else if (distance <= dayTolerance * 2) {
      score += 0.1
      reasons.push(`Fecha cercana (${distance} días)`)
    } else {
      // Sin cercanía de fecha no es una coincidencia razonable.
      continue
    }

    if (similarity >= 0.75) {
      score += 0.3
      reasons.push('Comercio prácticamente idéntico')
    } else if (similarity >= 0.4) {
      score += 0.15
      reasons.push('Comercio parecido')
    }
    if (!sameInstallments) {
      score -= 0.2
      reasons.push('Distinta cantidad de cuotas')
    }

    if (score >= minScore) {
      results.push({
        expense,
        confidence: score >= 0.8 ? 'likely' : 'possible',
        score: Math.min(1, Math.round(score * 100) / 100),
        reasons,
      })
    }
  }

  return results.sort((a, b) => b.score - a.score)
}

/** Agrupa duplicados exactos dentro del propio set a importar (p. ej. un PDF). */
export function groupInternalDuplicates<T extends DedupeInput>(rows: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const key = buildDedupeKey(row)
    const list = groups.get(key) ?? []
    list.push(row)
    groups.set(key, list)
  }
  return new Map([...groups.entries()].filter(([, list]) => list.length > 1))
}
