import { describe, expect, it } from 'vitest'
import { convertUsdToUyu, formatMoney, formatRate, parseAmountInput, splitInstallments, toCents } from '@/lib/money'

describe('dinero', () => {
  it('convierte Decimal de Prisma a centavos sin errores de flotante', () => {
    expect(toCents('0.10')).toBe(10)
    expect(toCents('1234.56')).toBe(123456)
    expect(toCents(19.99)).toBe(1999)
    expect(toCents('0.1') + toCents('0.2')).toBe(toCents('0.3'))
  })

  it('parsea importes escritos en formato uruguayo y anglosajón', () => {
    expect(parseAmountInput('1.234,56')).toBe(123456)
    expect(parseAmountInput('1,234.56')).toBe(123456)
    expect(parseAmountInput('$U 2.500')).toBe(250000)
    expect(parseAmountInput('2,500')).toBe(250000)
    expect(parseAmountInput('19,99')).toBe(1999)
    expect(parseAmountInput('')).toBeNull()
    expect(parseAmountInput('abc')).toBeNull()
  })

  it('reparte cuotas sin perder centavos', () => {
    const parts = splitInstallments(10000, 3)
    expect(parts).toEqual([3333, 3333, 3334])
    expect(parts.reduce((a, b) => a + b, 0)).toBe(10000)
  })

  it('formatea cada moneda por separado', () => {
    expect(formatMoney(123456, 'UYU')).toBe('$U 1.234,56')
    expect(formatMoney(123456, 'USD')).toBe('US$ 1.234,56')
    expect(formatMoney(100000, 'UYU')).toBe('$U 1.000')
  })
})

describe('conversión para pagos', () => {
  it('convierte dólares a pesos con la cotización configurada', () => {
    // US$ 229,22 a 41,00 = $U 9.398,02
    expect(convertUsdToUyu(22_922, 4_100)).toBe(939_802)
    expect(convertUsdToUyu(10_000, 4_100)).toBe(410_000)
    expect(convertUsdToUyu(0, 4_100)).toBe(0)
  })

  it('formatea la cotización con dos decimales', () => {
    expect(formatRate(4_100)).toBe('41,00')
    expect(formatRate(4_135)).toBe('41,35')
  })
})
