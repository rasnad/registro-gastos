import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { AppState } from 'react-native'
import type { MobileSnapshot } from '../../../src/lib/mobile/contracts'
import { api, login, logout, onSessionExpired, restoreSession } from './api'

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Montevideo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
function useStore() {
  const [ready, setReady] = useState(false)
  const [signedIn, setSignedIn] = useState(false)
  const [data, setData] = useState<MobileSnapshot | null>(null)
  const [period, setPeriod] = useState(today().slice(0, 7))
  const [includeSavings, setIncludeSavings] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  const sequence = useRef(0)
  const refresh = useCallback(async () => {
    if (!signedIn) return
    const request = ++sequence.current
    setLoading(true); setError('')
    try {
      const next = await api<MobileSnapshot>(`snapshot?period=${period}&includeSavings=${includeSavings}`)
      if (request === sequence.current) { setData(next); setVersion(v => v + 1) }
    } catch (e) { if (request === sequence.current) setError((e as Error).message) }
    finally { if (request === sequence.current) setLoading(false) }
  }, [signedIn, period, includeSavings])
  const restore = useCallback(async () => {
    setError('')
    try { setSignedIn(await restoreSession()) } catch (e) { setError((e as Error).message) }
    finally { setReady(true) }
  }, [])
  useEffect(() => {
    onSessionExpired(() => { sequence.current++; setSignedIn(false); setData(null) })
    // Sincroniza con Keychain; no deriva estado de props ni de otro estado React.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void restore()
    return () => onSessionExpired(() => {})
  }, [restore])
  useEffect(() => {
    // Consulta externa al cambiar usuario/período; loading pertenece a esa solicitud.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
  }, [refresh])
  useEffect(() => { const listener = AppState.addEventListener('change', state => { if (state === 'active') void refresh() }); return () => listener.remove() }, [refresh])
  return {
    ready, signedIn, data, loading, error, period, version, includeSavings, setIncludeSavings,
    setPeriod: (next: string) => { sequence.current++; setData(null); setPeriod(next) }, refresh, restore,
    signIn: async (email: string, password: string) => { await login(email, password); setSignedIn(true) },
    signOut: logout,
  }
}
const Store = createContext<ReturnType<typeof useStore> | null>(null)
export function StoreProvider({ children }: { children: ReactNode }) { const value = useStore(); return <Store.Provider value={value}>{children}</Store.Provider> }
export function useFinance() { const store = useContext(Store); if (!store) throw new Error('Missing store'); return store }
