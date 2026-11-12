import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useFinance } from '../services/store'

export const colors = { bg: '#F8F8F6', paper: '#FFFFFF', ink: '#222239', muted: '#7D7B90', purple: '#554771', lavender: '#EEE9F6', mint: '#E3F1EB', coral: '#C56858', border: '#E9E6EC' }
export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg }, content: { padding: 20, gap: 16, paddingBottom: 40 },
  card: { backgroundColor: colors.paper, padding: 18, borderRadius: 20, borderWidth: 1, borderColor: colors.border, gap: 10 },
  title: { fontSize: 27, fontWeight: '700', color: colors.ink }, subtitle: { fontSize: 18, fontWeight: '600', color: colors.ink },
  text: { fontSize: 16, color: colors.ink }, muted: { fontSize: 13, color: colors.muted, lineHeight: 19 },
  hero: { fontSize: 34, fontWeight: '700', color: colors.ink }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  button: { minHeight: 46, backgroundColor: colors.purple, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  secondary: { backgroundColor: colors.lavender }, input: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.paper, borderRadius: 12, padding: 14, color: colors.ink, fontSize: 16, minHeight: 48 },
})
export function Button({ title, onPress, secondary = false, disabled = false }: { title: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress} style={[styles.button, secondary && styles.secondary, disabled && { opacity: 0.5 }]}><Text style={{ color: secondary ? colors.purple : 'white', fontWeight: '600', fontSize: 15 }}>{title}</Text></Pressable>
}
export function Card({ children }: { children: ReactNode }) { return <View style={styles.card}>{children}</View> }
export const money = (cents: number, currency = 'UYU') => new Intl.NumberFormat('es-UY', { style: 'currency', currency, maximumFractionDigits: 2 }).format(cents / 100)
export const decimal = (cents: number) => (cents / 100).toFixed(2)
export function Money({ cents, currency = 'UYU', hero = false }: { cents: number; currency?: string; hero?: boolean }) { return <Text style={[hero ? styles.hero : styles.subtitle, cents < 0 && { color: colors.coral }]}>{money(cents, currency)}</Text> }
export function State({ value }: { value: string }) { return <Text style={{ fontSize: 12, color: value === 'PAID' ? '#327864' : colors.purple, backgroundColor: value === 'PAID' ? colors.mint : colors.lavender, borderRadius: 8, padding: 6, alignSelf: 'flex-start' }}>{({ PAID: 'Pagada', PARTIAL: 'Pago parcial', PENDING: 'Pendiente', NEEDS_REVIEW: 'Por revisar', CONFIRMED: 'Confirmado' } as Record<string,string>)[value] ?? value}</Text> }
export function Screen({ title, children, month = false }: { title: string; children: ReactNode; month?: boolean }) {
  const store = useFinance()
  const move = (delta: number) => { const [y, m] = store.period.split('-').map(Number); const date = new Date(Date.UTC(y, m - 1 + delta, 1)); store.setPeriod(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`) }
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={store.loading} onRefresh={() => void store.refresh()} tintColor={colors.purple} />}>
    <Text accessibilityRole="header" style={styles.title}>{title}</Text>
    {month && <View style={styles.row}><Button title="‹ Anterior" secondary onPress={() => move(-1)} /><Text style={styles.text}>{store.period}</Text><Button title="Siguiente ›" secondary onPress={() => move(1)} /></View>}
    {store.error ? <Card><Text accessibilityRole="alert" style={{ color: colors.coral }}>{store.data ? 'Datos sin actualizar. ' : ''}{store.error}</Text><Button title="Reintentar" secondary onPress={() => void store.refresh()} /></Card> : null}
    {!store.data && store.loading ? <ActivityIndicator accessibilityLabel="Cargando datos" color={colors.purple} /> : null}
    {children}
  </ScrollView>
}
