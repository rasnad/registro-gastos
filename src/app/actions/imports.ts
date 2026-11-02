'use server'

import 'server-only'
import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { fromCents, parseAmountInput } from '@/lib/money'
import { buildDedupeKey, findDuplicates } from '@/lib/finance/dedupe'
import {
  addMonthsKey,
  statementDueDate,
  statementPeriodForPurchase,
  toISODate,
  todayISO,
  type ISODate,
  type MonthKey,
} from '@/lib/period'
import { parseStatementText, type ParsedStatement, type StatementRow } from '@/lib/statement/parse'
import { looksLikePdf, pdfToText } from '@/lib/statement/pdf'
import type { ActionState } from '@/lib/action-state'

const MAX_BYTES = 10 * 1024 * 1024
const MAX_ROWS = 300

export type RowMatch = {
  expenseId: string
  confidence: 'exact' | 'likely' | 'possible'
  reasons: string[]
  date: string
  merchant: string
  amountCents: number
}

export type StatementPreview = {
  error?: string
  cardId?: string
  fileName?: string
  fileHash?: string
  meta?: ParsedStatement['meta']
  rows?: Array<StatementRow & { matches: RowMatch[] }>
}

/** Paso 1: leer el archivo (o texto pegado) y devolver una vista previa editable. */
export async function parseStatementPreview(formData: FormData): Promise<StatementPreview> {
  const user = await requireUser()
  const cardId = String(formData.get('cardId') ?? '')
  const card = await prisma.creditCard.findFirst({ where: { id: cardId, userId: user.id } })
  if (!card) return { error: 'Elegí una tarjeta válida antes de subir el resumen.' }

  const today = todayISO()
  let text = String(formData.get('text') ?? '').trim()
  let fileName: string | undefined
  let fileHash: string | undefined

  const file = formData.get('file')
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES) return { error: 'El archivo supera los 10 MB.' }
    const buffer = await file.arrayBuffer()
    if (!looksLikePdf(buffer)) return { error: 'El archivo no parece un PDF válido.' }
    fileHash = createHash('sha256').update(Buffer.from(buffer)).digest('hex')
    fileName = file.name.slice(0, 120)
    try {
      const extracted = await pdfToText(buffer)
      text = extracted.text
      if (!text.trim()) {
        return {
          error:
            'El PDF no contiene texto seleccionable (puede ser una imagen escaneada). Usá la carga manual o pegá el texto.',
        }
      }
    } catch {
      return { error: 'No pudimos leer el PDF. Probá con otro archivo o cargá los datos a mano.' }
    }
  }

  if (!text) return { error: 'Subí un PDF o pegá el texto del resumen.' }

  const parsed = parseStatementText(text, {
    today,
    currency: card.currency,
    card: { closingDay: card.closingDay, dueDay: card.dueDay },
  })

  const existingRows = await prisma.expense.findMany({
    where: { userId: user.id, status: { not: 'DISCARDED' } },
    select: {
      id: true, date: true, merchant: true, amount: true, currency: true, source: true,
      accountId: true, creditCardId: true, installments: true, origin: true, status: true,
    },
  })
  const existing = existingRows.map((row) => ({
    id: row.id,
    date: toISODate(row.date),
    merchant: row.merchant,
    amountCents: Math.round(Number(row.amount) * 100),
    currency: row.currency,
    source: row.source,
    accountId: row.accountId,
    creditCardId: row.creditCardId,
    installments: row.installments,
    origin: row.origin,
    status: row.status,
  }))

  const rows = parsed.rows.map((row) => {
    const matches =
      row.amountCents && row.currency
        ? findDuplicates(
            {
              date: row.date ?? today,
              amountCents: row.amountCents,
              merchant: row.merchant,
              currency: row.currency,
              source: 'CREDIT_CARD',
              creditCardId: card.id,
              installments: row.installments ?? 1,
            },
            existing,
          )
            .slice(0, 3)
            .map((match) => ({
              expenseId: match.expense.id,
              confidence: match.confidence,
              reasons: match.reasons,
              date: match.expense.date,
              merchant: match.expense.merchant,
              amountCents: match.expense.amountCents,
            }))
        : []

    return {
      ...row,
      // Si hay una coincidencia exacta, no se importa por defecto.
      include: matches.every((match) => match.confidence !== 'exact'),
      matches,
      currency: row.currency ?? card.currency,
    }
  })

  return {
    cardId: card.id,
    fileName,
    fileHash,
    meta: parsed.meta,
    rows,
  }
}

type ImportRowPayload = {
  date?: string | null
  merchant?: string
  amount?: string
  currency?: string
  installments?: number | string | null
  installmentNumber?: number | string | null
  period?: string | null
  include?: boolean
  confidence?: string
}

type ImportPayload = {
  cardId?: string
  period?: string | null
  closingDate?: string | null
  dueDate?: string | null
  totalAmount?: string | null
  fileName?: string | null
  fileHash?: string | null
  source?: 'PDF' | 'TEXT' | 'MANUAL'
  rows?: ImportRowPayload[]
}

function isISODate(value: unknown): value is ISODate {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function isMonthKey(value: unknown): value is MonthKey {
  return typeof value === 'string' && /^\d{4}-\d{2}$/.test(value)
}

/** Paso 2: importar sólo lo que el usuario confirmó. */
export async function confirmStatementImport(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  const raw = String(formData.get('payload') ?? '')
  if (!raw) return { error: 'No hay datos para importar.' }

  let payload: ImportPayload
  try {
    payload = JSON.parse(raw) as ImportPayload
  } catch {
    return { error: 'Los datos de la importación no son válidos.' }
  }

  const card = payload.cardId
    ? await prisma.creditCard.findFirst({ where: { id: payload.cardId, userId: user.id } })
    : null
  if (!card) return { error: 'La tarjeta no existe.' }

  const rows = Array.isArray(payload.rows) ? payload.rows.filter((row) => row.include !== false) : []
  if (rows.length === 0) return { error: 'No seleccionaste ninguna fila para importar.' }
  if (rows.length > MAX_ROWS) return { error: 'Demasiadas filas en una sola importación.' }

  const existingRows = await prisma.expense.findMany({
    where: { userId: user.id, status: { not: 'DISCARDED' } },
    select: {
      id: true, date: true, merchant: true, amount: true, currency: true, source: true,
      accountId: true, creditCardId: true, installments: true, origin: true, status: true,
    },
  })
  const existing = existingRows.map((row) => ({
    id: row.id,
    date: toISODate(row.date),
    merchant: row.merchant,
    amountCents: Math.round(Number(row.amount) * 100),
    currency: row.currency,
    source: row.source,
    accountId: row.accountId,
    creditCardId: row.creditCardId,
    installments: row.installments,
    origin: row.origin,
    status: row.status,
  }))

  const batch = await prisma.statementImport.create({
    data: {
      userId: user.id,
      creditCardId: card.id,
      period: isMonthKey(payload.period) ? payload.period : null,
      source: payload.source ?? 'PDF',
      status: 'DRAFT',
      closingDate: isISODate(payload.closingDate) ? new Date(`${payload.closingDate}T00:00:00.000Z`) : null,
      dueDate: isISODate(payload.dueDate) ? new Date(`${payload.dueDate}T00:00:00.000Z`) : null,
      totalAmount:
        payload.totalAmount && parseAmountInput(payload.totalAmount) !== null
          ? fromCents(parseAmountInput(payload.totalAmount)!)
          : null,
      currency: card.currency,
      fileName: payload.fileName?.slice(0, 120) ?? null,
      fileHash: payload.fileHash?.slice(0, 64) ?? null,
      rowsParsed: rows.length,
    },
  })

  let imported = 0
  let skipped = 0
  let needsReview = 0
  const errors: string[] = []

  for (const row of rows) {
    const merchant = (row.merchant ?? '').trim().slice(0, 200)
    const amountCents = parseAmountInput(row.amount ?? '')
    const currency = row.currency === 'USD' ? 'USD' : row.currency === 'UYU' ? 'UYU' : card.currency
    const count = Math.min(60, Math.max(1, Number(row.installments ?? 1) || 1))
    const installmentNumber = row.installmentNumber ? Math.max(1, Math.min(count, Number(row.installmentNumber))) : null
    const explicitPeriod = isMonthKey(row.period) ? row.period : null
    const date = isISODate(row.date) ? row.date : todayISO()

    if (!merchant) {
      errors.push('Una fila no tiene comercio y se omitió.')
      continue
    }
    if (amountCents === null || amountCents <= 0) {
      errors.push(`"${merchant}" no tiene un importe válido y se omitió.`)
      continue
    }
    if (currency !== card.currency) {
      errors.push(`"${merchant}" está en ${currency} y la tarjeta en ${card.currency}: no se convierte automáticamente.`)
      continue
    }

    const rowPeriod = explicitPeriod ?? statementPeriodForPurchase(date, card.closingDay, card.dueDay)

    // Si la línea es "cuota 3 de 6", el importe es la cuota: el total se estima.
    const isInstallmentLine = count > 1 && installmentNumber !== null
    const totalCents = isInstallmentLine ? amountCents * count : amountCents
    const firstPeriod = isInstallmentLine ? addMonthsKey(rowPeriod, -(installmentNumber! - 1)) : rowPeriod

    const dedupeKey = buildDedupeKey({
      date,
      amountCents: totalCents,
      merchant,
      currency,
      source: 'CREDIT_CARD',
      creditCardId: card.id,
      installments: count,
    })

    const duplicates = findDuplicates(
      {
        date,
        amountCents: totalCents,
        merchant,
        currency,
        source: 'CREDIT_CARD',
        creditCardId: card.id,
        installments: count,
      },
      existing,
    )
    const strong = duplicates.find((match) => match.confidence === 'exact' || match.confidence === 'likely')
    if (strong) {
      skipped += 1
      continue
    }

    const status = row.confidence === 'low' ? 'NEEDS_REVIEW' : 'CONFIRMED'
    if (status === 'NEEDS_REVIEW') needsReview += 1

    try {
      const expense = await prisma.$transaction(async (tx) => {
        const created = await tx.expense.create({
          data: {
            userId: user.id,
            date: new Date(`${date}T00:00:00.000Z`),
            merchant,
            description: count > 1 ? `${count} cuotas` : null,
            amount: fromCents(totalCents),
            currency,
            source: 'CREDIT_CARD',
            creditCardId: card.id,
            installments: count,
            origin: 'STATEMENT',
            status,
            isEstimated: isInstallmentLine || row.confidence !== 'high',
            statementImportId: batch.id,
            dedupeKey,
          },
        })

        await tx.cardInstallment.createMany({
          data: Array.from({ length: count }, (_, index) => {
            const period = addMonthsKey(firstPeriod, index)
            const alreadyPaid = isInstallmentLine && index < installmentNumber! - 1
            return {
              expenseId: created.id,
              cardId: card.id,
              number: index + 1,
              count,
              amount: fromCents(amountCents),
              currency,
              period,
              dueDate: new Date(`${statementDueDate(period, card.dueDay)}T00:00:00.000Z`),
              isPaid: alreadyPaid,
              paidAt: alreadyPaid ? new Date(`${date}T00:00:00.000Z`) : null,
              isEstimated: true,
            }
          }),
        })

        return created
      })

      existing.push({
        id: expense.id,
        date,
        merchant,
        amountCents: totalCents,
        currency,
        source: 'CREDIT_CARD',
        creditCardId: card.id,
        accountId: null,
        installments: count,
        origin: 'STATEMENT',
        status,
      })
      imported += 1
    } catch (error) {
      errors.push(
        `No se pudo importar "${merchant}": ${error instanceof Error ? error.message.slice(0, 120) : 'error desconocido'}`,
      )
    }
  }

  await prisma.statementImport.update({
    where: { id: batch.id },
    data: {
      status: errors.length > 0 && imported === 0 ? 'FAILED' : 'IMPORTED',
      rowsImported: imported,
      needsReview,
      importedAt: new Date(),
    },
  })

  for (const path of ['/', '/movimientos', '/tarjetas', '/proyeccion', '/ajustes']) {
    revalidatePath(path)
  }
  revalidatePath('/ajustes/importar')

  if (imported === 0 && errors.length > 0) {
    return { error: errors[0] }
  }

  return {
    ok: true,
    message: `Importadas ${imported} compra${imported === 1 ? '' : 's'}${skipped > 0 ? `, ${skipped} omitida${skipped === 1 ? '' : 's'} por duplicado` : ''}${needsReview > 0 ? `, ${needsReview} para revisar` : ''}.${errors.length > 0 ? ` ${errors.length} con problemas.` : ''}`,
  }
}

/** Evita que el texto del resumen quede en logs o en la base. */
export async function discardStatementBatch(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  const id = String(formData.get('id') ?? '')
  await prisma.statementImport.deleteMany({ where: { id, userId: user.id } })
  revalidatePath('/ajustes')
  return { ok: true }
}
