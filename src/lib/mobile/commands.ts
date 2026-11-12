import 'server-only'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import type { CurrentUser } from '@/lib/auth'
import type { ActionState } from '@/lib/action-state'
import * as expenses from '@/lib/services/expenses'
import * as payments from '@/lib/services/obligation-payments'
import * as bills from '@/lib/services/bills'
import * as accounts from '@/lib/services/accounts'
import * as cards from '@/lib/services/cards'
import * as goals from '@/lib/services/goals'
import * as settings from '@/lib/services/settings'
import * as categories from '@/lib/services/categories'
import * as gmail from '@/lib/services/gmail'
import { ApiError } from './http'
import { parseAmountInput } from '@/lib/money'

// Lista explícita. No se publica registrar pagos legacy ni restablecer saldos.
const commands = {
  createExpense: expenses.createExpense, updateExpense: expenses.updateExpense,
  deleteExpense: expenses.deleteExpense, setExpenseStatus: expenses.setExpenseStatus,
  updateInstallment: expenses.updateInstallment, rememberMerchantRule: expenses.rememberMerchantRule,
  saveObligationPayment: payments.saveObligationPayment, deleteObligationPayment: payments.deleteObligationPayment,
  createBill: bills.createBill, updateBill: bills.updateBill, deleteBill: bills.deleteBill,
  setBillActualAmount: bills.setBillActualAmount, deleteLegacyBillPayment: bills.deleteLegacyBillPayment,
  editLegacyCardPayment: cards.editLegacyCardPayment, deleteCardPayment: cards.deleteCardPayment,
  createCreditCard: accounts.createCreditCard, updateCreditCard: accounts.updateCreditCard,
  createAccount: accounts.createAccount, updateAccount: accounts.updateAccount,
  toggleDefaultAccount: accounts.toggleDefaultAccount,
  createIncome: accounts.createIncome, updateIncome: accounts.updateIncome, deleteIncome: accounts.deleteIncome,
  createAdjustment: accounts.createAdjustment, deleteAdjustment: accounts.deleteAdjustment,
  createGoal: goals.createGoal, updateGoal: goals.updateGoal, deleteGoal: goals.deleteGoal,
  addContribution: goals.addContribution, deleteContribution: goals.deleteContribution,
  updateUsdRate: settings.updateUsdRate,
  createCategory: categories.createCategory, updateCategory: categories.updateCategory,
  deactivateCategory: categories.deactivateCategory, restoreCategory: categories.restoreCategory,
  updateGmailSettings: gmail.updateGmailSettings, syncGmailNow: gmail.syncGmailNow,
  disconnectGmail: gmail.disconnectGmail, dismissGmailMessage: gmail.dismissGmailMessage,
  resolveGmailMessage: gmail.resolveGmailMessage,
} satisfies Record<string, (user: CurrentUser, form: FormData) => Promise<ActionState>>

export const commandSchema = z.object({
  command: z.enum(Object.keys(commands) as [keyof typeof commands, ...(keyof typeof commands)[]]),
  fields: z.record(z.string().max(60), z.string().max(4000)).refine(fields => Object.keys(fields).length <= 40),
}).strict()

export function validateMobileFields(fields: Record<string, string>) {
  for (const key of ['date', 'paidAt', 'startDate', 'endDate', 'openingDate', 'targetDate']) {
    const value = fields[key]
    if (!value) continue
    const date = new Date(`${value}T00:00:00Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new ApiError(400, 'INVALID_DATE', 'Revisá las fechas.')
  }
  if (fields.period && !/^\d{4}-(0[1-9]|1[0-2])$/.test(fields.period)) throw new ApiError(400, 'INVALID_PERIOD', 'Revisá el período.')
  for (const key of ['amount','amountActual','amountFixed','amountMin','amountMax','targetAmount','monthlyTarget','initialAmount','openingBalance','amountDelta','rate']) {
    if (!fields[key]) continue
    const value = parseAmountInput(fields[key])
    if (value === null || !Number.isSafeInteger(value) || Math.abs(value) > 99999999999999) throw new ApiError(400, 'INVALID_AMOUNT', 'Revisá los importes.')
  }
}

export async function executeCommand(user: CurrentUser, key: string | null, input: unknown) {
  if (!key || !/^[a-zA-Z0-9_-]{16,100}$/.test(key)) throw new ApiError(400, 'IDEMPOTENCY_KEY', 'Falta el identificador de la operación.')
  const { command, fields } = commandSchema.parse(input)
  validateMobileFields(fields)
  if ('userId' in fields) throw new ApiError(400, 'INVALID_INPUT', 'El usuario se obtiene de la sesión.')
  const fingerprint = createHash('sha256').update(JSON.stringify([command, Object.entries(fields).sort(([a], [b]) => a.localeCompare(b))])).digest('hex')
  const where = { userId_key: { userId: user.id, key } }
  try {
    await prisma.mobileRequest.create({ data: { userId: user.id, key, fingerprint } })
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'P2002')) throw error
    const existing = await prisma.mobileRequest.findUnique({ where })
    if (!existing || existing.fingerprint !== fingerprint) throw new ApiError(409, 'KEY_REUSED', 'Este identificador ya se usó para otra operación.')
    if (existing.result === null) throw new ApiError(409, 'IN_PROGRESS', 'La operación está en proceso o pendiente de verificación. Actualizá los datos antes de registrar otro pago.')
    return existing.result
  }
  const form = new FormData()
  Object.entries(fields).forEach(([field, value]) => form.set(field, value))
  // Si el proceso cae después de escribir, queda reservado: no se ejecuta de nuevo.
  const result = await commands[command](user, form)
  // Algunos servicios legacy devuelven errores de Prisma: no exponerlos en la API.
  const safeResult = result.error && /prisma|invocation|database|constraint|ECONN|\n/i.test(result.error)
    ? { error: 'No se pudo guardar. Actualizá los datos y verificá el resultado.' } : result
  await prisma.mobileRequest.update({ where, data: { result: safeResult } })
  return safeResult
}
