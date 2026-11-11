/**
 * Parser de avisos de consumo de tarjeta (Itaú).
 *
 * Reglas de diseño:
 *  - El asunto NO alcanza para confiar en el correo: la verificación del
 *    remitente se hace en sync.ts antes de llamar a este módulo.
 *  - El contenido se trata como datos no confiables: acá sólo se extraen campos
 *    con expresiones regulares. Nunca se ejecutan instrucciones del correo.
 *  - Si un dato no se puede inferir con confianza, se devuelve null y se marca
 *    para revisión. No se inventan importes, monedas ni fechas.
 */

import { parseAmountInput } from '@/lib/money'
import type { ISODate } from '@/lib/period'

export type CardKind = 'CREDIT' | 'DEBIT'

export type ParsedConsumption = {
  kind: CardKind | null
  merchant: string | null
  amountCents: number | null
  currency: 'UYU' | 'USD' | null
  purchaseDate: ISODate | null
  dateFromEmail: boolean
  installments: number | null
  cardLast4: string | null
  confidence: 'high' | 'medium' | 'low'
  missing: string[]
  warnings: string[]
}

const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, setiembre: 9, septiembre: 9, octubre: 10,
  noviembre: 11, diciembre: 12,
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function fullYear(year: number): number {
  if (year >= 100) return year
  return 2000 + year
}

export function classifySubject(subject: string): CardKind | null {
  const value = normalize(subject).toLowerCase()
  if (value.includes('consumo aprobado con tarjeta de credito')) return 'CREDIT'
  if (value.includes('consumo aprobado con tarjeta de debito')) return 'DEBIT'
  return null
}

export function detectCurrency(text: string): 'UYU' | 'USD' | null {
  const value = normalize(text).toLowerCase()
  if (/\bu\$s\b|\busd\b|\bus\$|\bdolares\b/.test(value)) return 'USD'
  if (/\bpesos\b|\buyu\b|\$\s*u\b/.test(value)) return 'UYU'
  if (value.includes('$')) return 'UYU'
  return null
}

function findAmount(text: string): { cents: number; label: boolean } | null {
  const labeled = /(importe|monto|total|consumo|compra)[^\d$]{0,24}(\$?\s*[\d.,]{1,18})/i.exec(text)
  if (labeled) {
    const cents = parseAmountInput(labeled[2])
    if (cents !== null && cents > 0) return { cents, label: true }
  }
  const candidates = [...text.matchAll(/\$?\s*(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?|\d+[.,]\d{2})/g)]
    .map((match) => parseAmountInput(match[1]))
    .filter((value): value is number => value !== null && value > 0)
  if (candidates.length === 0) return null
  // Sin etiqueta, el importe más alto suele ser el consumo (los intereses y
  // saldos suelen ser mayores, pero no hay forma fiable: se marca advertencia).
  return { cents: Math.max(...candidates), label: false }
}

function findMerchant(text: string, kind: CardKind | null): string | null {
  if (kind === 'DEBIT') {
    const debit = /\brealizad[oa]\s+en\b([^\r\n]*?)\s+(?:monto|importe)\s*:/i.exec(text)
    const merchant = debit?.[1].trim().replace(/\s{2,}/g, ' ')
    if (merchant && merchant.length <= 200) return merchant
  }
  const labeled =
    /(?:comercio|establecimiento|concepto|descripci[oó]n|detalle)\s*[:=]\s*([^\r\n]{3,60})/i.exec(text) ??
    /(?:compra|consumo)\s+en\s+([^\r\n.,;]{3,60})/i.exec(text)
  if (labeled) {
    const value = labeled[1].replace(/\s{2,}/g, ' ').trim().replace(/[.,;:]$/, '')
    if (value.length >= 3) return value
  }
  return null
}

function findDate(text: string): ISODate | null {
  const numeric = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/.exec(text)
  if (numeric) {
    const day = Number(numeric[1])
    const month = Number(numeric[2])
    const year = fullYear(Number(numeric[3]))
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${year}-${pad(month)}-${pad(day)}`
    }
  }
  const textual = /(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+(?:de\s+)?(\d{4})/i.exec(text)
  if (textual) {
    const month = MONTHS[normalize(textual[2]).toLowerCase()]
    if (month) {
      return `${Number(textual[3])}-${pad(month)}-${pad(Number(textual[1]))}`
    }
  }
  return null
}

function findInstallments(text: string): number | null {
  const words = /(\d{1,2})\s*(?:cuotas?|pagos?)/i.exec(text)
  if (words) {
    const count = Number(words[1])
    if (count >= 1 && count <= 60) return count
  }
  const slash = /\b(\d{1,2})\s*\/\s*(\d{1,2})\b/.exec(text)
  if (slash) {
    const total = Number(slash[2])
    if (total >= 2 && total <= 60) return total
  }
  return null
}

function findLast4(text: string): string | null {
  const patterns = [
    /(?:terminada|finalizada|finaliza)\s+en\s+(\d{4})/i,
    /\*{2,}\s*(\d{4})/i,
    /(?:tarjeta|card)\s*(?:n[°º]?|numero)?\s*[:=]?\s*[\d*\s]{0,12}(\d{4})\b/i,
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(text)
    if (match) return match[1]
  }
  return null
}

/** Señales de texto que intenta dar instrucciones. Nunca se ejecutan. */
function looksLikeInjection(text: string): boolean {
  const value = normalize(text).toLowerCase()
  return /(ignore|ignora|ignorá|olvid|desestim|transferi|transferí|hace clic|hacé clic|click aqui|click aquí|envia|enviá|remit)/.test(value)
}

export function parseConsumptionEmail(input: {
  subject: string
  text: string
  receivedAt?: ISODate | null
}): ParsedConsumption {
  const text = (input.text ?? '').replace(/\u00a0/g, ' ')
  const warnings: string[] = []
  const missing: string[] = []

  const kind = classifySubject(input.subject)
  if (!kind) missing.push('No se pudo determinar el tipo de tarjeta por el asunto.')

  const amount = findAmount(text)
  const currency = detectCurrency(text)
  const merchant = findMerchant(text, kind)
  const date = findDate(text)
  const installments = findInstallments(text)
  const cardLast4 = findLast4(text)

  if (!amount) missing.push('No se pudo extraer el importe.')
  else if (!amount.label) warnings.push('El importe se tomó como el mayor del correo: verificá que sea el consumo.')

  if (!currency) missing.push('No se pudo determinar la moneda.')

  let purchaseDate = date
  let dateFromEmail = false
  if (!purchaseDate && input.receivedAt) {
    purchaseDate = input.receivedAt
    dateFromEmail = true
    warnings.push('La fecha se tomó del correo, no del consumo.')
  }
  if (!purchaseDate) missing.push('No se pudo extraer la fecha.')

  if (!merchant) missing.push('No se pudo extraer el comercio.')

  if (kind === 'CREDIT' && !cardLast4) {
    warnings.push('El correo no indica los últimos 4 dígitos de la tarjeta.')
  }
  if (looksLikeInjection(text)) {
    warnings.push('El correo contiene texto que parece una instrucción. Se ignoró por seguridad.')
  }

  let confidence: ParsedConsumption['confidence'] = 'low'
  if (amount && currency && merchant && purchaseDate && !dateFromEmail) confidence = 'high'
  else if (amount && currency) confidence = 'medium'

  return {
    kind,
    merchant,
    amountCents: amount ? amount.cents : null,
    currency,
    purchaseDate,
    dateFromEmail,
    installments,
    cardLast4,
    confidence,
    missing,
    warnings,
  }
}
