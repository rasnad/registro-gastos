import { Pressable, Text, View } from 'react-native'
import { useFinance } from '../../services/store'
import { Button, Card, Money, Screen, State, styles } from '../../components/ui'
import { openDetail, openForm } from '../../features/navigation'
export default function Bills() {
  const { data } = useFinance()
  return <Screen title="Cuentas fijas" month><Button title="＋ Agregar cuenta fija" secondary onPress={() => openForm('createBill')} />
    {data && <Card>{(['UYU','USD'] as const).map(currency => <View key={currency} style={{ gap: 6 }}><View style={styles.row}><Text style={styles.muted}>Pagado · {currency}</Text><Money cents={data.bills.totals[currency].paidCents} currency={currency} /></View><View style={styles.row}><Text style={styles.muted}>Pendiente · {currency}</Text><Money cents={data.bills.totals[currency].remainingCents} currency={currency} /></View></View>)}</Card>}
    {data?.bills.items.map(item => <Pressable key={item.bill.id} accessibilityRole="button" accessibilityLabel={`Ver ${item.bill.name}`} onPress={() => openDetail('bill', item.bill.id)}><Card>
      <View style={styles.row}><Text style={styles.subtitle}>{item.bill.name}</Text><State value={item.status} /></View>
      <View style={styles.row}><Text style={styles.muted}>{item.dueDate}{item.bill.sharePercent < 100 ? ` · Tu parte ${item.bill.sharePercent}%` : ''}{!item.exact ? ' · Estimado' : ''}</Text><Money cents={item.expectedCents} currency={item.bill.currency} /></View>
    </Card></Pressable>)}
    {data && !data.bills.items.length && <Text style={styles.muted}>No hay cuentas para este período.</Text>}
  </Screen>
}
