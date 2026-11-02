'use server'

import { redirect } from 'next/navigation'
import { login, registerFirstUser } from '@/lib/auth'
import type { ActionState } from '@/lib/action-state'

function safeNext(value: string | null): string {
  if (!value) return '/'
  if (!value.startsWith('/') || value.startsWith('//')) return '/'
  return value
}

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  if (!email || !password) return { error: 'Completá email y contraseña.' }

  const result = await login(email, password)
  if (result.error) return { error: result.error }

  redirect(safeNext(String(formData.get('next') ?? '/')))
}

export async function registerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const name = String(formData.get('name') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const confirm = String(formData.get('confirm') ?? '')

  if (!name || !email || !password) return { error: 'Completá todos los campos.' }
  if (password !== confirm) return { error: 'Las contraseñas no coinciden.' }

  const result = await registerFirstUser({ name, email, password })
  if (result.error) return { error: result.error }

  redirect('/')
}
