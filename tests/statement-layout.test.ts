import { describe, expect, it } from 'vitest'
import { parseStatementLayout, firstPeriodOfInstallment, type PdfTextItem } from '@/lib/statement/layout'
import { cleanMerchantName, suggestCategoryName } from '@/lib/categories-rules'

/** Helper: fragmento de texto con posición (el borde derecho es x + width). */
function item(str: string, x: number, y: number, width = 6 * str.length): PdfTextItem {
  return { str, x, y, width: Math.max(width, 4) }
}

/** Importe alineado a la derecha de una columna (borde derecho = anchor). */
function moneyItem(value: string, anchor: number, y: number): PdfTextItem {
  const width = 5.9 * value.length
  return item(value, anchor - width, y, width)
}

function header(y: number) {
  return [item('19/10/26', 60, y), item('16/11/26', 120, y), item('Simon Bolivar 1271', 180, y)]
}

const UYU_ANCHOR = 474
const USD_ANCHOR = 533

function buildStatement(): PdfTextItem[][] {
  return [
    [
      item('1/ 3', 20, 5),
      item('05/10/26', 60, 10),
      item('LUCAS ESPINOSA', 60, 15),
      ...header(20),
      item('SALDO DEL ESTADO DE CUENTA ANTERIOR', 133, 30),
      moneyItem('37.854,47', UYU_ANCHOR, 30),
      moneyItem('669,05', USD_ANCHOR, 30),

      item('05', 66, 40), item('09', 79, 40), item('26', 91, 40),
      item('7061', 108, 40), item('PAGOS', 142, 40),
      moneyItem('-37.854,47', UYU_ANCHOR, 40), moneyItem('-669,05', USD_ANCHOR, 40),

      item('20', 66, 50), item('05', 79, 50), item('26', 91, 50),
      item('7061', 108, 50), item('ZONA TECNO', 142, 50), item('5/12', 293, 50),
      moneyItem('3,33', USD_ANCHOR, 50),

      item('07', 66, 60), item('09', 79, 60), item('26', 91, 60),
      item('7061', 108, 60), item('OPENAI *CHATGPT SUBS', 142, 60),
      moneyItem('20,00', 415, 60), moneyItem('20,00', USD_ANCHOR, 60),

      item('12', 66, 70), item('09', 79, 70), item('26', 91, 70),
      item('7061', 108, 70), item('CANDY SWEET', 142, 70),
      moneyItem('484,00', UYU_ANCHOR, 70),

      item('06', 66, 80), item('07', 79, 80), item('26', 91, 80),
      item('7061', 108, 80), item('MERPAGO*FERROFERTAS', 142, 80), item('3/ 5', 293, 80),
      moneyItem('-911,81', UYU_ANCHOR, 80),

      item('04', 66, 90), item('10', 79, 90), item('26', 91, 90),
      item('7061', 108, 90), item('UBER *TRIP', 142, 90),

      item('SALDO CONTADO', 133, 100),
      moneyItem('28.702,49', UYU_ANCHOR, 100),
      moneyItem('229,22', USD_ANCHOR, 100),
    ],
  ]
}

describe('parser de resumen por layout (Itaú)', () => {
  const result = parseStatementLayout(buildStatement(), { today: '2026-11-02' })

  it('detecta cierre, vencimiento y período', () => {
    expect(result.meta.closingDate).toBe('2026-10-05')
    expect(result.meta.dueDate).toBe('2026-10-19')
    expect(result.meta.nextClosingDate).toBe('2026-11-16')
    expect(result.meta.period).toBe('2026-10')
  })

  it('detecta las columnas y los totales en cada moneda', () => {
    expect(result.meta.anchors?.uyu).toBeCloseTo(UYU_ANCHOR, 0)
    expect(result.meta.anchors?.usd).toBeCloseTo(USD_ANCHOR, 0)
    expect(result.meta.totals).toEqual({ UYU: 2_870_249, USD: 22_922 })
    expect(result.meta.cardLast4).toBe('7061')
  })

  it('separa pesos de dólares sin duplicar la columna repetida', () => {
    const openai = result.rows.find((row) => row.merchant.includes('OPENAI'))
    expect(openai?.currency).toBe('USD')
    expect(openai?.amountCents).toBe(2_000)

    const candy = result.rows.find((row) => row.merchant.includes('CANDY'))
    expect(candy?.currency).toBe('UYU')
    expect(candy?.amountCents).toBe(48_400)
  })

  it('lee la cuota N/M y la ubica en el resumen actual', () => {
    const zona = result.rows.find((row) => row.merchant.includes('ZONA TECNO'))
    expect(zona?.installmentNumber).toBe(5)
    expect(zona?.installments).toBe(12)
    expect(zona?.period).toBe('2026-10')
    expect(firstPeriodOfInstallment('2026-10', 5)).toBe('2026-06')
  })

  it('excluye pagos y notas de crédito con un motivo visible', () => {
    expect(result.rows.some((row) => /PAGOS/i.test(row.merchant))).toBe(false)
    const refund = result.rows.find((row) => row.merchant.includes('FERROFERTAS'))
    expect(refund?.include).toBe(false)
    expect(refund?.excludedReason).toMatch(/crédito|devolución/i)
  })

  it('sugiere categoría por comercio', () => {
    expect(result.rows.find((row) => row.merchant.includes('OPENAI'))?.categoryName).toBe('Cuentas')
    expect(result.rows.find((row) => row.merchant.includes('CANDY'))?.categoryName).toBe('Comida')
    expect(result.rows.find((row) => row.merchant.includes('ZONA TECNO'))?.categoryName).toBeNull()
  })

  it('no inventa datos si el PDF no tiene columnas reconocibles', () => {
    const plain = parseStatementLayout(
      [[item('17 06 26', 60, 10), item('7061', 108, 10), item('DISCO', 142, 10), item('1.234,56', 300, 10)]],
      { today: '2026-11-02' },
    )
    expect(plain.meta.reliability).toBe('baja')
    expect(plain.meta.warnings.join(' ')).toMatch(/columnas/i)
  })
})

describe('reglas de categorías', () => {
  it('limpia prefijos de pasarelas y símbolos', () => {
    expect(cleanMerchantName('MERPAGO*MERCADOLIBRE')).toBe('MERCADOLIBRE')
    expect(cleanMerchantName('DLO*PEDIDOSYA LA RON')).toBe('PEDIDOSYA LA RON')
    expect(cleanMerchantName('PAYPAL *SPOTIFY*P476')).toBe('SPOTIFY P476')
    expect(cleanMerchantName('DISCO N? 20')).toBe('DISCO N° 20')
  })

  it('clasifica los comercios frecuentes del resumen', () => {
    expect(suggestCategoryName('MERPAGO*MERCADOLIBRE')).toBe('Compras')
    expect(suggestCategoryName('CLUB SINERGIA LIFE')).toBe('Otras')
    expect(suggestCategoryName('CAFETERIA SINERGIA L')).toBe('Comida')
    expect(suggestCategoryName('DLO*PEDIDOSYA LA RON')).toBe('Delivery')
    expect(suggestCategoryName('UBER *TRIP')).toBe('Transporte')
    expect(suggestCategoryName('GOOGLE *G1SK002M')).toBe('Cuentas')
    expect(suggestCategoryName('FARMACIA SAN ROQUE')).toBe('Otras')
  })

  it('no inventa categoría cuando no hay coincidencia', () => {
    expect(suggestCategoryName('RUDY')).toBeNull()
    expect(suggestCategoryName('ZONA TECNO')).toBeNull()
    expect(suggestCategoryName('')).toBeNull()
  })
})
