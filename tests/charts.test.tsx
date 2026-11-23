import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SavingsChart } from '@/components/finance/savings-chart'
import { CategoryDonut } from '@/components/finance/category-donut'
import { categorySlices } from '@/lib/finance/breakdown'

describe('gráfica de evolución del ahorro', () => {
  const points = [
    { period: '2026-09', realCents: 550_000, plannedCents: 560_000 },
    { period: '2026-10', realCents: 620_000, plannedCents: 620_000 },
    { period: '2026-11', realCents: 420_000, plannedCents: 680_000 },
  ]

  it('dibuja la línea real y la esperada con etiquetas de mes', () => {
    const html = renderToStaticMarkup(
      <SavingsChart points={points} currency="UYU" plannedLabel="Según objetivos" />,
    )
    expect(html).toContain('<svg')
    expect(html).toContain('stroke-dasharray="5 5"')
    expect(html).toContain('Según objetivos')
    // Muestra el último valor real, no el esperado.
    expect(html).toContain('AHORRO EN UYU')
    expect(html).toContain('set')
  })

  it('pide más datos si hay un solo mes', () => {
    const html = renderToStaticMarkup(
      <SavingsChart points={[points[0]]} currency="UYU" plannedLabel="Según objetivos" />,
    )
    expect(html).toContain('al menos dos meses')
    expect(html).not.toContain('<svg')
  })
})

describe('torta por categoría', () => {
  const rows = [
    { categoryId: 'c1', name: 'Comida', color: 'mint', cents: 60_000 },
    { categoryId: 'c2', name: 'Casa', color: 'lavender', cents: 40_000 },
  ]

  it('dibuja un tramo por categoría con su porcentaje en la leyenda', () => {
    const html = renderToStaticMarkup(
      <CategoryDonut
        slices={categorySlices(rows)}
        currency="UYU"
        totalCents={100_000}
        label="Último mes"
      />,
    )
    expect(html).toContain('<circle')
    expect(html).toContain('Comida')
    expect(html).toContain('60%')
    expect(html).toContain('Casa')
    expect(html).toContain('40%')
  })

  it('muestra un estado vacío cuando no hay gastos', () => {
    const html = renderToStaticMarkup(
      <CategoryDonut slices={[]} currency="UYU" totalCents={0} label="Último mes" />,
    )
    expect(html).toContain('Sin gastos')
  })
})
