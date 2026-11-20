/**
 * Convierte un aviso de transferencia en los datos de un gasto a revisar.
 *
 * Reglas de diseño:
 *  - El dato del correo manda: si no se entiende el importe o la moneda, no se
 *    inventa nada y el correo queda para revisión manual.
 *  - Si la transferencia viene en dólares, se registra en pesos con la
 *    cotización configurada por el usuario (`User.usdRateCents`), porque el
 *    peso es la moneda con la que se lleva el registro. El importe original
 *    queda anotado en las notas ("Origen en US$ ...") para no perder trazabilidad.
 */

import { convertUsdToUyu, formatMoney, formatRate, fromCents, type CurrencyCode } from '@/lib/money'
import type { ISODate } from '@/lib/period'
import type { ParsedTransfer } from '@/lib/gmail/transfer-parser'

export type TransferExpenseDraft = {
  merchant: string
  amountCents: number
  currency: CurrencyCode
  notes: string | null
  /** El importe se convirtió desde otra moneda: el valor en pesos es aproximado. */
  converted: boolean
  purchaseDate: ISODate | null
}

export type TransferExpenseResult = {
  draft: TransferExpenseDraft | null
  /** Motivo para mostrar en revision cuando no se puede armar el gasto. */
  reason: string | null
}

/** Nombre visible del movimiento, con el destino cuando el correo lo trae. */
export function transferMerchantName(parsed: ParsedTransfer): string {
  if (parsed.destinationBank) return `Transferencia a ${parsed.destinationBank}`
  if (parsed.destinationAccount) return `Transferencia a cuenta ${parsed.destinationAccount}`
  return 'Transferencia realizada'
}

export function buildTransferExpense(input: {
  parsed: ParsedTransfer
  usdRateCents: number
}): TransferExpenseResult {
  const { parsed, usdRateCents } = input

  if (parsed.amountCents === null || parsed.currency === null) {
    return {
      draft: null,
      reason:
        'No se pudo leer el importe o la moneda del aviso de transferencia. Revisá el correo y cargá el gasto a mano.',
    }
  }

  const merchant = transferMerchantName(parsed)

  if (parsed.currency === 'UYU') {
    return {
      draft: {
        merchant,
        amountCents: parsed.amountCents,
        currency: 'UYU',
        notes: null,
        converted: false,
        purchaseDate: parsed.date,
      },
      reason: null,
    }
  }

  const convertedCents = convertUsdToUyu(parsed.amountCents, usdRateCents)
  if (convertedCents <= 0) {
    // Sin cotización válida no se convierte: se deja el importe en dólares.
    return {
      draft: {
        merchant,
        amountCents: parsed.amountCents,
        currency: 'USD',
        notes: null,
        converted: false,
        purchaseDate: parsed.date,
      },
      reason: 'No hay cotización configurada: la transferencia quedó registrada en dólares.',
    }
  }

  return {
    draft: {
      merchant,
      amountCents: convertedCents,
      currency: 'UYU',
      notes: `Origen en ${formatMoney(parsed.amountCents, 'USD', { decimals: true })} · cotización $U ${formatRate(usdRateCents)}`,
      converted: true,
      purchaseDate: parsed.date,
    },
    reason: null,
  }
}

/** Importe del aviso tal como viene en el correo, para guardarlo en el mensaje. */
export function transferOriginalAmount(parsed: ParsedTransfer): string | null {
  return parsed.amountCents === null ? null : fromCents(parsed.amountCents)
}
