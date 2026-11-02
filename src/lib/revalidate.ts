import { revalidatePath } from 'next/cache'

/** Invalida las vistas afectadas por un cambio de datos financieros. */
export function revalidateFinance() {
  for (const path of [
    '/',
    '/movimientos',
    '/tarjetas',
    '/proyeccion',
    '/ahorro',
    '/cuentas',
    '/ajustes',
  ]) {
    revalidatePath(path)
  }
}
