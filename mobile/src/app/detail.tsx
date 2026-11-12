import { useLocalSearchParams } from 'expo-router'
import { Text, View } from 'react-native'
import { useFinance } from '../services/store'
import { Button, Card, Money, Screen, State, decimal, styles } from '../components/ui'
import { openForm } from '../features/navigation'
import { ActionButton, PaymentHistory } from '../features/payments'

export default function Detail() {
  const { kind, id } = useLocalSearchParams<{ kind: string; id: string }>()
  const { data } = useFinance()
  if (!data) return <Screen title="Detalle"><Text style={styles.muted}>Cargando…</Text></Screen>
  if (kind === 'card') {
    const card = data.cards.find(c => c.id === id)
    if (!card) return <Screen title="Tarjeta"><Text>No se encontró la tarjeta.</Text></Screen>
    return <Screen title={card.name} month><Button title="Editar tarjeta" secondary onPress={() => openForm('updateCreditCard', { id, name: card.name, last4: card.last4 ?? "", notes: card.notes ?? "", isActive: card.isActive ? "on" : "", closingDay: String(card.closingDay), dueDay: String(card.dueDay) })} />
      {card.statements.map(statement => <Card key={statement.currency}><Text style={styles.muted}>Total del resumen · {statement.currency}</Text><Money hero cents={statement.totalCents} currency={statement.currency} /><State value={statement.status} />
        <View style={styles.row}><Text style={styles.text}>Pagado</Text><Money cents={statement.paidCents} currency={statement.currency} /></View><View style={styles.row}><Text style={styles.text}>Pendiente</Text><Money cents={statement.remainingCents} currency={statement.currency} /></View>
        {statement.remainingCents > 0 && <Button title="Registrar pago" onPress={() => openForm('saveObligationPayment', { obligationKind: 'CARD', obligationId: id, period: data.period, currency: statement.currency, amount: decimal(statement.remainingCents) })} />}
      </Card>)}
      <PaymentHistory payments={data.payments.filter(p => p.obligationKind === 'CARD' && p.obligationId === id && p.period === data.period)} />
      <Button title="＋ Nueva compra" secondary onPress={() => openForm('createExpense', { source: 'CREDIT_CARD', creditCardId: id })} />
      <Text style={styles.subtitle}>Cuotas de este resumen</Text>{data.installments.filter(i => i.cardId === id && i.period === data.period && i.expenseStatus !== 'DISCARDED').map(i => <Card key={i.id}><Text style={styles.text}>Cuota {i.number} de {i.count}</Text><Money cents={i.amountCents} currency={i.currency} /></Card>)}
    </Screen>
  }
  if (kind === 'bill') {
    const item = data.bills.items.find(item => item.bill.id === id)
    if (!item) return <Screen title="Cuenta fija" month><Text style={styles.muted}>Esta cuenta no corresponde al período seleccionado.</Text></Screen>
    const bill = item.bill
    return <Screen title={bill.name} month><Card><Money hero cents={item.expectedCents} currency={bill.currency} /><State value={item.status} /><Text style={styles.muted}>Vence {item.dueDate} · Tu parte: {bill.sharePercent}%{item.chargedToCard ? ' · Se paga en el resumen de tarjeta' : ''}</Text><Text style={styles.text}>Pagado: {item.paidCents / 100} · Pendiente: {item.remainingCents / 100}</Text></Card>
      {!item.chargedToCard && item.status !== 'PAID' && <Button title="Registrar pago" onPress={() => openForm('saveObligationPayment', { obligationKind: 'BILL', obligationId: id, currency: bill.currency, period: data.period, amount: decimal(item.balance.remainingCents), accountId: bill.accountId ?? '' })} />}
      <Button title="Registrar importe real del mes" secondary onPress={() => openForm('setBillActualAmount', { billId: id, period: data.period, amountActual: item.occurrence?.amountActualCents != null ? decimal(item.occurrence.amountActualCents) : '' })} />
      <PaymentHistory payments={data.payments.filter(p => p.obligationKind === 'BILL' && p.obligationId === id && p.period === data.period)} />
      <Button title="Editar cuenta fija" secondary onPress={() => openForm('updateBill', { id, name: bill.name, notes: data.billDefinitions.find(b => b.id === id)?.notes ?? "", currency: bill.currency, amountType: bill.amountType, amountFixed: bill.amountFixedCents == null ? '' : decimal(bill.amountFixedCents), amountMin: bill.amountMinCents == null ? '' : decimal(bill.amountMinCents), amountMax: bill.amountMaxCents == null ? '' : decimal(bill.amountMaxCents), frequency: bill.frequency, sharePercent: String(bill.sharePercent), dueDay: String(bill.dueDay), startDate: bill.startDate, endDate: bill.endDate ?? '', paymentSource: bill.paymentSource, accountId: bill.accountId ?? '', creditCardId: bill.creditCardId ?? '', categoryId: bill.categoryId ?? '', isActive: bill.isActive ? 'on' : '' })} />
      <ActionButton title="Eliminar cuenta fija" command="deleteBill" fields={{ id }} destructive />
    </Screen>
  }
  return <Screen title="Detalle"><Text>No se encontró el elemento.</Text></Screen>
}
