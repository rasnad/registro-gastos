'use server'
import 'server-only'
import { prisma } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { revalidateFinance } from '@/lib/revalidate'
import { convertUsdToUyu, fromCents } from '@/lib/money'
import { applyShare } from '@/lib/finance/engine'
import { cents, currency, dateValue, isoDate, monthKey, optStr, str } from '@/lib/validation'
import type { ActionState } from '@/lib/action-state'

/** Crea o corrige un pago independiente; nunca modifica cuotas u obligaciones. */
export async function saveObligationPayment(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser()
  const id = optStr(form, 'id')
  const kind = str(form, 'obligationKind')
  const obligationId = str(form, 'obligationId')
  const period = monthKey(form, 'period')
  const payCurrency = currency(form, 'currency')
  const amount = cents(form, 'amount')
  const paidAt = isoDate(form, 'paidAt')
  const accountId = optStr(form, 'accountId')
  const debitAccount = str(form, 'debitAccount') !== 'false'
  if ((kind !== 'CARD' && kind !== 'BILL') || !period || !payCurrency || amount === null || amount <= 0 || !paidAt) return { error: 'Revisá el importe, la fecha y el período.' }
  if (amount > 99999999999999 || !Number.isSafeInteger(amount) || !Number.isFinite(dateValue(paidAt).getTime()) || dateValue(paidAt).toISOString().slice(0, 10) !== paidAt || Number(period.slice(5)) < 1 || Number(period.slice(5)) > 12) return { error: 'Revisá el importe, la fecha y el período.' }
  const existing = id ? await prisma.obligationPayment.findFirst({where:{id,userId:user.id}}) : null
  if (id && !existing) return { error: 'El pago no existe.' }
  if (existing && (existing.obligationKind !== kind || existing.obligationId !== obligationId || existing.period !== period || existing.currency !== payCurrency)) return { error: 'No se puede cambiar la obligación de un pago existente.' }
  let debitCents = amount
  if (kind === 'CARD') {
    if (!(await prisma.creditCard.findFirst({where:{id:obligationId,userId:user.id}}))) return {error:'La tarjeta no existe.'}
  } else {
    const bill = await prisma.recurringBill.findFirst({where:{id:obligationId,userId:user.id}})
    if (!bill || bill.currency !== payCurrency || bill.paymentSource !== 'ACCOUNT') return {error:'La cuenta fija no es válida.'}
    debitCents = applyShare(amount, bill.sharePercent)
  }
  let accountAmount: string | null = null
  if (accountId) {
    const account = await prisma.account.findFirst({where:{id:accountId,userId:user.id}})
    if (!account) return {error:'La cuenta no existe.'}
    if (account.currency === payCurrency) accountAmount = fromCents(debitCents)
    else if (payCurrency === 'USD' && account.currency === 'UYU') accountAmount = fromCents(convertUsdToUyu(debitCents,user.usdRateCents))
    else return {error:'La moneda de la cuenta no permite este pago.'}
  }
  // Una corrección de nota o fecha conserva el débito histórico y su cotización.
  if (existing && existing.accountId === accountId && String(existing.amount) === String(Number(fromCents(amount)))) {
    accountAmount = existing.accountAmount?.toString() ?? null
  }
  const data = { userId:user.id, obligationKind:kind, obligationId, period, currency:payCurrency, amount:fromCents(amount), paidAt:dateValue(paidAt), accountId, accountAmount, debitAccount, note:optStr(form,'note') }
  if (id) await prisma.obligationPayment.updateMany({where:{id,userId:user.id},data})
  else await prisma.obligationPayment.create({data})
  revalidateFinance()
  return {ok:true}
}

export async function deleteObligationPayment(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser()
  const id = str(form,'id')
  const result = await prisma.obligationPayment.deleteMany({where:{id,userId:user.id}})
  if (!result.count) return {error:'El pago no existe.'}
  revalidateFinance()
  return {ok:true}
}
