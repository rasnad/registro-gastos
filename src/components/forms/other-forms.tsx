'use client'

import { useActionState, useState } from 'react'
import { ActionForm } from '@/components/action-form'
import { registerCardPayment } from '@/app/actions/cards'
import { updateInstallment } from '@/app/actions/expenses'
import { createCreditCard, updateCreditCard } from '@/app/actions/accounts'
import { createBill, payBillOccurrence, setBillActualAmount, updateBill } from '@/app/actions/bills'
import { createGoal, addContribution, updateGoal } from '@/app/actions/goals'
import { createCategory, updateCategory } from '@/app/actions/categories'
import { CURRENCIES, convertUsdToUyu, formatRate, parseAmountInput, type CurrencyCode } from '@/lib/money'
import type { ActionState } from '@/lib/action-state'
import type { AccountOption, CardOption, CategoryOption } from '@/components/forms/money-forms'

export function MiniForm({
  action,
  hidden,
  label,
  className = 'ghost-button small-button',
  confirmMessage,
  icon,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>
  hidden: Record<string, string | number | boolean | null | undefined>
  label: string
  className?: string
  confirmMessage?: string
  icon?: React.ReactNode
}) {
  const [state, formAction, pending] = useActionState(action, {})
  return (
    <form
      action={formAction}
      style={{ display: 'inline' }}
      onSubmit={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) event.preventDefault()
      }}
    >
      {Object.entries(hidden).map(([key, value]) =>
        value === null || value === undefined ? null : (
          <input key={key} type="hidden" name={key} value={String(value)} />
        ),
      )}
      <button type="submit" className={className} disabled={pending} title={label}>
        {icon}
        {pending ? '…' : label}
      </button>
      {state?.error ? <span className="error-text"> {state.error}</span> : null}
    </form>
  )
}

export function CardForm({
  defaults,
}: {
  defaults?: {
    id: string
    name: string
    last4: string | null
    closingDay: number
    dueDay: number
    notes: string | null
    isActive: boolean
  }
}) {
  return (
    <ActionForm action={defaults ? updateCreditCard : createCreditCard} submitLabel={defaults ? 'Guardar cambios' : 'Agregar tarjeta'}>
      {defaults ? <input type="hidden" name="id" value={defaults.id} /> : null}
      <label className="field">
        <span>Nombre o referencia</span>
        <input className="input" name="name" required defaultValue={defaults?.name} placeholder="Ej. Itaú Visa" />
      </label>
      <label className="field">
        <span>Últimos 4 dígitos (opcional)</span>
        <input className="input" name="last4" maxLength={4} defaultValue={defaults?.last4 ?? ''} placeholder="1842" />
        <span className="hint">
          La tarjeta puede tener consumos en pesos y en dólares; no se elige una moneda por tarjeta.
        </span>
      </label>
      <div className="field-grid">
        <label className="field">
          <span>Día de cierre</span>
          <input className="input" type="number" name="closingDay" min={1} max={31} required defaultValue={defaults?.closingDay ?? 18} />
        </label>
        <label className="field">
          <span>Día de vencimiento</span>
          <input className="input" type="number" name="dueDay" min={1} max={31} required defaultValue={defaults?.dueDay ?? 24} />
        </label>
      </div>
      <p className="hint" style={{ marginTop: -4 }}>
        Con estos días se calcula en qué resumen cae cada compra. Si el banco aplica otra fecha, corregila
        en Tarjetas sobre la compra puntual.
      </p>
      <label className="field">
        <span>Notas (opcional)</span>
        <textarea className="textarea" name="notes" defaultValue={defaults?.notes ?? ''} />
      </label>
      {defaults ? (
        <label className="checkbox">
          <input type="checkbox" name="isActive" defaultChecked={defaults.isActive} />
          <span>Tarjeta activa</span>
        </label>
      ) : null}
    </ActionForm>
  )
}

export function CardPaymentForm({
  cards,
  accounts,
  defaultCardId,
  defaultPeriod,
  defaultAmount,
  defaultCurrency,
  usdRateCents,
}: {
  cards: CardOption[]
  accounts: AccountOption[]
  defaultCardId?: string
  defaultPeriod: string
  defaultAmount?: string
  defaultCurrency?: CurrencyCode
  usdRateCents: number
}) {
  const [cardId, setCardId] = useState(defaultCardId ?? cards[0]?.id ?? '')
  const [payCurrency, setPayCurrency] = useState<CurrencyCode>(defaultCurrency ?? 'UYU')
  const [amountText, setAmountText] = useState(defaultAmount ?? '')
  const defaultPayableAccount = (cur: CurrencyCode) =>
    accounts.find(
      (account) => account.isDefault && (account.currency === cur || (cur === 'USD' && account.currency === 'UYU')),
    )?.id ?? ''
  const [accountId, setAccountId] = useState(
    defaultPayableAccount(defaultCurrency ?? 'UYU'),
  )
  function changePayCurrency(next: CurrencyCode) {
    setPayCurrency(next)
    const current = accounts.find((account) => account.id === accountId)
    const payable =
      current && (current.currency === next || (next === 'USD' && current.currency === 'UYU'))
    if (!payable) setAccountId(defaultPayableAccount(next))
  }

  const amountCents = parseAmountInput(amountText) ?? 0
  const selectedAccount = accounts.find((item) => item.id === accountId)
  const needsConversion = payCurrency === 'USD' && selectedAccount?.currency === 'UYU'
  const equivalentCents = convertUsdToUyu(amountCents, usdRateCents)
  const payableAccounts = accounts.filter(
    (account) => account.currency === payCurrency || (payCurrency === 'USD' && account.currency === 'UYU'),
  )
  return (
    <ActionForm action={registerCardPayment} submitLabel="Registrar pago">
      <div className="field-grid">
        <label className="field">
          <span>Tarjeta</span>
          <select className="select" name="creditCardId" value={cardId} onChange={(event) => setCardId(event.target.value)} required>
            {cards.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Resumen (AAAA-MM)</span>
          <input className="input" name="period" required defaultValue={defaultPeriod} placeholder="2025-06" pattern="\d{4}-\d{2}" />
        </label>
      </div>
      <div className="field-grid">
        <label className="field">
          <span>Importe pagado</span>
          <input
            className="input"
            name="amount"
            inputMode="decimal"
            required
            value={amountText}
            onChange={(event) => setAmountText(event.target.value)}
            placeholder="0,00"
          />
        </label>
        <label className="field">
          <span>Moneda</span>
          <select
            className="select"
            name="currency"
            value={payCurrency}
            onChange={(event) => changePayCurrency(event.target.value as CurrencyCode)}
          >
            <option value="UYU">Pesos (UYU)</option>
            <option value="USD">Dólares (USD)</option>
          </select>
        </label>
      </div>
      <label className="field">
        <span>Fecha de pago</span>
        <input className="input" type="date" name="paidAt" required defaultValue={new Date().toISOString().slice(0, 10)} />
      </label>
      <label className="field">
        <span>Cuenta desde la que pagaste</span>
        <select
          className="select"
          name="accountId"
          value={accountId}
          onChange={(event) => setAccountId(event.target.value)}
        >
          <option value="">Fuera de las cuentas registradas</option>
          {payableAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name} · {account.currency}
              {payCurrency === 'USD' && account.currency === 'UYU' ? ' (se debita en pesos)' : ''}
            </option>
          ))}
        </select>
        <span className="hint">El pago descuenta esa cuenta una sola vez y salda las cuotas del período.</span>
        {payCurrency === 'USD' && amountCents > 0 ? (
          <span className="hint">
            Equivalente en pesos: {formatRate(usdRateCents)} por dólar →{' '}
            <strong>
              $U{' '}
              {new Intl.NumberFormat('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
                equivalentCents / 100,
              )}
            </strong>
            {needsConversion ? ' (se debita ese importe de la cuenta en pesos).' : ' (referencia).'}
          </span>
        ) : null}
      </label>
      <label className="field">
        <span>Nota (opcional)</span>
        <input className="input" name="note" placeholder="Ej. incluye sellos" />
      </label>
    </ActionForm>
  )
}

export function InstallmentForm({
  installment,
}: {
  installment: { id: string; number: number; count: number; amount: string; period: string; isPaid: boolean; dueDate: string | null }
}) {
  return (
    <ActionForm action={updateInstallment} submitLabel="Guardar cuota">
      <input type="hidden" name="id" value={installment.id} />
      <div className="field-grid">
        <label className="field">
          <span>Importe</span>
          <input className="input" name="amount" inputMode="decimal" required defaultValue={installment.amount} />
        </label>
        <label className="field">
          <span>Resumen (AAAA-MM)</span>
          <input className="input" name="period" required defaultValue={installment.period} pattern="\d{4}-\d{2}" />
        </label>
      </div>
      <div className="field-grid">
        <label className="checkbox">
          <input type="checkbox" name="isPaid" defaultChecked={installment.isPaid} />
          <span>Cuota pagada</span>
        </label>
        <label className="field">
          <span>Fecha de pago</span>
          <input className="input" type="date" name="paidAt" defaultValue={installment.dueDate ?? ''} />
        </label>
      </div>
      <p className="hint">Corregí acá si el banco aplicó un importe o un resumen diferente al estimado.</p>
    </ActionForm>
  )
}

export function BillForm({
  accounts,
  cards,
  categories,
  today,
  defaults,
}: {
  accounts: AccountOption[]
  cards: CardOption[]
  categories: CategoryOption[]
  today: string
  defaults?: {
    id: string
    name: string
    categoryId: string | null
    amountType: 'FIXED' | 'RANGE'
    amountFixed: string | null
    amountMin: string | null
    amountMax: string | null
    sharePercent: number
    currency: CurrencyCode
    frequency: string
    dueDay: number
    paymentSource: 'ACCOUNT' | 'CREDIT_CARD'
    accountId: string | null
    creditCardId: string | null
    startDate: string
    endDate: string | null
    isActive: boolean
    notes: string | null
  }
}) {
  const [amountType, setAmountType] = useState<'FIXED' | 'RANGE'>(defaults?.amountType ?? 'FIXED')
  const [frequency, setFrequency] = useState(defaults?.frequency ?? 'MONTHLY')
  const [startMonth, setStartMonth] = useState((defaults?.startDate ?? today).slice(0, 7))
  const [endMonth, setEndMonth] = useState(defaults?.endDate ? defaults.endDate.slice(0, 7) : '')
  const [currency, setCurrency] = useState<CurrencyCode>(defaults?.currency ?? 'UYU')
  const [paymentSource, setPaymentSource] = useState<'ACCOUNT' | 'CREDIT_CARD'>(defaults?.paymentSource ?? 'ACCOUNT')
  const defaultAccountFor = (cur: CurrencyCode) =>
    accounts.find((account) => account.isDefault && account.currency === cur)?.id ?? ''
  const [accountId, setAccountId] = useState(defaults?.accountId || defaultAccountFor(defaults?.currency ?? 'UYU'))

  function changeCurrency(next: CurrencyCode) {
    setCurrency(next)
    const current = accounts.find((account) => account.id === accountId)
    if (!current || current.currency !== next) setAccountId(defaultAccountFor(next))
  }

  return (
    <ActionForm action={defaults ? updateBill : createBill} submitLabel={defaults ? 'Guardar cambios' : 'Crear cuenta fija'}>
      {defaults ? <input type="hidden" name="id" value={defaults.id} /> : null}
      <label className="field">
        <span>Nombre</span>
        <input className="input" name="name" required defaultValue={defaults?.name} placeholder="Ej. Alquiler" />
      </label>
      <div className="field-grid">
        <label className="field">
          <span>Categoría</span>
          <select className="select" name="categoryId" defaultValue={defaults?.categoryId ?? ''}>
            <option value="">Sin categorizar</option>
            {categories.filter((category) => category.isActive).map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Frecuencia</span>
          <select
            className="select"
            name="frequency"
            value={frequency}
            onChange={(event) => setFrequency(event.target.value)}
          >
            <option value="MONTHLY">Mensual</option>
            <option value="BIMONTHLY">Bimestral</option>
            <option value="QUARTERLY">Trimestral</option>
            <option value="SEMIANNUAL">Semestral</option>
            <option value="ANNUAL">Anual</option>
          </select>
        </label>
      </div>
      <div className="field-grid">
        <label className="field">
          <span>Moneda</span>
          {defaults ? (
            <>
              <input className="input" value={currency} disabled />
              <input type="hidden" name="currency" value={defaults.currency} />
            </>
          ) : (
            <select className="select" name="currency" value={currency} onChange={(event) => changeCurrency(event.target.value as CurrencyCode)}>
              <option value="UYU">Pesos (UYU)</option>
              <option value="USD">Dólares (USD)</option>
            </select>
          )}
        </label>
        <label className="field">
          <span>Día estimado de pago</span>
          <input className="input" type="number" name="dueDay" min={1} max={31} required defaultValue={defaults?.dueDay ?? 10} />
        </label>
      </div>
      <div className="segmented" style={{ marginBottom: 10, width: '100%' }}>
        <button type="button" style={{ flex: 1 }} className={amountType === 'FIXED' ? 'selected' : ''} onClick={() => setAmountType('FIXED')}>
          Importe fijo
        </button>
        <button type="button" style={{ flex: 1 }} className={amountType === 'RANGE' ? 'selected' : ''} onClick={() => setAmountType('RANGE')}>
          Estimado (rango)
        </button>
      </div>
      <input type="hidden" name="amountType" value={amountType} />
      {amountType === 'FIXED' ? (
        <label className="field">
          <span>Importe fijo</span>
          <input className="input" name="amountFixed" inputMode="decimal" required defaultValue={defaults?.amountFixed ?? ''} placeholder="0,00" />
        </label>
      ) : (
        <div className="field-grid">
          <label className="field">
            <span>Mínimo</span>
            <input className="input" name="amountMin" inputMode="decimal" required defaultValue={defaults?.amountMin ?? ''} />
          </label>
          <label className="field">
            <span>Máximo</span>
            <input className="input" name="amountMax" inputMode="decimal" required defaultValue={defaults?.amountMax ?? ''} />
          </label>
        </div>
      )}
      <label className="field">
        <span>Mi porcentaje del gasto</span>
        <input
          className="input"
          type="number"
          name="sharePercent"
          min={1}
          max={100}
          step={1}
          defaultValue={defaults?.sharePercent ?? 100}
        />
        <span className="hint">
          Si comparten el gasto con tu pareja, poné tu parte. El importe que cargás es el total; el saldo
          usa este porcentaje.
        </span>
      </label>

      <div className="field-grid">
        <label className="field">
          <span>Se paga con</span>
          <select
            className="select"
            name="paymentSource"
            value={paymentSource}
            onChange={(event) => setPaymentSource(event.target.value as 'ACCOUNT' | 'CREDIT_CARD')}
          >
            <option value="ACCOUNT">Cuenta / débito automático</option>
            <option value="CREDIT_CARD">Tarjeta de crédito</option>
          </select>
        </label>
        {paymentSource === 'ACCOUNT' ? (
          <label className="field">
            <span>Cuenta</span>
            <select
              className="select"
              name="accountId"
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              required
            >
              <option value="" disabled>Elegí una cuenta</option>
              {accounts.filter((account) => account.currency === currency).map((account) => (
                <option key={account.id} value={account.id}>{account.name}</option>
              ))}
            </select>
          </label>
        ) : (
          <label className="field">
            <span>Tarjeta</span>
            <select className="select" name="creditCardId" defaultValue={defaults?.creditCardId ?? ''} required>
              <option value="" disabled>Elegí una tarjeta</option>
              {cards.map((card) => (
                <option key={card.id} value={card.id}>{card.name}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      {paymentSource === 'CREDIT_CARD' ? (
        <p className="hint" style={{ marginTop: -4 }}>
          Se imputa al resumen de la tarjeta, no al saldo bancario. No se cuenta dos veces.
        </p>
      ) : null}
      {frequency === 'MONTHLY' ? (
        <>
          <input type="hidden" name="startDate" value={startMonth} />
          <input type="hidden" name="endDate" value={endMonth} />
        </>
      ) : (
        <div className="field-grid">
          <label className="field">
            <span>Primer mes de pago</span>
            <input
              className="input"
              type="month"
              name="startDate"
              required
              value={startMonth}
              onChange={(event) => setStartMonth(event.target.value)}
            />
            <span className="hint">
              Las cuentas bimestrales, trimestrales o anuales cuentan desde este mes.
            </span>
          </label>
          <label className="field">
            <span>Último mes (opcional)</span>
            <input
              className="input"
              type="month"
              name="endDate"
              value={endMonth}
              onChange={(event) => setEndMonth(event.target.value)}
            />
            <span className="hint">Dejalo vacío si la cuenta no tiene fin.</span>
          </label>
        </div>
      )}
      <label className="field">
        <span>Notas (opcional)</span>
        <textarea className="textarea" name="notes" defaultValue={defaults?.notes ?? ''} />
      </label>
      {defaults ? (
        <label className="checkbox">
          <input type="checkbox" name="isActive" defaultChecked={defaults.isActive} />
          <span>Cuenta activa</span>
        </label>
      ) : null}
    </ActionForm>
  )
}

export function PayBillForm({
  bill,
  accounts,
  period,
  defaultAmount,
  chargedToCard,
}: {
  bill: { id: string; name: string; paymentSource: 'ACCOUNT' | 'CREDIT_CARD'; currency: CurrencyCode }
  accounts: AccountOption[]
  period: string
  defaultAmount: string
  chargedToCard: boolean
}) {
  return (
    <ActionForm action={payBillOccurrence} submitLabel="Marcar como pagada">
      <input type="hidden" name="billId" value={bill.id} />
      <input type="hidden" name="period" value={period} />
      <div className="field-grid">
        <label className="field">
          <span>Importe real</span>
          <input className="input" name="amountActual" inputMode="decimal" required defaultValue={defaultAmount} />
        </label>
        <label className="field">
          <span>Fecha de pago</span>
          <input className="input" type="date" name="paidAt" required defaultValue={new Date().toISOString().slice(0, 10)} />
        </label>
      </div>
      {chargedToCard ? (
        <p className="hint">
          Esta cuenta se paga con tarjeta: queda registrada como pagada y su cargo se imputa al resumen de la tarjeta.
        </p>
      ) : (
        <label className="field">
          <span>Cuenta desde la que pagaste</span>
          <select className="select" name="accountId" required defaultValue="">
            <option value="" disabled>Elegí una cuenta</option>
            {accounts.filter((account) => account.currency === bill.currency).map((account) => (
              <option key={account.id} value={account.id}>{account.name}</option>
            ))}
          </select>
        </label>
      )}
    </ActionForm>
  )
}

export function BillActualForm({
  billId,
  period,
  defaultAmount,
}: {
  billId: string
  period: string
  defaultAmount: string
}) {
  return (
    <ActionForm action={setBillActualAmount} submitLabel="Guardar importe">
      <input type="hidden" name="billId" value={billId} />
      <input type="hidden" name="period" value={period} />
      <label className="field">
        <span>Importe real de este mes</span>
        <input className="input" name="amountActual" inputMode="decimal" required defaultValue={defaultAmount} />
        <span className="hint">Sirve para reemplazar el rango estimado en la proyección.</span>
      </label>
    </ActionForm>
  )
}

export function GoalForm({
  accounts,
  today,
  defaults,
}: {
  accounts: AccountOption[]
  today: string
  defaults?: {
    id: string
    name: string
    currency: CurrencyCode
    targetAmount: string
    targetDate: string
    monthlyTarget: string | null
    priority: number
    isActive: boolean
  }
}) {
  return (
    <ActionForm action={defaults ? updateGoal : createGoal} submitLabel={defaults ? 'Guardar cambios' : 'Crear objetivo'}>
      {defaults ? <input type="hidden" name="id" value={defaults.id} /> : null}
      <label className="field">
        <span>Nombre</span>
        <input className="input" name="name" required defaultValue={defaults?.name} placeholder="Ej. Viaje a Japón" />
      </label>
      <div className="field-grid">
        <label className="field">
          <span>Moneda</span>
          {defaults ? (
            <input className="input" value={defaults.currency} disabled />
          ) : (
            <select className="select" name="currency" defaultValue="UYU">
              <option value="UYU">Pesos (UYU)</option>
              <option value="USD">Dólares (USD)</option>
            </select>
          )}
        </label>
        <label className="field">
          <span>Monto objetivo</span>
          <input className="input" name="targetAmount" inputMode="decimal" required defaultValue={defaults?.targetAmount} placeholder="0,00" />
        </label>
      </div>
      <div className="field-grid">
        <label className="field">
          <span>Fecha objetivo</span>
          <input className="input" type="date" name="targetDate" required defaultValue={defaults?.targetDate} />
        </label>
        <label className="field">
          <span>Aporte mensual deseado (opcional)</span>
          <input className="input" name="monthlyTarget" inputMode="decimal" defaultValue={defaults?.monthlyTarget ?? ''} placeholder="0,00" />
        </label>
      </div>
      <label className="field">
        <span>Prioridad (1 = más alta)</span>
        <select className="select" name="priority" defaultValue={String(defaults?.priority ?? 3)}>
          <option value="1">1 · Primero</option>
          <option value="2">2 · Alta</option>
          <option value="3">3 · Media</option>
          <option value="4">4 · Baja</option>
          <option value="5">5 · Cuando se pueda</option>
        </select>
        <span className="hint">La prioridad define qué objetivo recibe primero el margen libre proyectado.</span>
      </label>
      {!defaults ? (
        <label className="field">
          <span>Ya ahorrado (opcional)</span>
          <input className="input" name="initialAmount" inputMode="decimal" placeholder="0,00" />
        </label>
      ) : (
        <label className="checkbox">
          <input type="checkbox" name="isActive" defaultChecked={defaults.isActive} />
          <span>Objetivo activo</span>
        </label>
      )}
      {!defaults && accounts.length > 0 ? (
        <p className="hint">Los aportes se registran después de crear el objetivo.</p>
      ) : null}
      <input type="hidden" name="startHint" value={today} />
    </ActionForm>
  )
}

export function ContributionForm({
  goals,
  accounts,
  defaultGoalId,
  today,
}: {
  goals: Array<{ id: string; name: string; currency: CurrencyCode }>
  accounts: AccountOption[]
  defaultGoalId?: string
  today: string
}) {
  const [goalId, setGoalId] = useState(defaultGoalId ?? goals[0]?.id ?? '')
  const goal = goals.find((item) => item.id === goalId)
  return (
    <ActionForm action={addContribution} submitLabel="Registrar aporte">
      <div className="field-grid">
        <label className="field">
          <span>Objetivo</span>
          <select className="select" name="goalId" value={goalId} onChange={(event) => setGoalId(event.target.value)} required>
            {goals.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Importe</span>
          <input className="input" name="amount" inputMode="decimal" required placeholder="0,00" />
        </label>
      </div>
      <div className="field-grid">
        <label className="field">
          <span>Fecha</span>
          <input className="input" type="date" name="date" required defaultValue={today} />
        </label>
        <label className="field">
          <span>Cuenta (opcional)</span>
          <select
            key={goalId}
            className="select"
            name="accountId"
            defaultValue={
              accounts.find((account) => account.isDefault && account.currency === goal?.currency)?.id ?? ''
            }
          >
            <option value="">Sin descontar de una cuenta</option>
            {accounts
              .filter((account) => !goal || account.currency === goal.currency)
              .map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span>Nota (opcional)</span>
        <input className="input" name="note" />
      </label>
    </ActionForm>
  )
}

export function CategoryForm({
  defaults,
}: {
  defaults?: { id: string; name: string; icon: string | null; color: string | null; isActive: boolean }
}) {
  return (
    <ActionForm action={defaults ? updateCategory : createCategory} submitLabel={defaults ? 'Guardar' : 'Crear categoría'}>
      {defaults ? <input type="hidden" name="id" value={defaults.id} /> : null}
      <label className="field">
        <span>Nombre</span>
        <input className="input" name="name" required defaultValue={defaults?.name} placeholder="Ej. Mascotas" />
      </label>
      <div className="field-grid">
        <label className="field">
          <span>Ícono</span>
          <select className="select" name="icon" defaultValue={defaults?.icon ?? 'dots'}>
            <option value="bag">Bolsa</option>
            <option value="receipt">Factura</option>
            <option value="fork">Cubiertos</option>
            <option value="home">Casa</option>
            <option value="glass">Vaso</option>
            <option value="scooter">Delivery</option>
            <option value="car">Auto</option>
            <option value="plane">Avión</option>
            <option value="gift">Regalos</option>
            <option value="beer">Cerveza</option>
            <option value="bill">Billete / préstamo</option>
            <option value="dots">Puntos</option>
          </select>
        </label>
        <label className="field">
          <span>Color</span>
          <select className="select" name="color" defaultValue={defaults?.color ?? 'gray'}>
            <option value="violet">Violeta</option>
            <option value="mint">Menta</option>
            <option value="peach">Durazno</option>
            <option value="yellow">Amarillo</option>
            <option value="blue">Azul</option>
            <option value="lavender">Lavanda</option>
            <option value="gray">Gris</option>
          </select>
        </label>
      </div>
      {defaults ? (
        <label className="checkbox">
          <input type="checkbox" name="isActive" defaultChecked={defaults.isActive} />
          <span>Categoría activa</span>
        </label>
      ) : null}
    </ActionForm>
  )
}

export function SimpleMoneyForm({
  action,
  submitLabel,
  children,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>
  submitLabel: string
  children: React.ReactNode
}) {
  return (
    <ActionForm action={action} submitLabel={submitLabel}>
      {children}
    </ActionForm>
  )
}

export { CURRENCIES }
