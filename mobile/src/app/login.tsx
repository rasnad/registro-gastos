import { useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFinance } from '../services/store'
import { Button, colors, styles } from '../components/ui'

export default function Login() {
  const store = useFinance()
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const submit = async () => { setBusy(true); setError(''); try { await store.signIn(email, password); setPassword('') } catch (e) { setError((e as Error).message) } finally { setBusy(false) } }
  return <SafeAreaView style={styles.screen}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { flexGrow: 1, justifyContent: 'center' }]}>
    <Text style={styles.title}>Registro de Gastos</Text><Text style={styles.muted}>Tus finanzas, en un solo lugar.</Text>
    <Text style={styles.text}>Email</Text><TextInput accessibilityLabel="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" style={styles.input} />
    <Text style={styles.text}>Contraseña</Text><TextInput accessibilityLabel="Contraseña" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" style={styles.input} onSubmitEditing={() => void submit()} />
    {error || store.error ? <Text accessibilityRole="alert" style={{ color: colors.coral }}>{error || store.error}</Text> : null}
    <Button title={busy ? 'Ingresando…' : 'Ingresar'} disabled={busy || !email || !password} onPress={() => void submit()} />
    {store.error ? <Button title="Recuperar sesión" secondary onPress={() => void store.restore()} /> : null}
  </ScrollView></KeyboardAvoidingView></SafeAreaView>
}
