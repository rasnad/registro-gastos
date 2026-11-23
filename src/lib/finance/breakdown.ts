/**
 * Reparto de gastos por categoría para la gráfica de torta.
 * Se calcula siempre por moneda: nunca se suman pesos con dólares.
 */

export type CategoryBreakdownRow = {
  categoryId: string | null
  name: string
  color: string | null
  cents: number
}

export type CategorySlice = {
  key: string
  label: string
  color: string
  cents: number
  /** Porcentaje con un decimal (0-100). */
  percent: number
  /** Rango acumulado en la torta, de 0 a 1. */
  from: number
  to: number
}

/** Paleta de la app: los colores de categoría son nombres, no hex. */
export const CATEGORY_COLORS: Record<string, string> = {
  mint: '#8fc7b0',
  lavender: '#b7a8d7',
  peach: '#e9a892',
  yellow: '#dcc07a',
  blue: '#9eb8d4',
  violet: '#c3b2dd',
  gray: '#c9c6c1',
}

const FALLBACK = ['#9886ba', '#8fc7b0', '#e9a892', '#9eb8d4', '#dcc07a', '#c9c6c1']

export function categoryColor(color: string | null | undefined, index = 0): string {
  if (color && CATEGORY_COLORS[color]) return CATEGORY_COLORS[color]
  return FALLBACK[index % FALLBACK.length]
}

/**
 * Ordena de mayor a menor y agrupa la cola en "Otras" para que la torta siga
 * siendo legible. Los importes en cero se descartan.
 */
export function categorySlices(rows: CategoryBreakdownRow[], max = 6): CategorySlice[] {
  const positive = rows.filter((row) => row.cents > 0).sort((a, b) => b.cents - a.cents)
  const total = positive.reduce((sum, row) => sum + row.cents, 0)
  if (total <= 0) return []

  const head = positive.slice(0, max)
  const tail = positive.slice(max)
  const groups = [...head]
  if (tail.length > 0) {
    groups.push({
      categoryId: null,
      name: 'Otras',
      color: 'gray',
      cents: tail.reduce((sum, row) => sum + row.cents, 0),
    })
  }

  let cursor = 0
  return groups.map((row, index) => {
    const from = cursor
    const share = row.cents / total
    cursor = index === groups.length - 1 ? 1 : from + share
    return {
      key: row.categoryId ?? `extra-${index}`,
      label: row.name,
      color: categoryColor(row.color, index),
      cents: row.cents,
      percent: Math.round(share * 1000) / 10,
      from,
      to: cursor,
    }
  })
}
