import { describe, expect, it } from 'vitest'
import { categoryColor, categorySlices } from '@/lib/finance/breakdown'

const row = (name: string, cents: number, color: string | null = null) => ({
  categoryId: name.toLowerCase(),
  name,
  color,
  cents,
})

describe('reparto por categoría', () => {
  it('ordena de mayor a menor y calcula porcentajes', () => {
    const slices = categorySlices([row('Comida', 3000), row('Casa', 7000)], 6)
    expect(slices.map((slice) => slice.label)).toEqual(['Casa', 'Comida'])
    expect(slices.map((slice) => slice.percent)).toEqual([70, 30])
    expect(slices.map((slice) => [slice.from, slice.to])).toEqual([
      [0, 0.7],
      [0.7, 1],
    ])
  })

  it('descarta importes en cero o negativos y total vacío', () => {
    expect(categorySlices([row('Cero', 0), row('Negativo', -100)])).toEqual([])
    expect(categorySlices([])).toEqual([])
  })

  it('agrupa la cola en "Otras" para que la torta no se rompa', () => {
    const slices = categorySlices(
      [row('A', 5000), row('B', 3000), row('C', 1500), row('D', 500)],
      2,
    )
    expect(slices.map((slice) => slice.label)).toEqual(['A', 'B', 'Otras'])
    expect(slices[2].cents).toBe(2000)
    // El último tramo siempre cierra el círculo exacto.
    expect(slices[slices.length - 1].to).toBe(1)
  })

  it('usa el color de la categoría cuando existe', () => {
    const slices = categorySlices([row('Comida', 1000, 'mint')])
    expect(slices[0].color).toBe('#8fc7b0')
    // Color desconocido o nulo: cae en la paleta por posición.
    expect(categoryColor(null, 0)).toBe('#9886ba')
    expect(categoryColor('inexistente', 1)).toBe('#8fc7b0')
  })
})
