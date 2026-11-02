import { describe, expect, it } from 'vitest'
import { parseStatementText } from '@/lib/statement/parse'

const CARD = { closingDay: 18, dueDay: 24 }

describe('parser de estado de cuenta', () => {
  it('extrae filas, cierre, vencimiento y total', () => {
    const text = [
      'ESTADO DE CUENTA TARJETA DE CREDITO',
      'Fecha de cierre: 18/06/2025',
      'Fecha de vencimiento: 24/06/2025',
      'TOTAL A PAGAR: 45.678,90',
      '',
      '17/06/2025  SUPERMERCADO DISCO  1.234,56',
      '18/06/2025  FARMACIA  890,00',
      '19/06/2025  LAPTOP 3/10  4.290,00',
      'SALDO ANTERIOR  12.000,00',
    ].join('\n')

    const parsed = parseStatementText(text, { today: '2025-06-20', card: CARD })

    expect(parsed.meta.closingDate).toBe('2025-06-18')
    expect(parsed.meta.dueDate).toBe('2025-06-24')
    expect(parsed.meta.totalAmountCents).toBe(4567890)
    expect(parsed.rows).toHaveLength(3)

    const disco = parsed.rows[0]
    expect(disco.merchant).toBe('SUPERMERCADO DISCO')
    expect(disco.amountCents).toBe(123456)
    expect(disco.date).toBe('2025-06-17')
    expect(disco.period).toBe('2025-06')

    const laptop = parsed.rows[2]
    expect(laptop.merchant).toBe('LAPTOP')
    expect(laptop.installmentNumber).toBe(3)
    expect(laptop.installments).toBe(10)
    expect(laptop.amountCents).toBe(429000)
  })

  it('ignora totales, saldos e intereses', () => {
    const parsed = parseStatementText(
      [
        'SALDO ANTERIOR 12.000,00',
        'TOTAL A PAGAR 45.678,90',
        'INTERESES 1.200,00',
        'PAGO MINIMO 4.500,00',
        '17/06/2025  DISCO  1.234,56',
      ].join('\n'),
      { today: '2025-06-20', card: CARD },
    )
    expect(parsed.rows).toHaveLength(1)
    expect(parsed.rows[0].merchant).toBe('DISCO')
  })

  it('no inventa fechas ni períodos cuando el documento no los trae', () => {
    const parsed = parseStatementText(['DISCO 1.234,56', 'DEVOTO 560,00'].join('\n'), {
      today: '2025-06-20',
    })
    expect(parsed.rows).toHaveLength(2)
    expect(parsed.rows[0].date).toBeNull()
    expect(parsed.rows[0].period).toBeNull()
    expect(parsed.rows[0].confidence).toBe('medium')
    expect(parsed.meta.warnings.join(' ')).toMatch(/cierre/i)
  })

  it('baja la confiabilidad si no hay consumos reconocibles', () => {
    const parsed = parseStatementText('Este archivo no es un resumen.', { today: '2025-06-20', card: CARD })
    expect(parsed.rows).toHaveLength(0)
    expect(parsed.meta.reliability).toBe('baja')
    expect(parsed.meta.warnings.join(' ')).toMatch(/carga manual/i)
  })

  it('detecta consumos en dólares', () => {
    const parsed = parseStatementText(
      ['17/06/2025  AMAZON  U$S 250,00', '18/06/2025  DISCO  $ 1.000,00'].join('\n'),
      { today: '2025-06-20', card: CARD, currency: 'UYU' },
    )
    expect(parsed.rows[0].currency).toBe('USD')
    expect(parsed.rows[1].currency).toBe('UYU')
  })
})
