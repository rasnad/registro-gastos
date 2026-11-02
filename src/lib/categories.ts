import 'server-only'
import { prisma } from '@/lib/db'

/** Categorías iniciales (pedidas en el brief). "Sin categorizar" es explícita. */
export const DEFAULT_CATEGORIES: Array<{ name: string; icon: string; color: string }> = [
  { name: 'Compras', icon: 'bag', color: 'violet' },
  { name: 'Cuentas', icon: 'receipt', color: 'blue' },
  { name: 'Comida', icon: 'fork', color: 'mint' },
  { name: 'Casa', icon: 'home', color: 'lavender' },
  { name: 'Salidas', icon: 'glass', color: 'peach' },
  { name: 'Delivery', icon: 'scooter', color: 'yellow' },
  { name: 'Transporte', icon: 'car', color: 'blue' },
  { name: 'Otras', icon: 'dots', color: 'gray' },
  { name: 'Sin categorizar', icon: 'help', color: 'gray' },
]

export async function ensureDefaultCategories(userId: string) {
  const existing = await prisma.category.count({ where: { userId } })
  if (existing > 0) return
  await prisma.category.createMany({
    data: DEFAULT_CATEGORIES.map((category) => ({
      userId,
      name: category.name,
      icon: category.icon,
      color: category.color,
      isSystem: category.name === 'Sin categorizar',
    })),
    skipDuplicates: true,
  })
}
