import { parseAmountInput } from '@/lib/money'
import type { ISODate } from '@/lib/period'

export type ParsedTransfer = {
  amountCents: number | null
  currency: 'UYU' | 'USD' | null
  destinationAccount: string | null
  destinationBank: string | null
  originLast4: string | null
  recipient: string | null
  date: ISODate | null
  dateFromEmail: boolean
}

/**
 * Asunto del aviso de transferencia de Itaú.
 * Se acepta texto extra alrededor (el banco a veces agrega sufijos), igual que
 * con los avisos de consumo.
 */
export function isTransferSubject(subject: string): boolean {
  return /aviso\s+(?:de\s+)?transferencia\s+realizada/i.test(subject)
}

/** Solo extrae datos explícitos de los avisos de Itaú. */
export function parseTransferEmail(text: string, receivedAt: ISODate | null): ParsedTransfer {
  const amountMatch = /\bimporte\s*:\s*([\d.,]+)\s*(US\.D|URGP|USD|UYU)\b/i.exec(text)
  const amount = amountMatch ? parseAmountInput(amountMatch[1]) : null
  const currencyCode = amountMatch?.[2].toUpperCase()
  const destination = /\bcuenta\s+destino\s*:\s*([\d -]+\d|\d)/i.exec(text)?.[1]
  const bank = /\bbanco\s*\/?\s*instituci[oó]n\s+destino\s*:\s*([^\r\n]{2,60})/i.exec(text)?.[1]
  const origin = /\bdesde\s+la\s+cuenta\s+\*+\s*(\d{4})\b/i.exec(text)?.[1]

  return {
    amountCents: amount !== null && amount > 0 ? amount : null,
    currency: currencyCode === 'US.D' || currencyCode === 'USD' ? 'USD'
      : currencyCode === 'URGP' || currencyCode === 'UYU' ? 'UYU' : null,
    destinationAccount: destination?.replace(/[ -]/g, '') ?? null,
    destinationBank: bank ? bank.trim().replace(/\s{2,}/g, ' ').replace(/[.,;:]$/, '') : null,
    originLast4: origin ?? null,
    recipient: null,
    date: receivedAt,
    dateFromEmail: receivedAt !== null,
  }
}
