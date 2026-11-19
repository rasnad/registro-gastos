/**
 * Reparto de un gasto entre usuarios registrados.
 *
 * Reglas de diseño:
 *  - El importe del gasto sigue siendo el total (lo que salió de la cuenta o
 *    del resumen). Acá sólo se registra qué parte asume cada usuario.
 *  - Sin filas de reparto, el gasto lo asume al 100% su dueño (`Expense.userId`).
 *    Así los gastos viejos y los que llegan del correo no necesitan migración.
 *  - Se guardan sólo los porcentajes mayores a cero, y la suma debe dar 100.
 */

export type ExpenseShareInput = { userId: string; sharePercent: number }

export const FULL_SHARE_PERCENT = 100

/** Nombre del campo del formulario para la parte de cada usuario. */
export function shareFieldName(userId: string): string {
  return `share_${userId}`
}

/**
 * Porcentaje guardado de un usuario. Devuelve 0 si no figura en el reparto
 * (a diferencia de `sharePercentFor`, no aplica el 100% por defecto del dueño).
 */
export function shareOf(
  shares: ExpenseShareInput[] | null | undefined,
  userId: string,
): number {
  const share = shares?.find((item) => item.userId === userId)
  return share ? share.sharePercent : 0
}

/**
 * Parte del usuario en el gasto.
 * Sin reparto cargado devuelve 100 (lo asume el dueño); si hay reparto, el
 * usuario que no figura asume 0.
 */
export function sharePercentFor(
  shares: ExpenseShareInput[] | null | undefined,
  userId: string,
): number {
  if (!shares || shares.length === 0) return FULL_SHARE_PERCENT
  return shareOf(shares, userId)
}

/** Importe de la parte del usuario, en centavos enteros. */
export function applySharePercent(cents: number, percent: number): number {
  return Math.round((cents * percent) / 100)
}

export type ShareParseResult = {
  /** null = el formulario no trae reparto: no hay que tocar lo que ya estaba. */
  shares: ExpenseShareInput[] | null
  error: string | null
}

/**
 * Valida el reparto que llega del formulario.
 * `entries` trae un valor crudo por usuario registrado ('' o el porcentaje).
 */
export function parseShareEntries(
  entries: Array<{ userId: string; raw: string }>,
): ShareParseResult {
  if (entries.length === 0) return { shares: null, error: null }

  const shares: ExpenseShareInput[] = []
  let total = 0

  for (const entry of entries) {
    const raw = entry.raw.trim()
    if (raw === '') continue
    if (!/^\d{1,3}$/.test(raw)) {
      return { shares: null, error: 'El reparto se carga en porcentajes enteros (por ejemplo 60 y 40).' }
    }
    const percent = Number(raw)
    if (percent < 0 || percent > 100) {
      return { shares: null, error: 'Cada porcentaje tiene que estar entre 0 y 100.' }
    }
    if (shares.some((item) => item.userId === entry.userId)) {
      return { shares: null, error: 'Hay usuarios repetidos en el reparto.' }
    }
    total += percent
    if (percent > 0) shares.push({ userId: entry.userId, sharePercent: percent })
  }

  if (total !== 100) {
    return {
      shares: null,
      error: `La suma del reparto tiene que dar 100% (ahora suma ${total}%).`,
    }
  }

  return { shares, error: null }
}
