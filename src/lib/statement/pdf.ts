import 'server-only'
import { extractText, getDocumentProxy } from 'unpdf'

/** Extrae texto de un PDF en memoria. El archivo no se persiste. */
export async function pdfToText(buffer: ArrayBuffer): Promise<{ text: string; pages: number }> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer))
  const { text, totalPages } = await extractText(pdf, { mergePages: true })
  return { text, pages: totalPages }
}

export function looksLikePdf(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer.slice(0, 5))
  return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46
}
