import 'server-only'
import { extractTextItems, getDocumentProxy } from 'unpdf'
import type { PdfTextItem } from '@/lib/statement/layout'

/**
 * Extrae texto CON posiciones del PDF. El archivo se procesa en memoria y no
 * se persiste. Las coordenadas son necesarias para separar las columnas de
 * pesos y dólares de los resúmenes de tarjeta.
 */
export async function pdfToContent(buffer: ArrayBuffer): Promise<{
  pages: PdfTextItem[][]
  totalPages: number
}> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer))
  const { items, totalPages } = await extractTextItems(pdf)
  const pages: PdfTextItem[][] = items.map((page) =>
    page.map((item) => ({
      str: item.str,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
    })),
  )
  return { pages, totalPages }
}

export function looksLikePdf(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer.slice(0, 5))
  return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46
}
