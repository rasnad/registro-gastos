'use server'

import 'server-only'
import { prisma } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { ensureDefaultCategories } from '@/lib/categories'
import { revalidateFinance } from '@/lib/revalidate'
import { bool, optStr, str } from '@/lib/validation'
import type { ActionState } from '@/lib/action-state'

export async function createCategory(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  const name = str(formData, 'name')
  if (!name) return { error: 'Escribí el nombre de la categoría.' }

  const exists = await prisma.category.findFirst({ where: { userId: user.id, name } })
  if (exists) return { error: 'Ya existe una categoría con ese nombre.' }

  await prisma.category.create({
    data: {
      userId: user.id,
      name,
      icon: optStr(formData, 'icon') ?? 'dots',
      color: optStr(formData, 'color') ?? 'gray',
    },
  })
  revalidateFinance()
  return { ok: true }
}

export async function updateCategory(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  const id = str(formData, 'id')
  const category = await prisma.category.findFirst({ where: { id, userId: user.id } })
  if (!category) return { error: 'La categoría no existe.' }

  const name = str(formData, 'name')
  if (!name) return { error: 'Escribí el nombre de la categoría.' }

  await prisma.category.update({
    where: { id: category.id },
    data: {
      name,
      icon: optStr(formData, 'icon') ?? category.icon,
      color: optStr(formData, 'color') ?? category.color,
      isActive: formData.has('isActive') ? bool(formData, 'isActive') : category.isActive,
    },
  })
  revalidateFinance()
  return { ok: true }
}

/** Desactivar conserva el historial: los gastos siguen mostrando la categoría. */
export async function deactivateCategory(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  const id = str(formData, 'id')
  const category = await prisma.category.findFirst({ where: { id, userId: user.id } })
  if (!category) return { error: 'La categoría no existe.' }
  if (category.isSystem) return { error: 'La categoría "Sin categorizar" no se puede desactivar.' }

  await prisma.category.update({ where: { id: category.id }, data: { isActive: false } })
  revalidateFinance()
  return { ok: true }
}

export async function restoreCategory(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  const id = str(formData, 'id')
  const category = await prisma.category.findFirst({ where: { id, userId: user.id } })
  if (!category) return { error: 'La categoría no existe.' }
  await prisma.category.update({ where: { id: category.id }, data: { isActive: true } })
  revalidateFinance()
  return { ok: true }
}

export async function restoreDefaultCategories(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  void formData
  const count = await prisma.category.count({ where: { userId: user.id } })
  if (count > 0) return { error: 'Ya tenés categorías creadas.' }
  await ensureDefaultCategories(user.id)
  revalidateFinance()
  return { ok: true }
}

export async function deleteMerchantRule(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  const id = str(formData, 'id')
  const result = await prisma.merchantRule.deleteMany({ where: { id, userId: user.id } })
  if (result.count === 0) return { error: 'La regla no existe.' }
  revalidateFinance()
  return { ok: true }
}
