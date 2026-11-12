import { router } from 'expo-router'
export function openForm(command: string, values: Record<string, string> = {}) { router.push({ pathname: '/form', params: { command, values: JSON.stringify(values) } }) }
export function openDetail(kind: string, id = '') { router.push({ pathname: '/detail', params: { kind, id } }) }
