import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { ActivityIndicator } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StoreProvider, useFinance } from '../services/store'
import { colors } from '../components/ui'

function Navigation() {
  const { ready, signedIn } = useFinance()
  if (!ready) return <ActivityIndicator style={{ flex: 1 }} />
  return <Stack screenOptions={{ headerTintColor: colors.purple, headerShadowVisible: false, contentStyle: { backgroundColor: colors.bg } }}>
    <Stack.Protected guard={!signedIn}><Stack.Screen name="login" options={{ headerShown: false }} /></Stack.Protected>
    <Stack.Protected guard={signedIn}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="form" options={{ title: 'Registro', presentation: 'modal' }} />
      <Stack.Screen name="detail" options={{ title: 'Detalle' }} />
    </Stack.Protected>
  </Stack>
}
export default function Root() { return <SafeAreaProvider><StoreProvider><StatusBar style="dark" /><Navigation /></StoreProvider></SafeAreaProvider> }
