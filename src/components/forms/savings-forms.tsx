'use client'

import { useState } from 'react'
import { ActionForm } from '@/components/action-form'
import { addSavingsWithdrawal, saveSavingsFund } from '@/app/actions/savings'
import { CURRENCIES, type CurrencyCode } from '@/lib/money'
import type { AccountOption } from '@/components/forms/money-forms'

/** Ahorro inicial por moneda: la plata que ya estaba ahorrada. */
export function SavingsFundForm({
  today,
  defaults,
}: {
  today: string
  defaults?: {
    uyu: string | null
    usd: string | null
    startDate: string
  }
}) {
  return (
    <ActionForm action={saveSavingsFund} submitLabel="Guardar ahorro inicial">
      <p className="hint" style={{ marginTop: 0, marginBottom: 10 }}>
        Es la plata que ya tenías ahorrada. Dejalo vacío si no corresponde a esa moneda.
      </p>
      <div className="field-grid">
        <label className="field">
          <span>Ahorro inicial en pesos</span>
          <div className="amount-input">
            <span className="cur-prefix">$U</span>
            <input
              className="input"
              name="initial_UYU"
              inputMode="decimal"
              defaultValue={defaults?.uyu ?? ''}
              placeholder="0,00"
            />
          </div>
        </label>
        <label className="field">
          <span>Ahorro inicial en dólares</span>
          <div className="amount-input">
            <span className="cur-prefix">US$</span>
            <input
              className="input"
              name="initial_USD"
              inputMode="decimal"
              defaultValue={defaults?.usd ?? ''}
              placeholder="0,00"
            />
          </div>
        </label>
      </div>
      <label className="field">
        <span>Desde cuándo tenés ese ahorro</span>
        <input className="input" type="date" name="startDate" required defaultValue={defaults?.startDate ?? today} />
      </label>
    </ActionForm>
  )
}

/** Transferencia del ahorro a una cuenta: la plata vuelve al banco. */
export function SavingsWithdrawalForm({
  accounts,
  today,
  defaultCurrency = 'UYU',
}: {
  accounts: AccountOption[]
  today: string
  defaultCurrency?: CurrencyCode
}) {
  const [currency, setCurrency] = useState<CurrencyCode>(defaultCurrency)
  const defaultAccountFor = (cur: CurrencyCode) =>
    accounts.find((account) => account.isDefault && account.currency === cur)?.id ?? ''
  const [accountId, setAccountId] = useState(defaultAccountFor(defaultCurrency))
  const accountsForCurrency = accounts.filter((account) => account.currency === currency)

  function changeCurrency(next: CurrencyCode) {
    setCurrency(next)
    const current = accounts.find((account) => account.id === accountId)
    if (!current || current.currency !== next) setAccountId(defaultAccountFor(next))
  }

  return (
    <ActionForm action={addSavingsWithdrawal} submitLabel="Transferir a la cuenta">
      <div className="field-grid">
        <label className="field">
          <span>Importe</span>
          <div className="amount-input">
            <span className="cur-prefix">{currency === 'UYU' ? '$U' : 'US$'}</span>
            <input className="input" name="amount" inputMode="decimal" required autoFocus placeholder="0,00" />
          </div>
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
        <span>Cuenta que recibe la plata</span>
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

      <label className="field">
        <span>Fecha</span>
        <input className="input" type="date" name="date" required defaultValue={today} />
      </label>

      <label className="field">
        <span>Nota (opcional)</span>
        <input className="input" name="note" maxLength={120} placeholder="Ej. para pagar la tarjeta" />
      </label>

      <p className="hint">
        Sale del ahorro y entra a la cuenta: el saldo disponible sube y el ahorro baja.
      </p>
    </ActionForm>
  )
}
