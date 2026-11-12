import { Pressable, Text, View } from 'react-native'
import { useFinance } from '../../services/store'
import { Button, Card, Money, Screen, State, styles } from '../../components/ui'
import { openDetail, openForm } from '../../features/navigation'
export default function Cards() {
  const { data } = useFinance()
  return <Screen title="Tarjetas" month><Button title="＋ Agregar tarjeta" secondary onPress={() => openForm('createCreditCard')} />
    {data?.cards.map(card => <Pressable key={card.id} accessibilityRole="button" accessibilityLabel={`Ver ${card.name}`} onPress={() => openDetail('card', card.id)}><Card>
      <Text style={styles.subtitle}>{card.name}</Text><Text style={styles.muted}>Cierre {card.closingDay} · Vence {card.dueDay}</Text>
      {card.statements.map(statement => <View key={statement.currency} style={{ gap: 8 }}><View style={styles.row}><Money cents={statement.totalCents} currency={statement.currency} /><State value={statement.status} /></View><Text style={styles.muted}>Pagado {statement.paidCents / 100} · Pendiente {statement.remainingCents / 100} {statement.currency}</Text></View>)}
    </Card></Pressable>)}
    {data && !data.cards.length && <Text style={styles.muted}>Agregá una tarjeta para registrar sus consumos.</Text>}
  </Screen>
}
