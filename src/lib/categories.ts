import 'server-only'
import { prisma } from '@/lib/db'
import { DEFAULT_CATEGORIES } from '@/lib/default-categories'

export { DEFAULT_CATEGORIES }

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
