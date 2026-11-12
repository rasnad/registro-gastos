import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native'
import { Picker } from '@react-native-picker/picker'
import type { Movement, MovementPage } from '../../../../src/lib/mobile/contracts'
import { api } from '../../services/api'
import { useFinance } from '../../services/store'
import { Button, Card, Money, Screen, State, styles, colors, decimal } from '../../components/ui'
import { openForm } from '../../features/navigation'
import { ActionButton } from '../../features/payments'

export default function MovementsScreen() {
  const { period } = useFinance()
  return <Movements key={period} />
}
function Movements() {
  const store = useFinance()
  const [page, setPage] = useState(1), [search, setSearch] = useState(''), [status, setStatus] = useState(''), [currency, setCurrency] = useState(''), [source, setSource] = useState(''), [category, setCategory] = useState('')
  const [rows, setRows] = useState<MovementPage | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const load = useCallback(async (active: () => boolean) => {
    setBusy(true); setError('')
    const [y, m] = store.period.split('-').map(Number)
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
    const query = new URLSearchParams({ page: String(page), from: `${store.period}-01`, to: `${store.period}-${last}` })
    for (const [key, value] of Object.entries({ search, status, currency, source, categoryId: category })) if (value) query.set(key, value)
    try { const result = await api<MovementPage>(`movements?${query}`); if (active()) setRows(result) } catch (e) { if (active()) setError((e as Error).message) } finally { if (active()) setBusy(false) }
  }, [store.period, page, search, status, currency, source, category])
  useEffect(() => { let active = true; const timer = setTimeout(() => void load(() => active), 250); return () => { active = false; clearTimeout(timer) } }, [load, store.version])
  const filter = (setter: (v: string) => void, value: string) => { setter(value); setPage(1); setRows(null) }
  return <Screen title="Movimientos" month><Button title="＋ Nuevo movimiento" onPress={() => openForm('createExpense')} />
    <TextInput style={styles.input} placeholder="Buscar comercio" accessibilityLabel="Buscar comercio" value={search} onChangeText={v => filter(setSearch, v)} />
    <Picker accessibilityLabel="Estado" selectedValue={status} onValueChange={v => filter(setStatus, v)}><Picker.Item label="Todos los estados" value="" /><Picker.Item label="Por revisar" value="NEEDS_REVIEW" /><Picker.Item label="Confirmados" value="CONFIRMED" /></Picker>
    <View style={styles.row}><Picker style={{ flex: 1 }} accessibilityLabel="Moneda" selectedValue={currency} onValueChange={v => filter(setCurrency, v)}><Picker.Item label="Monedas" value="" /><Picker.Item label="UYU" value="UYU" /><Picker.Item label="USD" value="USD" /></Picker><Picker style={{ flex: 1 }} accessibilityLabel="Medio de pago" selectedValue={source} onValueChange={v => filter(setSource, v)}><Picker.Item label="Medios" value="" /><Picker.Item label="Cuenta" value="ACCOUNT" /><Picker.Item label="Tarjeta" value="CREDIT_CARD" /></Picker></View>
    <Picker accessibilityLabel="Categoría" selectedValue={category} onValueChange={v => filter(setCategory, v)}><Picker.Item label="Todas las categorías" value="" />{store.data?.options.categories.map(c => <Picker.Item key={c.id} label={c.name} value={c.id} />)}</Picker>
    {busy && <ActivityIndicator />}{error ? <Text style={{ color: colors.coral }}>{error}</Text> : null}
    {rows?.items.map(item => <MovementRow key={item.id} item={item} />)}
    {rows && !rows.items.length && <Text style={styles.muted}>No hay movimientos con estos filtros.</Text>}
    <View style={styles.row}><Button title="Anterior" secondary disabled={page === 1 || busy} onPress={() => setPage(p => p - 1)} /><Text style={styles.muted}>{page}</Text><Button title="Siguiente" secondary disabled={!rows?.hasNext || busy} onPress={() => setPage(p => p + 1)} /></View>
  </Screen>
}
function MovementRow({ item }: { item: Movement }) {
  const [expanded, setExpanded] = useState(false)
  return <Card><Pressable accessibilityRole="button" onPress={() => setExpanded(v => !v)}><View style={styles.row}><Text style={styles.subtitle}>{item.merchant}</Text><Money cents={item.amountCents} currency={item.currency} /></View><Text style={styles.muted}>{item.date} · {item.origin} · {item.installments} cuota(s)</Text><State value={item.status} /></Pressable>
    {expanded && <><Button title="Editar" secondary onPress={() => openForm('updateExpense', { id: item.id, merchant: item.merchant, amount: decimal(item.amountCents), currency: item.currency, date: item.date, source: item.source, accountId: item.accountId ?? '', creditCardId: item.creditCardId ?? '', categoryId: item.categoryId ?? '', installments: String(item.installments), notes: item.notes ?? '', description: item.description ?? '' })} />
      {item.status === 'NEEDS_REVIEW' && <ActionButton title="Confirmar movimiento" command="setExpenseStatus" fields={{ id: item.id, status: 'CONFIRMED' }} />}
      <ActionButton title="Eliminar movimiento" command="deleteExpense" fields={{ id: item.id }} destructive />
    </>}
  </Card>
}
