import { parseAmountInput } from '@/lib/money'
import type { ISODate } from '@/lib/period'

export type ParsedTransfer = {
  amountCents: number | null
  currency: 'UYU' | 'USD' | null
  destinationAccount: string | null
  originLast4: string | null
  recipient: string | null
  date: ISODate | null
  dateFromEmail: boolean
}

export function isTransferSubject(subject: string): boolean {
  return /^aviso (?:de )?transferencia realizada$/i.test(subject.trim())
}

/** Solo extrae datos explícitos de los avisos de Itaú. */
export function parseTransferEmail(text: string, receivedAt: ISODate | null): ParsedTransfer {
  const amountMatch = /\bimporte\s*:\s*([\d.,]+)\s*(US\.D|URGP|USD|UYU)\b/i.exec(text)
  const amount = amountMatch ? parseAmountInput(amountMatch[1]) : null
  const currencyCode = amountMatch?.[2].toUpperCase()
  const destination = /\bcuenta\s+destino\s*:\s*([\d -]+\d|\d)/i.exec(text)?.[1]
  const origin = /\bdesde\s+la\s+cuenta\s+\*+\s*(\d{4})\b/i.exec(text)?.[1]

  return {
    amountCents: amount !== null && amount > 0 ? amount : null,
    currency: currencyCode === 'US.D' || currencyCode === 'USD' ? 'USD'
      : currencyCode === 'URGP' || currencyCode === 'UYU' ? 'UYU' : null,
    destinationAccount: destination?.replace(/[ -]/g, '') ?? null,
    originLast4: origin ?? null,
    recipient: null,
    date: receivedAt,
    dateFromEmail: receivedAt !== null,
  }
}
