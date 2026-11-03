/**
 * Parser de resúmenes de tarjeta usando la POSICIÓN del texto en el PDF.
 *
 * El resumen de Itaú (formato observado) tiene:
 *   fecha (DD MM YY) | tarjeta (4 dígitos) | comercio | cuota (N/M) | pesos | dólares
 * con dos columnas de importe alineadas a la derecha. Leer sólo el texto plano
 * mezcla las columnas y confunde pesos con dólares; por eso acá se usan las
 * coordenadas X de cada fragmento.
 *
 * Todo lo que no se puede determinar con confianza queda marcado para revisión
 * o excluido con un motivo visible.
 */

import { parseAmountInput } from '@/lib/money'
import { addMonthsKey, monthKeyOf, type MonthKey } from '@/lib/period'
import { cleanMerchantName, suggestCategoryName } from '@/lib/categories-rules'

export type PdfTextItem = {
  str: string
  x: number
  y: number
  width: number
  height?: number
}

export type StatementLayoutRow = {
  key: string
  date: string | null
  merchant: string
  amountCents: number | null
  currency: 'UYU' | 'USD'
  installmentNumber: number | null
  installments: number | null
  period: MonthKey | null
  categoryName: string | null
  confidence: 'high' | 'medium' | 'low'
  warnings: string[]
  include: boolean
  excludedReason?: string
}

export type StatementLayoutResult = {
  rows: StatementLayoutRow[]
  meta: {
    closingDate: string | null
    dueDate: string | null
    nextClosingDate: string | null
    period: MonthKey | null
    totals: { UYU: number | null; USD: number | null }
    cardLast4: string | null
    reliability: 'baja' | 'media' | 'alta'
    warnings: string[]
    linesScanned: number
    excluded: number
    anchors: { uyu: number; usd: number } | null
  }
}

const MONEY = /^-?\d{1,3}(?:\.\d{3})*,\d{2}$|^-?\d+,\d{2}$/
const SLASH_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/
const NUM = /^\d{1,2}$/
const CARD = /^\d{4}$/
const INSTALLMENT = /^(\d{1,2})\s*\/\s*(\d{1,2})$/

const EXCLUDE_PATTERNS: Array<{ test: RegExp; reason: string }> = [
  { test: /\bpagos?\b/i, reason: 'Pago del resumen (no es un consumo)' },
  { test: /saldo/i, reason: 'Saldo o total del resumen' },
  { test: /\btotal\b/i, reason: 'Total del resumen' },
  { test: /reduc\.?\s*iva|ley\s*n?[°º]?\s*17934|ley\s*n?[°º]?\s*19210/i, reason: 'Ajuste de IVA (nota de crédito)' },
  { test: /financiaci|cuotas de|tea\b/i, reason: 'Texto informativo de financiación' },
  { test: /seguro de vida/i, reason: 'Seguro de vida sobre saldo (cargo sin fecha)' },
]

function right(item: PdfTextItem): number {
  return item.x + item.width
}

function lineText(items: PdfTextItem[]): string {
  return items.map((item) => item.str).join(' ').replace(/\s{2,}/g, ' ').trim()
}

function moneyValue(item: PdfTextItem): number | null {
  if (!MONEY.test(item.str)) return null
  return parseAmountInput(item.str)
}

/** Agrupa fragmentos que comparten renglón (tolerancia de 2.5 pt). */
function groupLines(page: PdfTextItem[]): PdfTextItem[][] {
  const sorted = [...page].sort((a, b) => a.y - b.y || a.x - b.x)
  const lines: PdfTextItem[][] = []
  let current: PdfTextItem[] = []
  let currentY: number | null = null

  for (const item of sorted) {
    if (currentY === null || Math.abs(item.y - currentY) <= 2.5) {
      current.push(item)
      currentY = currentY ?? item.y
    } else {
      if (current.length > 0) lines.push(current)
      current = [item]
      currentY = item.y
    }
  }
  if (current.length > 0) lines.push(current)
  return lines.map((items) => items.sort((a, b) => a.x - b.x))
}

function parseSlashDate(value: string): string | null {
  const match = SLASH_DATE.exec(value)
  if (!match) return null
  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3]) >= 100 ? Number(match[3]) : 2000 + Number(match[3])
  if (day < 1 || day > 31 || month < 1 || month > 12) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Fecha de la fila: tres fragmentos numéricos consecutivos (DD MM YY). */
function parseRowDate(items: PdfTextItem[]): string | null {
  const parts = items
    .filter((item) => item.x < 100 && NUM.test(item.str))
    .slice(0, 3)
    .map((item) => Number(item.str))
  if (parts.length < 3) return null
  const [day, month, year] = parts
  if (day < 1 || day > 31 || month < 1 || month > 12) return null
  return `${year >= 100 ? year : 2000 + year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Detecta las columnas de importe a partir de la línea "SALDO CONTADO". */
function detectAnchors(lines: PdfTextItem[][]): { uyu: number; usd: number } | null {
  for (const items of lines) {
    const text = lineText(items)
    if (!/saldo contado/i.test(text)) continue
    const money = items
      .filter((item) => moneyValue(item) !== null && item.x > 300)
      .sort((a, b) => right(a) - right(b))
    if (money.length >= 2) {
      return { uyu: right(money[money.length - 2]), usd: right(money[money.length - 1]) }
    }
  }
  // Alternativa: dos columnas a la derecha en la línea del saldo anterior.
  for (const items of lines) {
    if (!/saldo del estado de cuenta anterior/i.test(lineText(items))) continue
    const money = items.filter((item) => moneyValue(item) !== null && item.x > 300).sort((a, b) => right(a) - right(b))
    if (money.length >= 2) {
      return { uyu: right(money[money.length - 2]), usd: right(money[money.length - 1]) }
    }
  }
  return null
}

function anchorCurrency(amountRight: number, anchors: { uyu: number; usd: number } | null): 'UYU' | 'USD' | null {
  if (!anchors) return null
  if (Math.abs(amountRight - anchors.usd) <= 10) return 'USD'
  if (Math.abs(amountRight - anchors.uyu) <= 10) return 'UYU'
  return null
}

function findHeaderDates(lines: PdfTextItem[][]) {
  let closingDate: string | null = null
  let dueDate: string | null = null
  let nextClosingDate: string | null = null

  for (const items of lines) {
    const dates = items
      .map((item) => (SLASH_DATE.test(item.str) ? parseSlashDate(item.str) : null))
      .filter((value): value is string => Boolean(value))
    if (dates.length === 0) continue
    if (dates.length >= 2 && !dueDate) {
      dueDate = dates[0]
      nextClosingDate = dates[1]
      continue
    }
    if (!closingDate) closingDate = dates[0]
  }

  // La primera fecha del encabezado (05/10/26) suele ser la emisión del resumen;
  // la del renglón con dos fechas es el vencimiento y el próximo cierre.
  return { closingDate, dueDate, nextClosingDate }
}

export function parseStatementLayout(
  pages: PdfTextItem[][],
  options: { today: string; statementPeriod?: MonthKey | null; defaultCurrency?: 'UYU' | 'USD' },
): StatementLayoutResult {
  const allLines = pages.flatMap((page) => groupLines(page))
  const anchors = detectAnchors(allLines)
  const { closingDate, dueDate, nextClosingDate } = findHeaderDates(allLines)

  const explicitPeriod = options.statementPeriod ?? null
  const period: MonthKey | null =
    explicitPeriod ?? (dueDate ? monthKeyOf(dueDate) : null)

  const warnings: string[] = []
  if (!anchors) {
    warnings.push(
      'No se detectaron las columnas de pesos y dólares. Revisá la moneda de cada fila antes de importar.',
    )
  }
  if (!dueDate) {
    warnings.push('No se encontró la fecha de vencimiento: elegí el período del resumen a mano.')
  }
  if (!closingDate) warnings.push('No se encontró la fecha de cierre.')

  const rows: StatementLayoutRow[] = []
  const cardCounts = new Map<string, number>()
  let totals: { UYU: number | null; USD: number | null } = { UYU: null, USD: null }
  let excluded = 0
  let lineIndex = 0

  for (const items of allLines) {
    const text = lineText(items)
    lineIndex += 1

    // Totales del resumen
    if (/saldo contado/i.test(text)) {
      const money = items
        .filter((item) => moneyValue(item) !== null && item.x > 300)
        .sort((a, b) => right(a) - right(b))
      if (money.length >= 2) {
        totals = { UYU: moneyValue(money[money.length - 2]), USD: moneyValue(money[money.length - 1]) }
      } else if (money.length === 1) {
        totals = { UYU: moneyValue(money[0]), USD: null }
      }
      continue
    }

    const date = parseRowDate(items)
    const cardItem = items.find((item) => CARD.test(item.str) && item.x >= 95 && item.x < 140)
    if (cardItem) cardCounts.set(cardItem.str, (cardCounts.get(cardItem.str) ?? 0) + 1)

    const merchantItems = items.filter((item) => item.x >= 135 && item.x < 287)
    const installmentText = items
      .filter((item) => item.x >= 287 && item.x < 340)
      .map((item) => item.str)
      .join(' ')
      .trim()
    const installmentMatch = INSTALLMENT.exec(installmentText)

    const money = items.filter((item) => moneyValue(item) !== null)
    const anchored = anchors
      ? money
          .map((item) => ({ item, currency: anchorCurrency(right(item), anchors) }))
          .filter((entry): entry is { item: PdfTextItem; currency: 'UYU' | 'USD' } => entry.currency !== null)
      : []

    // Sin fecha, tarjeta ni importe no es una fila de consumo (encabezados, avisos).
    if (!date && !cardItem && anchored.length === 0) continue

    const merchant = cleanMerchantName(lineText(merchantItems))
    const primary = anchored.length > 0 ? anchored[0] : null
    const amountCents = primary ? moneyValue(primary.item) : null

    const exclusion = EXCLUDE_PATTERNS.find((pattern) => pattern.test.test(text))
    const noMerchant = merchant.length < 3
    const negative = amountCents !== null && amountCents < 0

    let excludedReason: string | undefined
    if (exclusion) excludedReason = exclusion.reason
    else if (negative) excludedReason = 'Nota de crédito o devolución (importe negativo)'
    else if (noMerchant) excludedReason = 'Sin descripción legible'
    else if (amountCents === null) excludedReason = 'Sin importe en una columna reconocida'

    // Sólo se consideran filas con pinta de consumo: fecha o cuota o tarjeta.
    if (!date && !installmentMatch && !cardItem && !excludedReason) continue

    const include = !excludedReason

    if (!include) {
      excluded += 1
      // Las líneas de pago/saldo no se muestran como filas para no ensuciar.
      if (/saldo|total|pago/i.test(excludedReason ?? '')) continue
    }

    const rowWarnings: string[] = []
    if (!date) rowWarnings.push('Sin fecha legible: revisá antes de importar.')
    if (installmentMatch) {
      rowWarnings.push('El importe es la cuota del resumen, no el total de la compra (se estima).')
    }
    if (!anchors) rowWarnings.push('Moneda inferida: verificá si corresponde.')

    let confidence: StatementLayoutRow['confidence'] = 'low'
    if (date && !noMerchant && amountCents !== null && !excludedReason) confidence = 'high'
    else if ((date || installmentMatch) && amountCents !== null) confidence = 'medium'

    rows.push({
      key: `row-${lineIndex}`,
      date,
      merchant: merchant || 'Consumo sin identificar',
      amountCents,
      currency: primary?.currency ?? options.defaultCurrency ?? 'UYU',
      installmentNumber: installmentMatch ? Number(installmentMatch[1]) : null,
      installments: installmentMatch ? Number(installmentMatch[2]) : null,
      period,
      categoryName: suggestCategoryName(merchant),
      confidence,
      warnings: rowWarnings,
      include,
      ...(excludedReason ? { excludedReason } : {}),
    })
  }

  const usable = rows.filter((row) => row.include)
  const high = usable.filter((row) => row.confidence === 'high').length
  const reliability: StatementLayoutResult['meta']['reliability'] =
    anchors && usable.length >= 3 && high / usable.length >= 0.6 && closingDate && dueDate
      ? 'alta'
      : anchors && usable.length >= 1 && high / usable.length >= 0.3
        ? 'media'
        : 'baja'

  if (!period) warnings.push('Sin período de resumen no se pueden ubicar las cuotas futuras.')
  if (excluded > 0) warnings.push(`Se omitieron ${excluded} líneas (pagos, saldos, IVA o devoluciones).`)

  const cardLast4 = [...cardCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  if (usable.length === 0) {
    warnings.push('No se detectaron consumos. Probá con la carga manual o ajustá el PDF.')
  }

  return {
    rows,
    meta: {
      closingDate,
      dueDate,
      nextClosingDate,
      period,
      totals,
      cardLast4,
      reliability,
      warnings: [...new Set(warnings)],
      linesScanned: lineIndex,
      excluded,
      anchors,
    },
  }
}

/** Primer período de una compra en cuotas a partir del resumen actual. */
export function firstPeriodOfInstallment(statementPeriod: MonthKey, installmentNumber: number): MonthKey {
  return addMonthsKey(statementPeriod, -(Math.max(1, installmentNumber) - 1))
}
