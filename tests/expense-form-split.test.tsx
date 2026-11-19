import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/app/actions/expenses', () => ({ createExpense: vi.fn(), updateExpense: vi.fn() }))
vi.mock('@/app/actions/accounts', () => ({
  createAccount: vi.fn(),
  createAdjustment: vi.fn(),
  createIncome: vi.fn(),
  updateAccount: vi.fn(),
  updateIncome: vi.fn(),
}))

import { renderToStaticMarkup } from 'react-dom/server'
import { ExpenseForm } from '@/components/forms/money-forms'

/**
 * Regresión: el reparto venía con 100% para todos los usuarios (sumaba 200%).
 * Ahora el gasto nace 100% del dueño y los demás en 0.
 */
const members = [
  { id: 'me', name: 'Lucas', isMe: true },
  { id: 'sol', name: 'Sol', isMe: false },
]

const base = {
  accounts: [{ id: 'a1', name: 'Cuenta', currency: 'UYU' as const, kind: 'BANK', isDefault: true }],
  cards: [],
  categories: [{ id: 'c1', name: 'Comida', isActive: true, icon: null, color: null }],
  today: '2026-11-19',
  members,
}

describe('reparto en el formulario de gasto', () => {
  it('un gasto nuevo arranca 100% tuyo y con el otro usuario en 0', () => {
    const html = renderToStaticMarkup(<ExpenseForm {...base} />)
    expect(html).toContain('name="share_me" value="100"')
    expect(html).toContain('name="share_sol" value="0"')
    // El panel está cerrado: el reparto no ocupa lugar en el formulario.
    expect(html).toContain('Repartir con otro usuario')
    expect(html).not.toContain('Repartido')
  })

  it('un gasto ya repartido abre el panel, respeta los porcentajes y muestra la parte propia', () => {
    const html = renderToStaticMarkup(
      <ExpenseForm
        {...base}
        defaults={{
          id: 'e1',
          merchant: 'Cafe',
          amount: '1500,00',
          date: '2026-11-18',
          source: 'CREDIT_CARD',
          creditCardId: 'card1',
          installments: 1,
          shares: [
            { userId: 'me', sharePercent: 60 },
            { userId: 'sol', sharePercent: 40 },
          ],
        }}
      />,
    )
    expect(html).toContain('name="share_me" value="60"')
    expect(html).toContain('name="share_sol" value="40"')
    expect(html).toContain('Repartido 40% con Sol')
    expect(html).toContain('Vos asumís el')
  })

  it('con un solo usuario no hay bloque de reparto', () => {
    const html = renderToStaticMarkup(<ExpenseForm {...base} members={[members[0]]} />)
    expect(html).not.toContain('Repartir con otro usuario')
    expect(html).not.toContain('share_me')
  })

  it('no muestra la sugerencia de categoría ni el texto explicativo de la tarjeta', () => {
    const html = renderToStaticMarkup(
      <ExpenseForm
        {...base}
        defaults={{ merchant: 'Cafe', source: 'CREDIT_CARD', creditCardId: 'card1' }}
      />,
    )
    expect(html).not.toContain('Sugerencia para este comercio')
    expect(html).not.toContain('no descuenta el saldo bancario')
  })

  it('el campo de notas no ocupa lugar pero conserva las notas ya guardadas', () => {
    const html = renderToStaticMarkup(
      <ExpenseForm {...base} defaults={{ id: 'e1', merchant: 'Cafe', notes: 'con Sol' }} />,
    )
    expect(html).not.toContain('<textarea')
    expect(html).toContain('name="notes" value="con Sol"')
  })
})
