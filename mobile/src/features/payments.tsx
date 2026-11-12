import { useRef, useState } from 'react'
import { Alert, Text, View } from 'react-native'
import { randomUUID } from 'expo-crypto'
import type { IndependentPayment } from '../../../src/lib/finance/obligations'
import { ApiError, command as execute } from '../services/api'
import { useFinance } from '../services/store'
import { Button, Card, Money, decimal, styles, colors } from '../components/ui'
import { openForm } from './navigation'

export function ActionButton({ title, command, fields, destructive = false }: { title: string; command: string; fields: Record<string,string>; destructive?: boolean }) {
  const { refresh } = useFinance()
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const attempt = useRef<{ key: string; body: string } | null>(null)
  const lock = useRef(false)
  const run = async () => {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    const body = JSON.stringify([command, fields])
    if (!attempt.current || attempt.current.body !== body) attempt.current = { key: randomUUID(), body }
    try { await execute(command, fields, attempt.current.key); attempt.current = null; await refresh() }
    catch (e) { setError((e as Error).message); if (e instanceof ApiError && e.code === 'VALIDATION') attempt.current = null }
    finally { lock.current = false; setBusy(false) }
  }
  return <><Button title={busy ? 'Procesando…' : title} secondary disabled={busy} onPress={() => destructive ? Alert.alert(title, 'Se recalcularán los saldos. ¿Querés continuar?', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Eliminar', style: 'destructive', onPress: () => void run() }]) : void run()} />{error ? <Text accessibilityRole="alert" style={{ color: colors.coral }}>{error}</Text> : null}</>
}
export function PaymentHistory({ payments }: { payments: (IndependentPayment & { note: string | null })[] }) {
  const { data } = useFinance()
  return <><Text style={styles.subtitle}>Historial de pagos</Text>{!payments.length && <Text style={styles.muted}>Todavía no hay pagos registrados en este período.</Text>}{payments.map(p => {
    const legacyCard = p.id.startsWith('legacy-card:'), legacyBill = p.id.startsWith('legacy-bill:')
    const id = p.id.replace(/^legacy-(card|bill):/, '')
    const account = data?.options.accounts.find(a => a.id === p.accountId)
    return <Card key={p.id}><View style={styles.row}><Money cents={p.amountCents} currency={p.currency} /><Text style={styles.muted}>{p.paidAt}</Text></View>
      <Text style={styles.muted}>{account?.name ?? 'Sin cuenta asociada'}{p.accountAmountCents !== null ? ` · Débito ${p.accountAmountCents / 100} ${account?.currency ?? ''}` : ''}{!p.debitAccount ? ' · Ya conciliado' : ''}{legacyBill || legacyCard ? ' · Histórico' : ''}</Text>
      {!legacyBill && <Button title="Editar pago" secondary onPress={() => openForm(legacyCard ? 'editLegacyCardPayment' : 'saveObligationPayment', { id, obligationId: p.obligationId, obligationKind: p.obligationKind ?? '', period: p.period ?? '', currency: p.currency ?? '', amount: decimal(p.amountCents), paidAt: p.paidAt, accountId: p.accountId ?? '', debitAccount: String(p.debitAccount), note: p.note ?? "" })} />}
      <ActionButton title="Eliminar pago" command={legacyCard ? 'deleteCardPayment' : legacyBill ? 'deleteLegacyBillPayment' : 'deleteObligationPayment'} fields={{ id }} destructive />
    </Card>
  })}</>
}
