import * as SecureStore from 'expo-secure-store'
import type { TokenPair } from '../../../src/lib/mobile/contracts'

const base = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '')
const storageKey = 'registro-gastos.mobile-session.v1'
let session: TokenPair | null = null
let refreshing: Promise<void> | null = null
let onExpired = () => {}
export function onSessionExpired(callback: () => void) { onExpired = callback }
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message) }
}

async function send<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!base || (!base.startsWith('https://') && !(__DEV__ && base.startsWith('http://')))) throw new Error('Configurá EXPO_PUBLIC_API_URL con la URL del backend de desarrollo.')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)
  try {
    const response = await fetch(`${base}/api/mobile/v1/${path}`, { ...init, signal: controller.signal, headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session.accessToken}` } : {}), ...init.headers } })
    const body = await response.json()
    if (!response.ok) throw new ApiError(response.status, body.error?.code ?? 'HTTP_ERROR', body.error?.message ?? 'No se pudo completar la solicitud.')
    return body.data as T
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new Error('No se pudo conectar. Revisá tu conexión; los cambios no confirmados no se reenvían automáticamente.')
  } finally { clearTimeout(timeout) }
}

async function save(pair: TokenPair) {
  await SecureStore.setItemAsync(storageKey, JSON.stringify(pair), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY })
  session = pair
}
async function clear() { session = null; await SecureStore.deleteItemAsync(storageKey); onExpired() }
async function refresh() {
  if (!refreshing) refreshing = (async () => {
    if (!session) throw new ApiError(401, 'UNAUTHORIZED', 'Iniciá sesión.')
    try { await save(await send<TokenPair>('auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken: session.refreshToken }) })) }
    catch (error) { if (error instanceof ApiError && error.status === 401) await clear(); throw error }
  })().finally(() => { refreshing = null })
  return refreshing
}
export async function restoreSession() {
  const stored = await SecureStore.getItemAsync(storageKey)
  if (!stored) return false
  try { session = JSON.parse(stored) as TokenPair } catch { await clear(); return false }
  try { await refresh(); return true } catch (error) {
    if (error instanceof ApiError && error.status === 401) return false
    throw error
  }
}
export async function login(email: string, password: string) {
  await save(await send<TokenPair>('auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }))
}
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  try { return await send<T>(path, init) }
  catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401 || !session) throw error
    await refresh()
    return send<T>(path, init)
  }
}
export async function logout() { await api('auth/logout', { method: 'POST' }); await clear() }
export async function command(name: string, fields: Record<string, string>, key: string) {
  const result = await api<{ ok?: boolean; error?: string; message?: string }>('commands', { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify({ command: name, fields }) })
  if (result.error) throw new ApiError(422, 'VALIDATION', result.error)
  return result
}
