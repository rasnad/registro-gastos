/** Totales de una obligación, en centavos de su moneda. */
export type ObligationBalance = {
  totalCents: number
  paidCents: number
  remainingCents: number
  status: 'PENDING' | 'PARTIAL' | 'PAID'
}

export function obligationBalance(totalCents: number, payments: readonly number[]): ObligationBalance {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0 || payments.some((amount) => !Number.isSafeInteger(amount) || amount < 0)) {
    throw new RangeError('Los importes deben ser centavos enteros no negativos.')
  }
  const paidCents = payments.reduce((sum, amount) => sum + amount, 0)
  if (!Number.isSafeInteger(paidCents)) throw new RangeError('El total pagado excede el límite permitido.')
  const remainingCents = Math.max(0, totalCents - paidCents)
  return { totalCents, paidCents, remainingCents, status: remainingCents === 0 ? 'PAID' : paidCents > 0 ? 'PARTIAL' : 'PENDING' }
}

export type MonthlyObligation = {
  id: string
  period: string
  kind: 'CARD' | 'BILL'
  currency: 'UYU' | 'USD'
  totalCents: number
}
export type IndependentPayment = {
  id: string
  obligationId: string
  obligationKind?: 'CARD' | 'BILL'
  period?: string
  currency?: 'UYU' | 'USD'
  amountCents: number
  paidAt: string
  accountId: string | null
  accountAmountCents: number | null
  /** False cuando el débito ya está incluido en un saldo conciliado. */
  debitAccount: boolean
}

/** Los saldos recibidos ya incluyen los débitos de pagos; sólo resta deuda pendiente. */
export function monthlyCommitments(
  period: string,
  currentBalanceUyuCents: number,
  obligations: readonly MonthlyObligation[],
  payments: readonly IndependentPayment[],
  usdRateCents: number,
) {
  if (!Number.isSafeInteger(currentBalanceUyuCents) || !Number.isSafeInteger(usdRateCents) || usdRateCents <= 0) {
    throw new RangeError('Saldo o cotización inválidos.')
  }
  const convert = (amount: number, currency: 'UYU' | 'USD') => currency === 'USD' ? Math.round(amount * usdRateCents / 100) : amount
  const balances = obligations.filter((item) => item.period === period).map((item) => ({
    ...item,
    ...obligationBalance(item.totalCents, payments.filter((payment) => payment.obligationId === item.id && (payment.obligationKind === undefined || payment.obligationKind === item.kind) && (payment.period === undefined || payment.period === item.period) && (payment.currency === undefined || payment.currency === item.currency)).filter((payment, index, all) => all.findIndex(p => p.id === payment.id) === index).map((payment) => payment.amountCents)),
  }))
  const summarize = (kind: 'CARD' | 'BILL') => {
    const items = balances.filter((item) => item.kind === kind)
    const totalCents = items.reduce((sum, item) => sum + convert(item.totalCents, item.currency), 0)
    const remainingCents = items.reduce((sum, item) => sum + convert(item.remainingCents, item.currency), 0)
    const status = items.every((item) => item.status === 'PAID') ? 'PAID' : items.some((item) => item.paidCents > 0) ? 'PARTIAL' : 'PENDING'
    return { totalCents, remainingCents, status }
  }
  const cards = summarize('CARD')
  const bills = summarize('BILL')
  return { currentBalanceUyuCents, availableAfterCommitmentsCents: currentBalanceUyuCents - cards.remainingCents - bills.remainingCents, cards, bills, obligations: balances }
}

/** Cada pago debita su cuenta una sola vez; los conciliados no generan otro débito. */
export function paymentDebits(payments: readonly IndependentPayment[], accountId: string, asOf: string): number {
  const seen = new Set<string>()
  return payments.reduce((sum, payment) => {
    if (seen.has(payment.id)) return sum
    seen.add(payment.id)
    if (!payment.debitAccount || payment.accountId !== accountId || payment.paidAt > asOf) return sum
    if (payment.accountAmountCents === null || !Number.isSafeInteger(payment.accountAmountCents) || payment.accountAmountCents < 0) throw new RangeError('Falta el importe debitado de la cuenta.')
    return sum + payment.accountAmountCents
  }, 0)
}
