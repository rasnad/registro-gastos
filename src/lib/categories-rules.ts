/**
 * Sugerencia de categoría por nombre de comercio (reglas, sin IA).
 * Se usa en la carga manual, en la importación de resúmenes y en Gmail.
 * Si no hay coincidencia clara devuelve null: la app muestra "Sin categorizar"
 * en lugar de adivinar.
 */

export function normalizeMerchantName(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Quita prefijos de pasarelas de pago para mostrar un nombre legible. */
export function cleanMerchantName(raw: string): string {
  return raw
    .replace(/^merpago\s*\*\s*/i, '')
    .replace(/^dlo\s*\*\s*/i, '')
    .replace(/^paypal\s*\*\s*/i, '')
    .replace(/^bamboo\s*\*\s*/i, '')
    .replace(/^google\s*\*\s*/i, 'GOOGLE ')
    .replace(/\s*\*\s*/g, ' ')
    .replace(/\bN\?/g, 'N°')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

type Rule = { category: string; keywords: string[] }

/**
 * El orden importa: primero los casos específicos (Uber Eats es Delivery,
 * no Transporte; Mercado Libre es Compras, no Comida).
 * Un espacio al final de la palabra exige límite de palabra.
 */
const RULES: Rule[] = [
  {
    category: 'Delivery',
    keywords: ['pedidosya', 'pedidos ya', 'rappi', 'glovo', 'uber eats', 'delivery', 'mcdelivery'],
  },
  {
    category: 'Transporte',
    keywords: ['uber', 'cabify', 'taxi', 'stm', 'boleto', 'ancap', 'nafta', 'shell', 'petrobras', 'peaje', 'combustible', 'estacion de servicio'],
  },
  {
    category: 'Cuentas',
    keywords: [
      'ute', 'ose', 'antel', 'claro', 'movistar', 'internet', 'tributaria', 'patente', 'seguro',
      'netflix', 'spotify', 'openai', 'chatgpt', 'render.com', 'playstation', 'apple', 'amazon prime',
      'suscrip', 'deepseek', 'deepseer', 'google',
    ],
  },
  {
    category: 'Casa',
    keywords: ['alquiler', 'ferreteria', 'ferrofertas', 'sodimac', 'homecenter', 'easy', 'mueble', 'colchon', 'bazar', 'deco', 'pintureria', 'electricidad', 'sanitaria'],
  },
  {
    category: 'Comida',
    keywords: [
      'disco', 'devoto', 'tata', 'tienda inglesa', 'super', 'supermercado', 'mercado ', 'almacen',
      'panaderia', 'cafeteria', 'cafe', 'molienda', 'candy', 'dulce', 'heladeria', 'rotiseria',
      'fiambreria', 'pizzeria', 'sushi', 'parrilla', 'restaurant', 'confiteria', 'pasteleria',
      'verduleria', 'carniceria',
    ],
  },
  {
    category: 'Salidas',
    keywords: ['bar ', 'pub', 'cine', 'teatro', 'birra', 'cerveza', 'trago', 'boliche', 'libreria'],
  },
  {
    category: 'Compras',
    keywords: ['mercadolibre', 'mercado libre', 'tienda', 'shop', 'zara', 'nike', 'adidas', 'amazon', 'clicshop', 'amvstore', '21import', 'goldsky', 'golsky'],
  },
  {
    category: 'Otras',
    keywords: ['farmacia', 'club', 'gimnasio', 'curso', 'educacion', 'universidad', 'lpu', 'medasul', 'divino'],
  },
]

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Devuelve el nombre de una categoría por defecto, o null si no hay match claro.
 */
export function suggestCategoryName(merchant: string): string | null {
  const haystack = ` ${normalizeMerchantName(merchant)} `
  for (const rule of RULES) {
    for (const keyword of rule.keywords) {
      const requiresBoundary = keyword.endsWith(' ')
      const needle = normalizeMerchantName(keyword)
      if (!needle) continue
      if (requiresBoundary) {
        const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(needle)}([^a-z0-9]|$)`)
        if (pattern.test(haystack)) return rule.category
      } else if (haystack.includes(needle)) {
        return rule.category
      }
    }
  }
  return null
}
