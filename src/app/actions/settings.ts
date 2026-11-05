'use server'

import 'server-only'
import { prisma } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { parseAmountInput } from '@/lib/money'
import { revalidateFinance } from '@/lib/revalidate'
import { str } from '@/lib/validation'
import type { ActionState } from '@/lib/action-state'

/**
 * Cotización del dólar usada para pagar obligaciones USD desde una cuenta en
 * pesos. No convierte ni suma monedas en los reportes: sólo define cuánto sale
 * de la cuenta cuando se registra ese pago.
 */
export async function updateUsdRate(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  const rateCents = parseAmountInput(str(formData, 'rate'))
  if (rateCents === null || rateCents < 100 || rateCents > 1_000_000) {
    return { error: 'Ingresá una cotización válida (ej. 41 o 41,35).' }
  }

  await prisma.user.update({ where: { id: user.id }, data: { usdRateCents: rateCents } })
  revalidateFinance()
  return { ok: true, message: `Cotización guardada: $U ${(rateCents / 100).toFixed(2)} por dólar.` }
}
