import { describe, expect, it } from 'vitest'
import {
  addMonthsKey,
  countOccurrences,
  statementPeriodForPurchase,
  statementDueDate,
  dateInMonth,
  monthLabel,
} from '@/lib/period'

describe('períodos de resumen de tarjeta', () => {
  it('imputa la compra anterior al cierre al resumen del mes', () => {
    expect(statementPeriodForPurchase('2025-06-17', 18, 24)).toBe('2025-06')
  })

  it('imputa la compra del mismo día de cierre al resumen siguiente', () => {
    expect(statementPeriodForPurchase('2025-06-18', 18, 24)).toBe('2025-07')
  })

  it('imputa una compra posterior al cierre al mes siguiente', () => {
    expect(statementPeriodForPurchase('2025-06-19', 18, 24)).toBe('2025-07')
  })

  it('si el vencimiento es anterior al cierre, cae en el mes siguiente', () => {
    // Cierre 25, vence 5: compra 20/jun → cierra 25/jun → vence 5/jul.
    expect(statementPeriodForPurchase('2025-06-20', 25, 5)).toBe('2025-07')
  })

  it('si el vencimiento es posterior al cierre, cae en el mismo mes', () => {
    expect(statementPeriodForPurchase('2025-06-10', 18, 30)).toBe('2025-06')
  })

  it('respeta el último día del mes en vencimientos 31', () => {
    expect(statementDueDate('2025-02', 31)).toBe('2025-02-28')
    expect(dateInMonth('2024-02', 31)).toBe('2024-02-29')
  })

  it('avanza períodos cruzando el año', () => {
    expect(addMonthsKey('2025-12', 1)).toBe('2026-01')
    expect(addMonthsKey('2025-01', -1)).toBe('2024-12')
    expect(monthLabel('2025-09')).toBe('Setiembre 2025')
  })

  it('cuenta ocurrencias mensuales sin adelantar el futuro', () => {
    expect(countOccurrences('2025-01-10', '2025-01-09')).toBe(0)
    expect(countOccurrences('2025-01-10', '2025-01-10')).toBe(1)
    expect(countOccurrences('2025-01-10', '2025-04-09')).toBe(3)
    expect(countOccurrences('2025-01-10', '2025-04-10')).toBe(4)
  })
})
