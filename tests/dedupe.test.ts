import { describe, expect, it } from 'vitest'
import {
  buildDedupeKey,
  findDuplicates,
  groupInternalDuplicates,
  merchantSimilarity,
  normalizeMerchant,
  type ComparableExpense,
} from '@/lib/finance/dedupe'

const existing: ComparableExpense[] = [
  {
    id: 'e1',
    date: '2025-06-17',
    merchant: 'Supermercado Disco',
    amountCents: 23_800,
    currency: 'UYU',
    source: 'CREDIT_CARD',
    creditCardId: 'card-1',
    accountId: null,
    installments: 1,
    origin: 'EMAIL',
    status: 'CONFIRMED',
  },
]

describe('normalización de comercios', () => {
  it('ignora acentos, mayúsculas y formas societarias', () => {
    expect(normalizeMerchant('SUPERMERCADO DISCO S.A.')).toBe('supermercado disco')
    expect(normalizeMerchant('Café  Martínez')).toBe('cafe martinez')
    expect(merchantSimilarity('Supermercado Disco', 'Disco Supermercado')).toBe(1)
    expect(merchantSimilarity('Disco', 'Devoto')).toBe(0)
  })
})

describe('deduplicación', () => {
  it('genera la misma clave para el mismo gasto aunque cambie el origen', () => {
    const fromEmail = buildDedupeKey({
      date: '2025-06-17',
      amountCents: 23_800,
      merchant: 'SUPERMERCADO DISCO S.A.',
      currency: 'UYU',
      source: 'CREDIT_CARD',
      creditCardId: 'card-1',
    })
    const fromStatement = buildDedupeKey({
      date: '2025-06-17',
      amountCents: 23_800,
      merchant: 'Supermercado Disco',
      currency: 'UYU',
      source: 'CREDIT_CARD',
      creditCardId: 'card-1',
    })
    expect(fromEmail).toBe(fromStatement)
  })

  it('detecta coincidencia exacta contra un gasto existente', () => {
    const results = findDuplicates(
      {
        date: '2025-06-17',
        amountCents: 23_800,
        merchant: 'Supermercado Disco',
        currency: 'UYU',
        source: 'CREDIT_CARD',
        creditCardId: 'card-1',
      },
      existing,
    )
    expect(results[0].confidence).toBe('exact')
    expect(results[0].expense.id).toBe('e1')
  })

  it('propone coincidencia probable cuando la fecha difiere uno o dos días', () => {
    const results = findDuplicates(
      {
        date: '2025-06-18',
        amountCents: 23_800,
        merchant: 'Disco',
        currency: 'UYU',
        source: 'CREDIT_CARD',
        creditCardId: 'card-1',
      },
      existing,
    )
    expect(results[0].confidence).toBe('likely')
    expect(results[0].reasons.join(' ')).toMatch(/fecha/i)
  })

  it('no propone duplicados de otra tarjeta ni de otra moneda', () => {
    expect(
      findDuplicates(
        {
          date: '2025-06-17',
          amountCents: 23_800,
          merchant: 'Supermercado Disco',
          currency: 'UYU',
          source: 'CREDIT_CARD',
          creditCardId: 'card-2',
        },
        existing,
      ),
    ).toHaveLength(0)
    expect(
      findDuplicates(
        {
          date: '2025-06-17',
          amountCents: 23_800,
          merchant: 'Supermercado Disco',
          currency: 'USD',
          source: 'CREDIT_CARD',
          creditCardId: 'card-1',
        },
        existing,
      ),
    ).toHaveLength(0)
  })

  it('no considera duplicado un importe distinto', () => {
    expect(
      findDuplicates(
        {
          date: '2025-06-17',
          amountCents: 23_801,
          merchant: 'Supermercado Disco',
          currency: 'UYU',
          source: 'CREDIT_CARD',
          creditCardId: 'card-1',
        },
        existing,
      ),
    ).toHaveLength(0)
  })

  it('ignora gastos descartados', () => {
    const results = findDuplicates(
      {
        date: '2025-06-17',
        amountCents: 23_800,
        merchant: 'Supermercado Disco',
        currency: 'UYU',
        source: 'CREDIT_CARD',
        creditCardId: 'card-1',
      },
      [{ ...existing[0], status: 'DISCARDED' }],
    )
    expect(results).toHaveLength(0)
  })

  it('detecta filas repetidas dentro de un mismo archivo importado', () => {
    const rows = [
      { date: '2025-06-17', amountCents: 23_800, merchant: 'Disco', currency: 'UYU' as const, source: 'CREDIT_CARD' as const, creditCardId: 'card-1' },
      { date: '2025-06-17', amountCents: 23_800, merchant: 'DISCO S.A.', currency: 'UYU' as const, source: 'CREDIT_CARD' as const, creditCardId: 'card-1' },
      { date: '2025-06-18', amountCents: 5_000, merchant: 'Devoto', currency: 'UYU' as const, source: 'CREDIT_CARD' as const, creditCardId: 'card-1' },
    ]
    const groups = groupInternalDuplicates(rows)
    expect(groups.size).toBe(1)
    expect([...groups.values()][0]).toHaveLength(2)
  })
})
