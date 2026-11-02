/**
 * Parser heurístico de estados de cuenta de tarjeta (PDF → texto).
 *
 * No se asume un formato: la estructura del PDF de Itaú no fue provista.
 * Cada fila se marca con confianza y el usuario confirma antes de importar.
 * Si el texto no parece un estado de cuenta, se devuelve poca confiabilidad.
 */

import { parseAmountInput } from '@/lib/money'
import {
  monthKeyOf,
  statementDueDate,
  statementPeriodForPurchase,
  type ISODate,
  type MonthKey,
} from '@/lib/period'

export type StatementRow = {
  key: string
  date: ISODate | null
  merchant: string
  amountCents: number | null
  currency: 'UYU' | 'USD' | null
  installmentNumber: number | null
  installments: number | null
  period: MonthKey | null
  confidence: 'high' | 'medium' | 'low'
  warnings: string[]
  include: boolean
}

export type ParsedStatement = {
  rows: StatementRow[]
  meta: {
    closingDate: ISODate | null
    dueDate: ISODate | null
    totalAmountCents: number | null
    currency: 'UYU' | 'USD'
    reliability: 'baja' | 'media' | 'alta'
    warnings: string[]
    linesScanned: number
    linesSkipped: number
  }
}

const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, setiembre: 9, septiembre: 9, octubre: 10,
  noviembre: 11, diciembre: 12,
}

const SKIP_WORDS = [
  'saldo anterior', 'saldo al', 'saldo deudor', 'saldo acreedor', 'saldo total',
  'total a pagar', 'total del resumen', 'total consumos', 'subtotal',
  'pago minimo', 'pago mínimo', 'pago contado', 'su pago', 'pagos y creditos',
  'pagos y créditos', 'limite', 'límite', 'cierre', 'vencimiento', 'vence',
  'iva', 'impuestos', 'intereses', 'tasa', 'cft', 'resumen', 'categoria',
  'categoría', 'titular', 'tarjeta n', 'pagina', 'página',
]

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function fullYear(year: number): number {
  return year >= 100 ? year : 2000 + year
}

function parseDateToken(token: string): ISODate | null {
  const numeric = /(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/.exec(token)
  if (numeric) {
    const day = Number(numeric[1])
    const month = Number(numeric[2])
    const year = numeric[3] ? fullYear(Number(numeric[3])) : new Date().getUTCFullYear()
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${year}-${pad(month)}-${pad(day)}`
    }
  }
  const textual = /(\d{1,2})\s+(?:de\s+)?([a-záéíóúñ]+)(?:\s+(?:de\s+)?(\d{4}))?/i.exec(token)
  if (textual) {
    const month = MONTHS[normalize(textual[2]).toLowerCase()]
    const year = textual[3] ? Number(textual[3]) : new Date().getUTCFullYear()
    if (month) return `${year}-${pad(month)}-${pad(Number(textual[1]))}`
  }
  return null
}

function findClosingOrDue(text: string, kind: 'cierre' | 'vencimiento'): ISODate | null {
  const pattern =
    kind === 'cierre'
      ? /(?:fecha\s+de\s+)?cierre[^\d]{0,24}(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)/i
      : /(?:fecha\s+de\s+)?vencimiento[^\d]{0,24}(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)/i
  const match = pattern.exec(text)
  return match ? parseDateToken(match[1]) : null
}

type MoneyToken = { raw: string; cents: number; index: number; end: number }

function moneyTokens(line: string): MoneyToken[] {
  const result: MoneyToken[] = []
  const pattern = /-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}|-?\d{1,3}(?:,\d{3})*\.\d{2}|-?\d+\.\d{2}/g
  for (const match of line.matchAll(pattern)) {
    const cents = parseAmountInput(match[0])
    if (cents === null) continue
    result.push({ raw: match[0], cents, index: match.index ?? 0, end: (match.index ?? 0) + match[0].length })
  }
  return result
}

function detectLineCurrency(line: string, fallback: 'UYU' | 'USD'): 'UYU' | 'USD' {
  const value = normalize(line).toLowerCase()
  if (/\bu\$s\b|\busd\b|dolares/.test(value)) return 'USD'
  if (/\bpesos\b|\buyu\b/.test(value)) return 'UYU'
  return fallback
}

function findInstallment(line: string): { number: number | null; total: number | null } {
  const words = /(?:cuota|cuotas|c\/)\s*(\d{1,2})\s*(?:de|\/)\s*(\d{1,2})/i.exec(line)
  if (words) {
    return { number: Number(words[1]), total: Number(words[2]) }
  }
  // Se recorren todos los pares "N/M" de la línea: el primero puede ser una
  // fecha (19/06). Se descartan los que forman parte de una fecha completa.
  for (const match of line.matchAll(/(\d{1,2})\s*\/\s*(\d{1,2})/g)) {
    const number = Number(match[1])
    const total = Number(match[2])
    const rest = line.slice((match.index ?? 0) + match[0].length)
    if (/^\s*\/\s*\d{2,4}\b/.test(rest)) continue
    if (total >= 2 && total <= 60 && number >= 1 && number <= total) {
      return { number, total }
    }
  }
  return { number: null, total: null }
}

export function parseStatementText(
  text: string,
  options: {
    today: ISODate
    currency?: 'UYU' | 'USD'
    card?: { closingDay: number; dueDay: number } | null
  },
): ParsedStatement {
  const warnings: string[] = []
  const rawLines = text
    .replace(/\u00a0/g, ' ')
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]{2,}/g, ' ').trim())
    .filter(Boolean)

  const normalizedText = normalize(text).toLowerCase()
  const fallbackCurrency: 'UYU' | 'USD' =
    options.currency ?? (/\bu\$s\b|\busd\b|dolares/.test(normalizedText) ? 'USD' : 'UYU')

  const closingDate = findClosingOrDue(text, 'cierre')
  const dueDate = findClosingOrDue(text, 'vencimiento')
  if (!closingDate) warnings.push('No se encontró la fecha de cierre en el documento.')
  if (!dueDate) warnings.push('No se encontró la fecha de vencimiento en el documento.')

  const totalMatch = /total\s+a\s+pagar[^\d]{0,20}([\d.,]+)/i.exec(text)
  const totalAmountCents = totalMatch ? parseAmountInput(totalMatch[1]) : null

  const rows: StatementRow[] = []
  let linesSkipped = 0

  for (const [index, line] of rawLines.entries()) {
    const normalizedLine = normalize(line).toLowerCase()
    const hasSkipWord = SKIP_WORDS.some((word) => normalizedLine.includes(normalize(word)))
    const installments = findInstallment(line)
    const amounts = moneyTokens(line)

    if (amounts.length === 0) {
      linesSkipped += 1
      continue
    }
    if (hasSkipWord && installments.total === null) {
      linesSkipped += 1
      continue
    }

    // El importe es el último token monetario de la línea (las columnas de
    // saldo van antes). Se ignoran líneas con demasiados números.
    const amount = amounts[amounts.length - 1]
    const dateToken = /(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)/.exec(line)
    const date = dateToken ? parseDateToken(dateToken[1]) : null

    let merchant = line
    if (dateToken) merchant = merchant.replace(dateToken[0], ' ')
    for (const token of amounts) merchant = merchant.replace(token.raw, ' ')
    merchant = merchant
      .replace(/(?:cuota|cuotas|c\/)\s*\d{1,2}\s*(?:de|\/)\s*\d{1,2}/gi, ' ')
      .replace(/\b\d{1,2}\s*\/\s*\d{1,2}\b/g, ' ')
      .replace(/\bu\$s\b|\busd\b|\buyu\b|\$/gi, ' ')
      .replace(/[|*·•]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/^[\s\-–:;,.]+|[\s\-–:;,.]+$/g, '')
      .trim()

    const rowWarnings: string[] = []
    if (!date) {
      // Sin año en el documento, se usa el mes del cierre si está disponible.
      rowWarnings.push('Sin fecha legible: revisá la fecha antes de importar.')
    }
    if (!merchant || merchant.length < 3) {
      merchant = 'Consumo sin identificar'
      rowWarnings.push('No se pudo leer el comercio.')
    }
    if (amount.cents <= 0) {
      linesSkipped += 1
      continue
    }
    if (installments.total !== null && installments.total < 2) {
      linesSkipped += 1
      continue
    }

    const currency = detectLineCurrency(line, fallbackCurrency)

    let period: MonthKey | null = null
    if (date && options.card) {
      period = statementPeriodForPurchase(date, options.card.closingDay, options.card.dueDay)
    }

    let confidence: StatementRow['confidence'] = 'low'
    if (date && merchant !== 'Consumo sin identificar' && amounts.length === 1) confidence = 'high'
    else if (date && merchant !== 'Consumo sin identificar') confidence = 'medium'
    else if (amounts.length === 1) confidence = 'medium'

    rows.push({
      key: `row-${index}`,
      date,
      merchant,
      amountCents: amount.cents,
      currency,
      installmentNumber: installments.number,
      installments: installments.total,
      period,
      confidence,
      warnings: rowWarnings,
      include: true,
    })
  }

  const highConfidence = rows.filter((row) => row.confidence === 'high').length
  const ratio = rows.length === 0 ? 0 : highConfidence / rows.length
  let reliability: ParsedStatement['meta']['reliability'] = 'baja'
  if (rows.length >= 3 && ratio >= 0.6 && closingDate && dueDate) reliability = 'alta'
  else if (rows.length >= 1 && ratio >= 0.3) reliability = 'media'

  if (rows.length === 0) {
    warnings.push(
      'No se detectaron consumos. El PDF puede ser una imagen escaneada o un formato no contemplado: usá la carga manual.',
    )
  }
  if (reliability === 'baja') {
    warnings.push('La extracción es poco confiable: revisá cada fila y corregí lo que falte.')
  }
  if (!options.card) {
    warnings.push('Sin tarjeta asociada no se puede calcular el período del resumen.')
  } else if (!closingDate && !dueDate) {
    warnings.push('Sin fechas de cierre/vencimiento se usan las de la tarjeta configurada.')
  }

  return {
    rows,
    meta: {
      closingDate: closingDate ?? (options.card ? null : null),
      dueDate: dueDate ?? (options.card ? statementDueDate(monthKeyOf(options.today), options.card.dueDay) : null),
      totalAmountCents,
      currency: fallbackCurrency,
      reliability,
      warnings: [...new Set(warnings)],
      linesScanned: rawLines.length,
      linesSkipped,
    },
  }
}
