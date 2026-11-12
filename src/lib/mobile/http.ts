import { z } from 'zod'

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message) }
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'Vary': 'Authorization' } })
}

export async function endpoint(run: () => Promise<unknown>) {
  try { return json({ data: await run() }) }
  catch (error) {
    if (error instanceof ApiError) return json({ error: { code: error.code, message: error.message } }, error.status)
    if (error instanceof z.ZodError || error instanceof SyntaxError) return json({ error: { code: 'INVALID_INPUT', message: 'Revisá los datos ingresados.' } }, 400)
    // Nunca devolver errores de Prisma, conexiones o tokens al cliente.
    return json({ error: { code: 'SERVER_ERROR', message: 'No se pudo completar la operación. Volvé a intentarlo.' } }, 500)
  }
}

export async function readJson(request: Request) {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new ApiError(415, 'CONTENT_TYPE', 'Se requiere JSON.')
  const reader = request.body?.getReader()
  if (!reader) throw new ApiError(400, 'EMPTY_BODY', 'Faltan datos.')
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > 64 * 1024) { await reader.cancel(); throw new ApiError(413, 'BODY_TOO_LARGE', 'Demasiados datos.') }
    chunks.push(value)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}
