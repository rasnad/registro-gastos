import type { MobileSnapshot } from '../../../src/lib/mobile/contracts'
import { decimal } from '../components/ui'

export type Field = { key: string; label: string; kind?: 'money' | 'number' | 'date'; options?: { label: string; value: string }[] }
const choices = (items: [string, string][]) => items.map(([value, label]) => ({ value, label }))
const currencies = choices([['UYU', 'Pesos uruguayos'], ['USD', 'Dólares']])
export function formConfig(command: string, data: MobileSnapshot): { title: string; fields: Field[]; defaults: Record<string,string> } {
  const accountOptions = [{ value: '', label: 'Sin cuenta asociada' }, ...data.options.accounts.map(a => ({ value: a.id, label: `${a.name} · ${a.currency}` }))]
  const cards = data.options.cards.map(c => ({ value: c.id, label: c.name }))
  const categories = [{ value: '', label: 'Sin categoría' }, ...data.options.categories.filter(c => c.isActive).map(c => ({ value: c.id, label: c.name }))]
  const account = { key: 'accountId', label: 'Cuenta de origen', options: accountOptions }
  const currency = { key: 'currency', label: 'Moneda', options: currencies }
  const defaults: Record<string,string> = { currency: 'UYU', date: data.today, paidAt: data.today, startDate: data.today, openingDate: data.today, period: data.period, installments: '1', source: 'ACCOUNT', paymentSource: 'ACCOUNT', amountType: 'FIXED', frequency: 'MONTHLY', sharePercent: '100', isActive: 'on', debitAccount: 'true', priority: '3', kind: 'BANK', accountId: data.options.accounts.find(a => a.isDefault)?.id ?? '', creditCardId: cards[0]?.value ?? '', dueDay: '10', closingDay: '5', rate: decimal(data.user.usdRateCents) }
  if (/Expense$/.test(command) && command !== 'deleteExpense') return { title: command === 'createExpense' ? 'Nuevo movimiento' : 'Editar movimiento', defaults, fields: [
    { key: 'merchant', label: 'Comercio o descripción' }, { key: 'amount', label: 'Importe', kind: 'money' }, currency,
    { key: 'date', label: 'Fecha', kind: 'date' }, { key: 'source', label: 'Medio de pago', options: choices([['ACCOUNT','Cuenta / efectivo'],['CREDIT_CARD','Tarjeta de crédito']]) }, account,
    { key: 'creditCardId', label: 'Tarjeta', options: cards }, { key: 'installments', label: 'Cantidad de cuotas', kind: 'number' },
    { key: 'categoryId', label: 'Categoría', options: categories }, { key: 'saveRule', label: 'Recordar categoría para este comercio', options: choices([['','No'],['on','Sí']]) }, { key: 'notes', label: 'Notas' },
  ] }
  if (command === 'saveObligationPayment' || command === 'editLegacyCardPayment') return { title: 'Pago de obligación', defaults, fields: [
    { key: 'amount', label: 'Importe abonado (total, antes de tu porcentaje)', kind: 'money' }, { key: 'paidAt', label: 'Fecha del pago', kind: 'date' }, account,
    ...(command === 'saveObligationPayment' ? [{ key: 'debitAccount', label: 'Efecto en la cuenta', options: choices([['true','Descontar este pago'],['false','Ya incluido en el saldo conciliado']]) }] : []),
    { key: 'note', label: 'Nota' },
  ] }
  if (command === 'setBillActualAmount') return { title: 'Importe real del mes', defaults, fields: [{ key: 'amountActual', label: 'Importe total de la factura, antes de tu porcentaje', kind: 'money' }] }
  if (/CreditCard$/.test(command)) return { title: 'Tarjeta', defaults, fields: [{ key: 'name', label: 'Nombre' }, { key: 'last4', label: 'Últimos cuatro dígitos', kind: 'number' }, { key: 'closingDay', label: 'Día de cierre', kind: 'number' }, { key: 'dueDay', label: 'Día de vencimiento', kind: 'number' }] }
  if (/Bill$/.test(command)) return { title: 'Cuenta fija', defaults, fields: [
    { key: 'name', label: 'Nombre' }, currency, { key: 'amountType', label: 'Importe', options: choices([['FIXED','Fijo'],['RANGE','Variable']]) },
    { key: 'amountFixed', label: 'Importe total', kind: 'money' }, { key: 'amountMin', label: 'Mínimo estimado', kind: 'money' }, { key: 'amountMax', label: 'Máximo estimado', kind: 'money' },
    { key: 'sharePercent', label: 'Tu porcentaje (%)', kind: 'number' }, { key: 'dueDay', label: 'Día de vencimiento', kind: 'number' },
    { key: 'frequency', label: 'Frecuencia', options: choices([['MONTHLY','Mensual'],['BIMONTHLY','Bimestral'],['QUARTERLY','Trimestral'],['SEMIANNUAL','Semestral'],['ANNUAL','Anual']]) },
    { key: 'startDate', label: 'Desde', kind: 'date' }, { key: 'paymentSource', label: 'Medio de pago', options: choices([['ACCOUNT','Cuenta bancaria'],['CREDIT_CARD','Tarjeta']]) }, account, { key: 'creditCardId', label: 'Tarjeta', options: cards }, { key: 'categoryId', label: 'Categoría', options: categories },
  ] }
  if (command === 'updateIncome') return { title: 'Editar ingreso', defaults, fields: [{ key: 'description', label: 'Descripción' }, { key: 'amount', label: 'Importe (en la moneda original)', kind: 'money' }, { key: 'startDate', label: 'Fecha inicial', kind: 'date' }, { key: 'isActive', label: 'Estado', options: choices([['on','Activo'],['','Inactivo']]) }] }
  if (command === 'createIncome') return { title: 'Ingreso', defaults: { ...defaults, kind: 'FIXED' }, fields: [{ key: 'description', label: 'Descripción' }, { key: 'amount', label: 'Importe', kind: 'money' }, currency, account, { key: 'startDate', label: 'Fecha inicial', kind: 'date' }, { key: 'kind', label: 'Tipo', options: choices([['FIXED','Fijo'],['VARIABLE','Variable']]) }, { key: 'recurrence', label: 'Frecuencia', options: choices([['','Una vez'],['MONTHLY','Mensual'],['BIMONTHLY','Bimestral'],['QUARTERLY','Trimestral'],['SEMIANNUAL','Semestral'],['ANNUAL','Anual']]) }] }
  if (/Goal$/.test(command)) return { title: 'Objetivo de ahorro', defaults, fields: [{ key: 'name', label: 'Nombre' }, currency, { key: 'targetAmount', label: 'Meta', kind: 'money' }, { key: 'targetDate', label: 'Fecha objetivo', kind: 'date' }, { key: 'monthlyTarget', label: 'Ahorro programado por mes', kind: 'money' }, { key: 'priority', label: 'Prioridad (1 a 5)', kind: 'number' }] }
  if (command === 'addContribution') return { title: 'Aporte', defaults, fields: [{ key: 'amount', label: 'Importe', kind: 'money' }, { key: 'date', label: 'Fecha', kind: 'date' }, account, { key: 'note', label: 'Nota' }] }
  if (/Account$/.test(command)) return { title: 'Cuenta bancaria / efectivo', defaults, fields: [{ key: 'name', label: 'Nombre' }, currency, { key: 'kind', label: 'Tipo', options: choices([['BANK','Banco'],['CASH','Efectivo'],['WALLET','Billetera']]) }, { key: 'openingBalance', label: 'Saldo inicial', kind: 'money' }, { key: 'openingDate', label: 'Fecha del saldo', kind: 'date' }] }
  if (command === 'updateUsdRate') return { title: 'Cotización del dólar', defaults, fields: [{ key: 'rate', label: 'Pesos uruguayos por dólar', kind: 'money' }] }
  if (command === 'createCategory' || command === 'updateCategory') return { title: 'Categoría', defaults, fields: [{ key: 'name', label: 'Nombre' }, { key: 'icon', label: 'Icono' }, { key: 'color', label: 'Color' }] }
  return { title: 'Operación no disponible', defaults, fields: [] }
}
