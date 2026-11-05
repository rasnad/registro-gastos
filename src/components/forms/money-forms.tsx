'use client'

import { useMemo, useState } from 'react'
import { ActionForm } from '@/components/action-form'
import { createExpense, updateExpense } from '@/app/actions/expenses'
import { createAccount, createAdjustment, createIncome, updateAccount, updateIncome } from '@/app/actions/accounts'
import { CURRENCIES, type CurrencyCode } from '@/lib/money'
import type { ActionState } from '@/lib/action-state'

export type AccountOption = { id: string; name: string; currency: CurrencyCode; kind: string; isDefault: boolean }
export type CardOption = { id: string; name: string; currency: CurrencyCode; closingDay: number; dueDay: number }
export type CategoryOption = { id: string; name: string; isActive: boolean }
export type MerchantRule = { pattern: string; categoryId: string }

export type ExpenseDefaults = {
  id?: string
  merchant?: string
  description?: string | null
  amount?: string
  currency?: CurrencyCode
  date?: string
  categoryId?: string | null
  source?: 'ACCOUNT' | 'CREDIT_CARD'
  accountId?: string | null
  creditCardId?: string | null
  installments?: number
  notes?: string | null
  gmailMessageId?: string
}

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function ExpenseForm({
  accounts,
  cards,
  categories,
  rules,
  today,
  defaults,
  gmailMessageId,
}: {
  accounts: AccountOption[]
  cards: CardOption[]
  categories: CategoryOption[]
  rules: MerchantRule[]
  today: string
  defaults?: ExpenseDefaults
  gmailMessageId?: string
}) {
  const [currency, setCurrency] = useState<CurrencyCode>(defaults?.currency ?? 'UYU')
  const [source, setSource] = useState<'ACCOUNT' | 'CREDIT_CARD'>(
    defaults?.source ?? (accounts.length > 0 ? 'ACCOUNT' : 'CREDIT_CARD'),
  )
  const [merchant, setMerchant] = useState(defaults?.merchant ?? '')
  const [categoryId, setCategoryId] = useState(defaults?.categoryId ?? '')
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const defaultAccountFor = (cur: CurrencyCode) =>
    accounts.find((account) => account.isDefault && account.currency === cur)?.id ?? ''
  const [accountId, setAccountId] = useState(
    defaults?.accountId || defaultAccountFor(defaults?.currency ?? 'UYU'),
  )

  function changeCurrency(next: CurrencyCode) {
    setCurrency(next)
    const current = accounts.find((account) => account.id === accountId)
    if (!current || current.currency !== next) setAccountId(defaultAccountFor(next))
  }

  const accountsForCurrency = accounts.filter((account) => account.currency === currency)
  // Una tarjeta puede tener consumos en pesos y en dólares (resumen dual).
  const cardsForCurrency = cards
  const activeCategories = categories.filter((category) => category.isActive || category.id === defaults?.categoryId)

  const suggested = useMemo(() => {
    const normalized = normalize(merchant)
    if (!normalized) return null
    const rule = rules.find((item) => item.pattern === normalized) ??
      rules.find((item) => normalized.includes(item.pattern) && item.pattern.length >= 4)
    if (!rule) return null
    const category = categories.find((item) => item.id === rule.categoryId)
    return category ? category : null
  }, [merchant, rules, categories])

  function applySuggestion() {
    if (!suggested) return
    setCategoryId(suggested.id)
    setSuggestion(`Categoría sugerida: ${suggested.name}`)
  }

  const action = defaults?.id ? updateExpense : createExpense

  return (
    <ActionForm action={action as (state: ActionState, formData: FormData) => Promise<ActionState>} submitLabel={defaults?.id ? 'Guardar cambios' : 'Registrar movimiento'}>
      {defaults?.id ? <input type="hidden" name="id" value={defaults.id} /> : null}
      {gmailMessageId ? <input type="hidden" name="gmailMessageId" value={gmailMessageId} /> : null}

      <label className="field">
        <span>Importe</span>
        <div className="amount-input">
          <span className="cur-prefix">{currency === 'UYU' ? '$U' : 'US$'}</span>
          <input
            className="input"
            name="amount"
            inputMode="decimal"
            required
            autoFocus
            defaultValue={defaults?.amount}
            placeholder="0,00"
          />
        </div>
      </label>

      <label className="field">
        <span>Comercio o descripción</span>
        <input
          className="input"
          name="merchant"
          required
          value={merchant}
          onChange={(event) => {
            setMerchant(event.target.value)
            setSuggestion(null)
          }}
          placeholder="Ej. Supermercado Disco"
        />
      </label>

      {suggested ? (
        <p className="hint" style={{ marginTop: -6, marginBottom: 10 }}>
          {suggestion ?? `Sugerencia para este comercio: ${suggested.name}`}{' '}
          {!suggestion ? (
            <button type="button" className="link-button" onClick={applySuggestion}>
              Usar
            </button>
          ) : null}
        </p>
      ) : null}

      <div className="field-grid">
        <label className="field">
          <span>Fecha</span>
          <input className="input" type="date" name="date" required defaultValue={defaults?.date ?? today} />
        </label>
        <label className="field">
          <span>Moneda</span>
          <select
            className="select"
            name="currency"
            value={currency}
            onChange={(event) => changeCurrency(event.target.value as CurrencyCode)}
          >
            {CURRENCIES.map((item) => (
              <option key={item} value={item}>
                {item === 'UYU' ? 'Pesos (UYU)' : 'Dólares (USD)'}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="field">
        <span>Categoría</span>
        <select
          className="select"
          name="categoryId"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
        >
          <option value="">Sin categorizar</option>
          {activeCategories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="field" style={{ border: 0, padding: 0, margin: '0 0 12px' }}>
        <span className="field-label">Medio de pago</span>
        <div className="segmented" style={{ width: '100%' }}>
          <label style={{ flex: 1, textAlign: 'center' }}>
            <input
              type="radio"
              name="source"
              value="ACCOUNT"
              checked={source === 'ACCOUNT'}
              onChange={() => setSource('ACCOUNT')}
            />
            Débito, efectivo o transferencia
          </label>
          <label style={{ flex: 1, textAlign: 'center' }}>
            <input
              type="radio"
              name="source"
              value="CREDIT_CARD"
              checked={source === 'CREDIT_CARD'}
              onChange={() => setSource('CREDIT_CARD')}
            />
            Tarjeta de crédito
          </label>
        </div>
      </fieldset>

      {source === 'ACCOUNT' ? (
        <label className="field">
          <span>Cuenta de origen</span>
          <select
            className="select"
            name="accountId"
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            required
          >
            <option value="" disabled>
              Elegí una cuenta
            </option>
            {accountsForCurrency.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
          {accountsForCurrency.length === 0 ? (
            <span className="hint">No tenés cuentas en {currency}. Creá una en Ajustes → Cuentas.</span>
          ) : null}
        </label>
      ) : (
        <>
          <div className="field-grid">
            <label className="field">
              <span>Tarjeta</span>
              <select className="select" name="creditCardId" defaultValue={defaults?.creditCardId ?? ''} required>
                <option value="" disabled>
                  Elegí una tarjeta
                </option>
                {cardsForCurrency.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.name} · {card.currency}
                  </option>
                ))}
              </select>
              {cards.length === 0 ? (
                <span className="hint">No tenés tarjetas. Creá una en Ajustes → Tarjetas.</span>
              ) : null}
            </label>
            <label className="field">
              <span>Cuotas</span>
              <input
                className="input"
                type="number"
                name="installments"
                min={1}
                max={60}
                defaultValue={defaults?.installments ?? 1}
              />
            </label>
          </div>
          <p className="hint" style={{ marginTop: -6 }}>
            La compra no descuenta el saldo bancario: genera una obligación que se paga con el resumen.
            El período se calcula con el cierre de la tarjeta y se puede corregir en Tarjetas.
          </p>
        </>
      )}

      <label className="field">
        <span>Notas (opcional)</span>
        <textarea className="textarea" name="notes" defaultValue={defaults?.notes ?? ''} placeholder="Detalle que quieras conservar" />
      </label>

      {categoryId ? (
        <label className="checkbox">
          <input type="checkbox" name="saveRule" defaultChecked={false} />
          <span>Recordar esta categoría para futuros gastos de este comercio</span>
        </label>
      ) : null}
    </ActionForm>
  )
}

export function AccountForm({
  defaults,
}: {
  defaults?: { id: string; name: string; kind: string; currency: CurrencyCode; openingBalance: string; openingDate: string; isActive: boolean }
}) {
  return (
    <ActionForm action={defaults ? updateAccount : createAccount} submitLabel={defaults ? 'Guardar cambios' : 'Crear cuenta'}>
      {defaults ? <input type="hidden" name="id" value={defaults.id} /> : null}
      <label className="field">
        <span>Nombre</span>
        <input className="input" name="name" required defaultValue={defaults?.name} placeholder="Ej. Cuenta Itaú" />
      </label>
      {!defaults ? (
        <div className="field-grid">
          <label className="field">
            <span>Tipo</span>
            <select className="select" name="kind" defaultValue="BANK">
              <option value="BANK">Cuenta bancaria</option>
              <option value="CASH">Efectivo</option>
              <option value="WALLET">Billetera virtual</option>
            </select>
          </label>
          <label className="field">
            <span>Moneda</span>
            <select className="select" name="currency" defaultValue="UYU">
              <option value="UYU">Pesos (UYU)</option>
              <option value="USD">Dólares (USD)</option>
            </select>
          </label>
        </div>
      ) : null}
      <div className="field-grid">
        <label className="field">
          <span>Saldo inicial</span>
          <input
            className="input"
            name="openingBalance"
            inputMode="decimal"
            required
            defaultValue={defaults?.openingBalance ?? '0'}
          />
          <span className="hint">El saldo real al inicio del registro.</span>
        </label>
        <label className="field">
          <span>Fecha del saldo</span>
          <input
            className="input"
            type="date"
            name="openingDate"
            required
            defaultValue={defaults?.openingDate ?? new Date().toISOString().slice(0, 10)}
          />
        </label>
      </div>
      {defaults ? (
        <label className="checkbox">
          <input type="checkbox" name="isActive" defaultChecked={defaults.isActive} />
          <span>Cuenta activa (las inactivas no se proyectan)</span>
        </label>
      ) : null}
    </ActionForm>
  )
}

export function AdjustmentForm({ accounts }: { accounts: AccountOption[] }) {
  return (
    <ActionForm action={createAdjustment} submitLabel="Registrar ajuste">
      <label className="field">
        <span>Cuenta</span>
        <select
          className="select"
          name="accountId"
          required
          defaultValue={accounts.find((account) => account.isDefault)?.id ?? ''}
        >
          <option value="" disabled>
            Elegí una cuenta
          </option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name} · {account.currency}
            </option>
          ))}
        </select>
      </label>
      <div className="field-grid">
        <label className="field">
          <span>Ajuste</span>
          <input className="input" name="amount" inputMode="decimal" required placeholder="Ej. -1500 o 2500" />
          <span className="hint">Usá signo negativo si el saldo real es menor.</span>
        </label>
        <label className="field">
          <span>Fecha</span>
          <input className="input" type="date" name="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
        </label>
      </div>
      <label className="field">
        <span>Motivo</span>
        <input className="input" name="reason" required placeholder="Ej. Corrección por gasto no registrado" />
        <span className="hint">Queda guardado junto al ajuste.</span>
      </label>
    </ActionForm>
  )
}

export function IncomeForm({ accounts }: { accounts: AccountOption[] }) {
  const [recurring, setRecurring] = useState(true)
  const [currency, setCurrency] = useState<CurrencyCode>('UYU')
  return (
    <ActionForm action={createIncome} submitLabel="Guardar ingreso">
      <label className="field">
        <span>Descripción</span>
        <input className="input" name="description" required placeholder="Ej. Sueldo" />
      </label>
      <div className="field-grid">
        <label className="field">
          <span>Importe</span>
          <input className="input" name="amount" inputMode="decimal" required placeholder="0,00" />
        </label>
        <label className="field">
          <span>Moneda</span>
          <select className="select" name="currency" value={currency} onChange={(event) => setCurrency(event.target.value as CurrencyCode)}>
            <option value="UYU">Pesos (UYU)</option>
            <option value="USD">Dólares (USD)</option>
          </select>
        </label>
      </div>
      <div className="field-grid">
        <label className="field">
          <span>Tipo</span>
          <select className="select" name="kind" defaultValue="FIXED">
            <option value="FIXED">Fijo</option>
            <option value="VARIABLE">Variable o extraordinario</option>
          </select>
        </label>
        <label className="field">
          <span>Repetición</span>
          <select
            className="select"
            name="recurrence"
            value={recurring ? 'MONTHLY' : ''}
            onChange={(event) => setRecurring(event.target.value === 'MONTHLY')}
          >
            <option value="MONTHLY">Todos los meses</option>
            <option value="">Una sola vez</option>
          </select>
        </label>
      </div>
      <div className="field-grid">
        <label className="field">
          <span>Fecha de inicio</span>
          <input className="input" type="date" name="startDate" required defaultValue={new Date().toISOString().slice(0, 10)} />
        </label>
        {recurring ? (
          <label className="field">
            <span>Día de cobro</span>
            <input className="input" type="number" name="dayOfMonth" min={1} max={31} defaultValue={1} />
          </label>
        ) : (
          <label className="field">
            <span>Fecha de fin (opcional)</span>
            <input className="input" type="date" name="endDate" />
          </label>
        )}
      </div>
      <label className="field">
        <span>Cuenta donde entra (opcional)</span>
        <select
          key={currency}
          className="select"
          name="accountId"
          defaultValue={accounts.find((account) => account.isDefault && account.currency === currency)?.id ?? ''}
        >
          <option value="">Sin asignar</option>
          {accounts
            .filter((account) => account.currency === currency)
            .map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
        </select>
        <span className="hint">Si la asignás, el ingreso suma al saldo de esa cuenta.</span>
      </label>
    </ActionForm>
  )
}

export function IncomeEditForm({
  income,
}: {
  income: { id: string; description: string; amount: string; startDate: string; isActive: boolean }
}) {
  return (
    <ActionForm action={updateIncome} submitLabel="Guardar cambios">
      <input type="hidden" name="id" value={income.id} />
      <label className="field">
        <span>Descripción</span>
        <input className="input" name="description" required defaultValue={income.description} />
      </label>
      <div className="field-grid">
        <label className="field">
          <span>Importe</span>
          <input className="input" name="amount" inputMode="decimal" required defaultValue={income.amount} />
        </label>
        <label className="field">
          <span>Fecha de inicio</span>
          <input className="input" type="date" name="startDate" required defaultValue={income.startDate} />
        </label>
      </div>
      <label className="checkbox">
        <input type="checkbox" name="isActive" defaultChecked={income.isActive} />
        <span>Ingreso activo (se incluye en las proyecciones)</span>
      </label>
    </ActionForm>
  )
}
