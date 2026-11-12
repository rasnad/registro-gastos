import { Tabs } from 'expo-router'
import { Text } from 'react-native'
import { colors } from '../../components/ui'
export default function TabLayout() {
  return <Tabs screenOptions={{ headerTitle: 'Registro de Gastos', headerShadowVisible: false, tabBarActiveTintColor: colors.purple, tabBarStyle: { backgroundColor: colors.paper } }}>
    {([['index', 'Inicio', '⌂'], ['movements', 'Movimientos', '↕'], ['cards', 'Tarjetas', '▣'], ['bills', 'Cuentas', '☷'], ['more', 'Más', '•••']] as const).map(([name, title, icon]) => <Tabs.Screen key={name} name={name} options={{ title, tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 22 }}>{icon}</Text> }} />)}
  </Tabs>
}
