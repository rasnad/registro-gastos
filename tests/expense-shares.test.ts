import { describe, expect, it } from 'vitest'
import {
  applySharePercent,
  parseShareEntries,
  shareFieldName,
  shareOf,
  sharePercentFor,
} from '@/lib/finance/shares'

describe('reparto de gastos', () => {
  it('sin reparto cargado, el dueño asume el 100%', () => {
    expect(sharePercentFor([], 'yo')).toBe(100)
    expect(sharePercentFor(null, 'yo')).toBe(100)
    expect(sharePercentFor(undefined, 'yo')).toBe(100)
  })

  it('con reparto cargado usa el porcentaje de cada usuario', () => {
    const shares = [
      { userId: 'yo', sharePercent: 60 },
      { userId: 'otro', sharePercent: 40 },
    ]
    expect(sharePercentFor(shares, 'yo')).toBe(60)
    expect(sharePercentFor(shares, 'otro')).toBe(40)
    // Si hay reparto y no figuro, mi parte es 0 (lo asume otro).
    expect(sharePercentFor([{ userId: 'otro', sharePercent: 100 }], 'yo')).toBe(0)
  })

  it('`shareOf` devuelve 0 para quien no figura (sin aplicar el default del dueño)', () => {
    const shares = [{ userId: 'yo', sharePercent: 100 }]
    // Es lo que evita que el otro usuario arranque en 100% por defecto.
    expect(shareOf(shares, 'otro')).toBe(0)
    expect(shareOf(shares, 'yo')).toBe(100)
    expect(shareOf([], 'otro')).toBe(0)
    expect(shareOf(null, 'otro')).toBe(0)
    expect(shareOf(undefined, 'yo')).toBe(0)
  })

  it('calcula el importe de la parte en centavos enteros', () => {
    expect(applySharePercent(100_000, 100)).toBe(100_000)
    expect(applySharePercent(100_000, 50)).toBe(50_000)
    // 60% de 1.001 centavos = 600,6 → 601 (nunca se pierde ni se inventa un centavo)
    expect(applySharePercent(1_001, 60)).toBe(601)
    expect(applySharePercent(999, 33)).toBe(330)
    expect(applySharePercent(0, 50)).toBe(0)
  })

  it('arma el nombre del campo por usuario', () => {
    expect(shareFieldName('u1')).toBe('share_u1')
  })

  it('sin campos de reparto en el formulario no toca lo guardado', () => {
    expect(parseShareEntries([])).toEqual({ shares: null, error: null })
  })

  it('acepta un reparto que suma 100 y descarta los ceros', () => {
    const result = parseShareEntries([
      { userId: 'yo', raw: '60' },
      { userId: 'otro', raw: '40' },
      { userId: 'tercero', raw: '0' },
    ])
    expect(result.error).toBeNull()
    expect(result.shares).toEqual([
      { userId: 'yo', sharePercent: 60 },
      { userId: 'otro', sharePercent: 40 },
    ])
  })

  it('trata el campo vacío como 0', () => {
    const result = parseShareEntries([
      { userId: 'yo', raw: '100' },
      { userId: 'otro', raw: '' },
    ])
    expect(result.shares).toEqual([{ userId: 'yo', sharePercent: 100 }])
  })

  it('exige que la suma dé 100', () => {
    const result = parseShareEntries([
      { userId: 'yo', raw: '60' },
      { userId: 'otro', raw: '30' },
    ])
    expect(result.shares).toBeNull()
    expect(result.error).toContain('100')
    expect(result.error).toContain('90')
  })

  it('rechaza porcentajes con decimales o fuera de rango', () => {
    expect(parseShareEntries([{ userId: 'yo', raw: '66,5' }]).error).toContain('enteros')
    expect(parseShareEntries([{ userId: 'yo', raw: '120' }]).error).toContain('entre 0 y 100')
  })

  it('rechaza usuarios repetidos', () => {
    const result = parseShareEntries([
      { userId: 'yo', raw: '50' },
      { userId: 'yo', raw: '50' },
    ])
    expect(result.shares).toBeNull()
    expect(result.error).toContain('repetidos')
  })
})
