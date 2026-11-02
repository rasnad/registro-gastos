export type DefaultCategory = { name: string; icon: string; color: string }

/** Categorías iniciales (pedidas en el brief). "Sin categorizar" es explícita. */
export const DEFAULT_CATEGORIES: DefaultCategory[] = [
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
