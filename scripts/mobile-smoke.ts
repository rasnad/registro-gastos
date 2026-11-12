/** Prueba destructiva únicamente sobre fixtures propios, en dev-pagos y localhost. */
import fs from 'node:fs'
import { randomBytes, randomUUID, createHmac } from 'node:crypto'
import assert from 'node:assert/strict'
import dotenv from 'dotenv'
import bcrypt from 'bcryptjs'
import { neon } from '@neondatabase/serverless'
import { todayISO, addMonthsKey } from '../src/lib/period'
import type { MobileSnapshot, TokenPair } from '../src/lib/mobile/contracts'

async function main() {
  const env = { ...dotenv.parse(fs.readFileSync('.env.local')), ...dotenv.parse(fs.readFileSync('.env.pagos.local')) }
  const [identity] = await neon(env.DATABASE_URL).query("select current_setting('neon.branch_id',true) as branch")
  assert.equal(identity.branch, 'br-soft-sky-bej9rkuj', 'Sólo se permite dev-pagos')
  Object.assign(process.env, env)
  const { prisma } = await import('../src/lib/db')
  const { signSession } = await import('../src/lib/session')
  const base = 'http://127.0.0.1:3001'
  const tag = randomUUID()
  const password = randomBytes(32).toString('hex')
  const created: { id: string; email: string; name: string }[] = []
  let tokens: TokenPair
  const date = todayISO(), period = date.slice(0, 7)
  async function call(path: string, init: RequestInit = {}, token?: string) {
    const response = await fetch(`${base}/api/mobile/v1/${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers } })
    const body = await response.json()
    return { response, body }
  }
  const command = async (command: string, fields: Record<string,string>, key = randomUUID(), token = tokens.accessToken) => {
    const result = await call('commands', { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify({ command, fields }) }, token)
    assert.equal(result.response.status, 200, `${command}: ${JSON.stringify(result.body)}`)
    return result.body.data as { ok?: boolean; error?: string }
  }
  const snapshot = async (month = period) => {
    const result = await call(`snapshot?period=${month}`, {}, tokens.accessToken)
    assert.equal(result.response.status, 200, JSON.stringify(result.body))
    return result.body.data as MobileSnapshot
  }
  try {
    for (const suffix of ['owner','other']) created.push(await prisma.user.create({ data: { email: `mobile-${tag}-${suffix}@example.invalid`, name: `Mobile smoke ${tag}`, passwordHash: await bcrypt.hash(password, 10), usdRateCents: 4100 } }))
    const login = await call('auth/login', { method: 'POST', body: JSON.stringify({ email: created[0].email, password }) })
    assert.equal(login.response.status, 200); tokens = login.body.data
    const otherLogin = await call('auth/login', { method: 'POST', body: JSON.stringify({ email: created[1].email, password }) })
    const otherToken = otherLogin.body.data.accessToken as string
    assert.equal((await call('snapshot')).response.status, 401)
    const webToken = await signSession(created[0] && { userId: created[0].id, email: created[0].email, name: created[0].name })
    assert.equal((await call('snapshot', { headers: { Cookie: `rg_session=${webToken}` } })).response.status, 401)

    for (const [name, currency, balance] of [['Banco UYU','UYU','10000'],['Banco USD','USD','1000']]) assert.equal((await command('createAccount', { name, currency, openingBalance: balance, openingDate: date, kind: 'BANK' })).ok, true)
    assert.equal((await command('createCreditCard', { name: 'Tarjeta smoke', closingDay: '5', dueDay: '18', last4: '1234' })).ok, true)
    let data = await snapshot()
    const uyu = data.options.accounts.find(a => a.currency === 'UYU')!.id
    const usd = data.options.accounts.find(a => a.currency === 'USD')!.id
    const card = data.cards[0].id
    assert.equal((await command('createBill', { name: 'Cuenta smoke', currency: 'UYU', amountType: 'FIXED', amountFixed: '1000', sharePercent: '50', frequency: 'MONTHLY', dueDay: '10', paymentSource: 'ACCOUNT', accountId: uyu, startDate: `${period}-01` })).ok, true)
    assert.equal((await command('createExpense', { merchant: 'Compra UYU', amount: '1000', currency: 'UYU', date: `${period}-01`, source: 'CREDIT_CARD', creditCardId: card, installments: '1' })).ok, true)
    assert.equal((await command('createExpense', { merchant: 'Compra USD', amount: '100', currency: 'USD', date: `${period}-01`, source: 'CREDIT_CARD', creditCardId: card, installments: '1' })).ok, true)
    data = await snapshot()
    const bill = data.billDefinitions[0].id
    assert.equal(data.dashboard.cards.totalCents, 510000)
    assert.equal(data.dashboard.bills.totalCents, 50000)
    const before = data.dashboard.availableAfterCommitmentsCents
    const payment = { obligationKind: 'CARD', obligationId: card, period, currency: 'UYU', amount: '250', paidAt: date, accountId: uyu, debitAccount: 'true', note: 'Conservar nota' }
    const key = randomUUID()
    assert.equal((await command('saveObligationPayment', payment, key)).ok, true)
    assert.equal((await command('saveObligationPayment', payment, key)).ok, true)
    data = await snapshot()
    assert.equal(data.payments.length, 1, 'Reintento no duplica')
    assert.equal(data.balances.find(a => a.accountId === uyu)?.balanceCents, 975000)
    assert.equal(data.dashboard.availableAfterCommitmentsCents, before, 'Pago no se descuenta de nuevo del disponible')
    const paymentId = data.payments[0].id
    assert.equal(data.cards[0].statements[0].totalCents, 100000)
    assert.equal(data.cards[0].statements[0].status, 'PARTIAL')
    const foreign = await command('saveObligationPayment', { ...payment, id: paymentId, amount: '500' }, randomUUID(), otherToken)
    assert.ok(foreign.error)
    assert.equal((await command('saveObligationPayment', { ...payment, id: paymentId, amount: '400' })).ok, true)
    assert.equal((await snapshot()).balances.find(a => a.accountId === uyu)?.balanceCents, 960000)
    assert.equal((await command('saveObligationPayment', { ...payment, amount: '600' })).ok, true)
    data = await snapshot()
    assert.equal(data.cards[0].statements[0].status, 'PAID'); assert.equal(data.cards[0].statements[0].totalCents, 100000)
    assert.equal((await command('deleteObligationPayment', { id: paymentId })).ok, true)
    data = await snapshot(); assert.equal(data.balances.find(a => a.accountId === uyu)?.balanceCents, 940000)
    assert.equal(data.cards[0].statements[0].remainingCents, 40000)

    assert.equal((await command('saveObligationPayment', { ...payment, currency: 'USD', amount: '20', accountId: uyu })).ok, true)
    data = await snapshot(); assert.equal(data.balances.find(a => a.accountId === uyu)?.balanceCents, 858000)
    assert.equal((await command('saveObligationPayment', { ...payment, currency: 'USD', amount: '80', accountId: usd })).ok, true)
    data = await snapshot(); assert.equal(data.balances.find(a => a.accountId === usd)?.balanceCents, 92000)
    assert.equal(data.cards[0].statements.find(s => s.currency === 'USD')?.status, 'PAID')

    const billPayment = { ...payment, obligationKind: 'BILL', obligationId: bill, amount: '400' }
    assert.equal((await command('saveObligationPayment', billPayment)).ok, true)
    data = await snapshot(); assert.equal(data.bills.items[0].status, 'PARTIAL'); assert.equal(data.bills.items[0].paidCents, 20000)
    const billPaymentId = data.payments.find(p => p.obligationKind === 'BILL')!.id
    assert.equal((await command('saveObligationPayment', { ...billPayment, id: billPaymentId, amount: '1000' })).ok, true)
    data = await snapshot(); assert.equal(data.bills.items[0].status, 'PAID'); assert.equal(data.bills.items[0].expectedCents, 50000)
    assert.equal((await command('deleteObligationPayment', { id: billPaymentId })).ok, true)
    data = await snapshot(); assert.equal(data.bills.items[0].status, 'PENDING'); assert.equal(data.balances.find(a => a.accountId === uyu)?.balanceCents, 858000)
    const future = await snapshot(addMonthsKey(period, 1)); assert.equal(future.bills.items[0].paidCents, 0); assert.equal(future.dashboard.cards.totalCents, 0)
    const expenses = await call('movements', {}, tokens.accessToken)
    const expenseId = expenses.body.data.items.find((e: { merchant: string }) => e.merchant === 'Compra UYU').id
    assert.equal((await command('updateExpense', { id: expenseId, merchant: 'Compra editada', amount: '1000', currency: 'UYU', date: `${period}-01`, source: 'CREDIT_CARD', creditCardId: card, installments: '1' })).ok, true)
    assert.equal((await command('deleteExpense', { id: expenseId })).ok, true)
    const filtered = await call('movements?search=Compra%20USD&currency=USD', {}, tokens.accessToken)
    assert.equal(filtered.body.data.count, 1)
    const otherSnapshot = await call('snapshot', {}, otherToken)
    assert.equal(otherSnapshot.body.data.cards.length, 0, 'Aislamiento de usuarios')
    for (const path of ['/', '/tarjetas', '/cuentas', '/movimientos']) {
      const response = await fetch(`${base}${path}`, { headers: { Cookie: `rg_session=${webToken}` }, redirect: 'manual' })
      assert.equal(response.status, 200, `Web ${path}`)
      const html = await response.text()
      assert.ok(!html.includes('NEXT_REDIRECT'), 'Sesión web sigue funcionando')
    }
    const old = tokens
    const rotated = await call('auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken: old.refreshToken }) })
    assert.equal(rotated.response.status, 200); tokens = rotated.body.data
    assert.equal((await call('snapshot', {}, old.accessToken)).response.status, 401)
    assert.equal((await call('auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken: old.refreshToken }) })).response.status, 401)
    assert.equal((await call('auth/logout', { method: 'POST' }, tokens.accessToken)).response.status, 200)
    assert.equal((await call('snapshot', {}, tokens.accessToken)).response.status, 401)
    console.log('PASS: login, aislamiento, movimientos CRUD, pagos parciales/completos, edición/eliminación, monedas, cuentas, idempotencia, cambio de mes, web, renovación y revocación.')
  } finally {
    const ids = created.map(u => u.id)
    await prisma.obligationPayment.deleteMany({ where: { userId: { in: ids } } })
    await prisma.user.deleteMany({ where: { id: { in: ids }, email: { endsWith: '@example.invalid' } } })
    for (const user of created) {
      const key = createHmac('sha256', env.AUTH_SECRET).update(`${user.email}:${Math.floor(Date.now() / 900000)}`).digest('hex')
      await prisma.mobileLoginLimit.deleteMany({ where: { key } })
    }
    await prisma.$disconnect()
    console.log('Fixtures eliminados de dev-pagos. Sin cambios a registros personales ni a producción.')
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Falló la validación'); process.exitCode = 1 })
