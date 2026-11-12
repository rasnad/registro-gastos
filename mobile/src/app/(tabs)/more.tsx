import { useState } from 'react'
import { Alert, Switch, Text, View } from 'react-native'
import { useFinance } from '../../services/store'
import { Button, Card, Money, Screen, decimal, styles } from '../../components/ui'
import { openForm } from '../../features/navigation'
import { ActionButton } from '../../features/payments'

export default function More() {
  const { data, includeSavings, setIncludeSavings, signOut } = useFinance()
  const [section, setSection] = useState('')
  return <Screen title="Más"><View style={styles.row}>{['Proyección','Ahorro','Ajustes','Gmail'].map(name => <Button key={name} title={name} secondary={section !== name} onPress={() => setSection(name)} />)}</View>
    {data && section === 'Proyección' && <><View style={styles.row}><Text style={styles.text}>Descontar ahorro programado</Text><Switch accessibilityLabel="Descontar ahorro programado" value={includeSavings} onValueChange={setIncludeSavings} /></View><Text style={styles.muted}>Proyección en pesos a la cotización configurada. Parte del saldo actual.</Text>
      {data.projections.slice(0, 6).map(flow => <Card key={flow.period}><Text style={styles.subtitle}>{flow.period}</Text><Text style={styles.muted}>Cierre proyectado</Text><Money cents={flow.endCents} /><Text style={styles.muted}>Ingresos {flow.incomeCents / 100} · Ahorro {flow.savingsCents / 100}</Text>{flow.missing.map(message => <Text style={styles.muted} key={message}>{message}</Text>)}</Card>)}
    </>}
    {data && section === 'Ahorro' && <><Button title="＋ Nuevo objetivo" onPress={() => openForm('createGoal')} />{data.goals.map(goal => <Card key={goal.id}><Text style={styles.subtitle}>{goal.name}</Text><Money cents={goal.targetCents} currency={goal.currency} /><Text style={styles.muted}>Meta {goal.targetDate} · Prioridad {goal.priority}</Text><Button title="Registrar aporte" onPress={() => openForm('addContribution', { goalId: goal.id })} /><Button title="Editar objetivo" secondary onPress={() => openForm('updateGoal', { id: goal.id, name: goal.name, currency: goal.currency, targetAmount: decimal(goal.targetCents), targetDate: goal.targetDate, monthlyTarget: goal.monthlyTargetCents == null ? '' : decimal(goal.monthlyTargetCents), priority: String(goal.priority) })} />{data.contributions.filter(c => c.goalId === goal.id).map(c => <View key={c.id} style={{ gap: 8 }}><Text style={styles.muted}>{c.date} · {c.amountCents / 100} {c.currency}</Text><ActionButton title="Eliminar aporte" command="deleteContribution" fields={{ id: c.id }} destructive /></View>)}</Card>)}</>}
    {data && section === 'Ajustes' && <>
      <Text style={styles.subtitle}>Cuentas e ingresos</Text><Button title="＋ Cuenta bancaria / efectivo" secondary onPress={() => openForm('createAccount')} /><Button title="＋ Ingreso" secondary onPress={() => openForm('createIncome')} />
      {data.balances.map(account => <Card key={account.accountId}><Text style={styles.text}>{account.name}</Text><Money cents={account.balanceCents} currency={account.currency} /><ActionButton title="Usar como predeterminada" command="toggleDefaultAccount" fields={{ id: account.accountId }} /></Card>)}
      {data.incomes.map(income => <Card key={income.id}><Text style={styles.subtitle}>{income.description}</Text><Money cents={income.amountCents} currency={income.currency} /><Text style={styles.muted}>{income.startDate} · {income.recurrence ?? 'Una vez'}</Text><Button title="Editar ingreso" secondary onPress={() => openForm('updateIncome', { id: income.id, description: income.description, amount: decimal(income.amountCents), startDate: income.startDate, isActive: income.isActive ? 'on' : '' })} /><ActionButton title="Eliminar ingreso" command="deleteIncome" fields={{ id: income.id }} destructive /></Card>)}
      <Button title={`Cotización: $U ${decimal(data.user.usdRateCents)}`} secondary onPress={() => openForm('updateUsdRate')} /><Button title="＋ Categoría" secondary onPress={() => openForm('createCategory')} />
    </>}
    {data && section === 'Gmail' && <Card><Text style={styles.subtitle}>{data.gmail?.emailAddress ?? 'Gmail sin conectar'}</Text><Text style={styles.muted}>{data.gmail?.status} · Última sincronización: {data.gmail?.lastSyncAt ?? 'Sin sincronizaciones'}</Text>
      {data.gmail ? <><ActionButton title="Sincronizar ahora" command="syncGmailNow" fields={{}} /><ActionButton title={data.gmail.autoSync ? 'Desactivar sincronización automática' : 'Activar sincronización automática'} command="updateGmailSettings" fields={{ autoSync: data.gmail.autoSync ? '' : 'on' }} /></> : null}
      <Text style={styles.muted}>La conexión y reconexión con Google se administran desde Ajustes en la web durante esta primera etapa.</Text>
    </Card>}
    <Button title="Cerrar sesión" secondary onPress={() => Alert.alert('Cerrar sesión', 'Se revocará esta sesión del iPhone.', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Cerrar sesión', onPress: () => { void signOut().catch(e => Alert.alert('No se pudo cerrar la sesión', (e as Error).message)) } }])} />
  </Screen>
}
