import { useRef, useState } from 'react'
import { useLocalSearchParams, router } from 'expo-router'
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { Picker } from '@react-native-picker/picker'
import { randomUUID } from 'expo-crypto'
import { useFinance } from '../services/store'
import { ApiError, command as execute } from '../services/api'
import { formConfig } from '../features/forms'
import { Button, colors, styles } from '../components/ui'

export default function FormScreen() {
  const { command = '', values = '{}' } = useLocalSearchParams<{ command: string; values: string }>()
  const { data, refresh } = useFinance()
  const config = data ? formConfig(command, data) : null
  const [fields, setFields] = useState<Record<string,string>>(() => ({ ...config?.defaults, ...JSON.parse(values) }))
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const attempt = useRef<{ key: string; body: string } | null>(null)
  const locked = useRef(false)
  if (!config || !config.fields.length) return <Text style={styles.text}>Actualizá los datos antes de continuar.</Text>
  const paymentSource = command === 'createBill' || command === 'updateBill' ? fields.paymentSource : fields.source
  const change = (key: string, value: string) => setFields(previous => ({ ...previous, [key]: value }))
  const submit = async () => {
    if (locked.current) return
    locked.current = true; setBusy(true); setError('')
    const body = JSON.stringify(fields)
    if (!attempt.current || attempt.current.body !== body) attempt.current = { key: randomUUID(), body }
    try { await execute(command, fields, attempt.current.key); await refresh(); router.back() }
    catch (e) { setError((e as Error).message); if (e instanceof ApiError && e.code === 'VALIDATION') attempt.current = null }
    finally { locked.current = false; setBusy(false) }
  }
  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <Text style={styles.title}>{config.title}</Text>
    {command.includes('Payment') && <Text style={styles.muted}>Período {fields.period ?? data?.period} · {fields.currency ?? 'moneda original'}. Los pagos en USD desde cuentas UYU usan la cotización de Ajustes.</Text>}
    {config.fields.filter(field => {
      if (field.key === 'creditCardId' || field.key === 'installments') return paymentSource === 'CREDIT_CARD'
      if (field.key === 'accountId' && !command.includes('Payment')) return paymentSource !== 'CREDIT_CARD'
      if (field.key === 'amountFixed') return fields.amountType === 'FIXED'
      if (field.key === 'amountMin' || field.key === 'amountMax') return fields.amountType === 'RANGE'
      return true
    }).map(field => <View key={field.key} style={{ gap: 6 }}>
      <Text style={styles.text}>{field.label}</Text>
      {field.options ? <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12 }}><Picker enabled={!busy} accessibilityLabel={field.label} selectedValue={fields[field.key] ?? ''} onValueChange={value => change(field.key, String(value))}>{field.options.map(option => <Picker.Item key={option.value} label={option.label} value={option.value} />)}</Picker></View>
        : field.kind === 'date' ? <DateTimePicker disabled={busy} value={new Date(`${fields[field.key] || data?.today}T12:00:00`)} mode="date" display="compact" locale="es-UY" onChange={(_, date) => { if (date) change(field.key, `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`) }} />
        : <TextInput editable={!busy} accessibilityLabel={field.label} style={styles.input} value={fields[field.key] ?? ''} onChangeText={value => change(field.key, value)} keyboardType={field.kind === 'money' ? 'decimal-pad' : field.kind === 'number' ? 'number-pad' : 'default'} />}
    </View>)}
    {error ? <Text accessibilityRole="alert" style={{ color: colors.coral }}>{error}</Text> : null}
    <Button title={busy ? 'Guardando…' : 'Guardar'} disabled={busy} onPress={() => void submit()} />
  </ScrollView></KeyboardAvoidingView>
}
