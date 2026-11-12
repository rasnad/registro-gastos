import { Text, View } from 'react-native'
import { useFinance } from '../../services/store'
import { Button, Card, Money, Screen, styles } from '../../components/ui'
import { openForm } from '../../features/navigation'
export default function Home() {
  const { data } = useFinance()
  return <Screen title="Inicio" month>{data && <>
    <Card><Text style={styles.muted}>Disponible después de compromisos · UYU</Text><Money hero cents={data.dashboard.availableAfterCommitmentsCents} /><View style={styles.row}><Text style={styles.text}>Saldo actual</Text><Money cents={data.dashboard.currentBalanceUyuCents} /></View>
      {data.dashboard.warnings.map(warning => <Text key={warning} style={styles.muted}>{warning}</Text>)}
    </Card>
    <Button title="＋ Registrar movimiento" onPress={() => openForm('createExpense')} />
    <Card><Text style={styles.subtitle}>Compromisos pendientes</Text><View style={styles.row}><Text style={styles.text}>Tarjetas</Text><Money cents={data.dashboard.cards.remainingCents} /></View><View style={styles.row}><Text style={styles.text}>Cuentas fijas</Text><Money cents={data.dashboard.bills.remainingCents} /></View></Card>
    {data.balances.map(account => <Card key={account.accountId}><View style={styles.row}><Text style={styles.text}>{account.name}</Text><Money cents={account.balanceCents} currency={account.currency} /></View></Card>)}
    <Text style={styles.subtitle}>Próximos vencimientos</Text>
    {data.overview.upcoming.slice(0, 8).map(item => <Card key={item.id}><Text style={styles.subtitle}>{item.title}</Text><View style={styles.row}><Text style={styles.muted}>{item.dueDate}{item.estimated ? ' · Estimado' : ''}</Text><Money cents={item.amountCents} currency={item.currency} /></View></Card>)}
    {!data.overview.upcoming.length && <Text style={styles.muted}>No hay vencimientos pendientes.</Text>}
  </>}</Screen>
}
