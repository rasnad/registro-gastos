'use client'

import { useState } from 'react'
import { ActionForm } from '@/components/action-form'
import { createExpense, updateExpense } from '@/app/actions/expenses'
import { createAccount, createAdjustment, createIncome, updateAccount, updateIncome } from '@/app/actions/accounts'
import { CURRENCIES, formatMoney, parseAmountInput, type CurrencyCode } from '@/lib/money'
import { CategoryDot } from '@/components/ui'
import { shareFieldName, shareOf, applySharePercent } from '@/lib/finance/shares'
import type { ActionState } from '@/lib/action-state'

export type AccountOption = { id: string; name: string; currency: CurrencyCode; kind: string; isDefault: boolean }
export type CardOption = { id: string; name: string; closingDay: number; dueDay: number }
export type CategoryOption = {
  id: string
  name: string
  isActive: boolean
  icon: string | null
  color: string | null
}
/** Usuario registrado al que se le puede asignar una parte del gasto. */
export type MemberOption = { id: string; name: string; isMe: boolean }

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
  shares?: Array<{ userId: string; sharePercent: number }>
}

function clampPercent(raw: string | undefined): number {
  const value = Math.trunc(Number(raw))
  if (!Number.isFinite(value) || value < 0) return 0
  return Math.min(100, value)
}

export function ExpenseForm({
  accounts,
  cards,
  categories,
  today,
  defaults,
  members = [],
  gmailMessageId,
}: {
  accounts: AccountOption[]
  cards: CardOption[]
  categories: CategoryOption[]
  today: string
  defaults?: ExpenseDefaults
  members?: MemberOption[]
  gmailMessageId?: string
}) {
  const [currency, setCurrency] = useState<CurrencyCode>(defaults?.currency ?? 'UYU')
  const [source, setSource] = useState<'ACCOUNT' | 'CREDIT_CARD'>(
    defaults?.source ?? (accounts.length > 0 ? 'ACCOUNT' : 'CREDIT_CARD'),
  )
  const [merchant, setMerchant] = useState(defaults?.merchant ?? '')
  const [categoryId, setCategoryId] = useState(defaults?.categoryId ?? '')
  const [amount, setAmount] = useState(defaults?.amount ?? '')
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
  const selectedCategory = categories.find((category) => category.id === categoryId)

  const action = defaults?.id ? updateExpense : createExpense

  // Reparto del gasto: por defecto el 100% es tuyo y los demás arrancan en 0.
  const otherMembers = members.filter((member) => !member.isMe)
  const [otherShares, setOtherShares] = useState<Record<string, string>>(() =>
    Object.fromEntries(otherMembers.map((member) => [member.id, String(shareOf(defaults?.shares, member.id))])),
  )
  const [splitOpen, setSplitOpen] = useState(() =>
    otherMembers.some((member) => shareOf(defaults?.shares, member.id) > 0),
  )
  const othersTotal = otherMembers.reduce(
    (sum, member) => sum + clampPercent(otherShares[member.id]),
    0,
  )
  const myPercent = Math.max(0, 100 - othersTotal)
  const totalCents = parseAmountInput(amount) ?? 0
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
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
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
          }}
          placeholder="Ej. Supermercado Disco"
        />
      </label>

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
        <div className="category-with-icon">
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
          <CategoryDot icon={selectedCategory?.icon} color={selectedCategory?.color} size={34} />
        </div>
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
                    {card.name}
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
        </>
      )}

      {/* Las notas del gasto no se muestran en ninguna pantalla: se conservan
          las que ya existan sin ocupar lugar en el formulario. */}
      <input type="hidden" name="notes" value={defaults?.notes ?? ''} />

      {otherMembers.length > 0 ? (
        <div className="split-box">
          <button
            type="button"
            className={`split-toggle${splitOpen ? ' is-open' : ''}`}
            onClick={() => setSplitOpen((open) => !open)}
            aria-expanded={splitOpen}
            title="Repartir este gasto con otro usuario"
          >
            <span className="split-sign" aria-hidden="true">%</span>
            {othersTotal > 0
              ? `Repartido ${othersTotal}% con ${otherMembers.length === 1 ? otherMembers[0].name : `${otherMembers.length} usuarios`}`
              : 'Repartir con otro usuario'}
          </button>

          {splitOpen ? (
            <div className="split-panel">
              {otherMembers.map((member) => (
                <label key={member.id} className="split-row">
                  <span className="split-name">{member.name}</span>
                  <span className="split-input">
                    <input
                      className="input"
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      inputMode="numeric"
                      aria-label={`Porcentaje de ${member.name}`}
                      value={otherShares[member.id] ?? '0'}
                      onChange={(event) =>
                        setOtherShares((current) => ({ ...current, [member.id]: event.target.value }))
                      }
                    />
                    <span>%</span>
                  </span>
                  <small>
                    {formatMoney(applySharePercent(totalCents, clampPercent(otherShares[member.id])), currency)}
                  </small>
                </label>
              ))}
              <p className={`split-sum${othersTotal > 100 ? ' error-text' : ''}`.trim()}>
                Vos asumís el <strong>{myPercent}%</strong>
                {totalCents > 0 ? ` · ${formatMoney(applySharePercent(totalCents, myPercent), currency)}` : ''}
                {othersTotal > 100 ? ' · el reparto no puede superar el 100%' : ''}
              </p>
            </div>
          ) : null}

          {members.map((member) => (
            <input
              key={member.id}
              type="hidden"
              name={shareFieldName(member.id)}
              value={member.isMe ? String(myPercent) : String(clampPercent(otherShares[member.id]))}
            />
          ))}
        </div>
      ) : null}

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
