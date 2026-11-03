'use server'

import 'server-only'
import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { fromCents, parseAmountInput, type CurrencyCode } from '@/lib/money'
import { buildDedupeKey, findDuplicates, normalizeMerchant, type MatchConfidence } from '@/lib/finance/dedupe'
import { addMonthsKey, monthKeyOf, statementPeriodForPurchase, todayISO, type ISODate, type MonthKey } from '@/lib/period'
import { cleanMerchantName, suggestCategoryName } from '@/lib/categories-rules'
import { parseStatementText } from '@/lib/statement/parse'
import { parseStatementLayout } from '@/lib/statement/layout'
import { looksLikePdf, pdfToContent } from '@/lib/statement/pdf'
import type { ActionState } from '@/lib/action-state'

const MAX_BYTES = 10 * 1024 * 1024
const MAX_ROWS = 300

export type RowMatch = {
  expenseId: string
  confidence: MatchConfidence
  reasons: string[]
  date: string
  merchant: string
  amountCents: number
}

export type PreviewRow = {
  key: string
  date: string | null
  merchant: string
  amountCents: number | null
  currency: CurrencyCode
  installmentNumber: number | null
  installments: number | null
  period: MonthKey | null
  categoryId: string | null
  suggestedCategory: string | null
  confidence: 'high' | 'medium' | 'low'
  warnings: string[]
  include: boolean
  excludedReason?: string
  matches: RowMatch[]
}

export type StatementPreview = {
  error?: string
  cardId?: string
  fileName?: string
  fileHash?: string
  meta?: {
    closingDate: string | null
    dueDate: string | null
    nextClosingDate: string | null
    period: MonthKey | null
    reliability: 'baja' | 'media' | 'alta'
    warnings: string[]
    totals: { UYU: number | null; USD: number | null }
    cardLast4: string | null
    linesScanned: number
    excluded: number
  }
  rows?: PreviewRow[]
}

/** Paso 1: leer el archivo (o texto pegado) y devolver una vista previa editable. */
export async function parseStatementPreview(formData: FormData): Promise<StatementPreview> {
  const user = await requireUser()
  const cardId = String(formData.get('cardId') ?? '')
  const card = await prisma.creditCard.findFirst({ where: { id: cardId, userId: user.id } })
  if (!card) return { error: 'Elegí una tarjeta válida antes de subir el resumen.' }

  const today = todayISO()
  const explicitPeriod = /^\d{4}-\d{2}$/.test(String(formData.get('period') ?? ''))
    ? (String(formData.get('period')) as MonthKey)
    : null
  let text = String(formData.get('text') ?? '').trim()
  let fileName: string | undefined
  let fileHash: string | undefined

  const categories = await prisma.category.findMany({ where: { userId: user.id, isActive: true } })
  const categoryByName = new Map(categories.map((category) => [category.name, category.id]))

  let meta: NonNullable<StatementPreview['meta']> | null = null
  let rawRows: Array<{
    key: string
    date: string | null
    merchant: string
    amountCents: number | null
    currency: CurrencyCode
    installmentNumber: number | null
    installments: number | null
    period: MonthKey | null
    suggestedCategory: string | null
    confidence: 'high' | 'medium' | 'low'
    warnings: string[]
    include: boolean
    excludedReason?: string
  }> = []

  const file = formData.get('file')
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES) return { error: 'El archivo supera los 10 MB.' }
    const buffer = await file.arrayBuffer()
    if (!looksLikePdf(buffer)) return { error: 'El archivo no parece un PDF válido.' }
    fileHash = createHash('sha256').update(Buffer.from(buffer)).digest('hex')
    fileName = file.name.slice(0, 120)

    let pages
    try {
      const content = await pdfToContent(buffer)
      pages = content.pages
    } catch {
      return { error: 'No pudimos leer el PDF. Probá con otro archivo o cargá los datos a mano.' }
    }

    if (pages.every((page) => page.length === 0)) {
      return {
        error:
          'El PDF no contiene texto seleccionable (puede ser una imagen escaneada). Usá la carga manual o pegá el texto.',
      }
    }

    const layout = parseStatementLayout(pages, {
      today,
      statementPeriod: explicitPeriod,
      defaultCurrency: card.currency,
    })

    meta = {
      closingDate: layout.meta.closingDate,
      dueDate: layout.meta.dueDate,
      nextClosingDate: layout.meta.nextClosingDate,
      period: layout.meta.period,
      reliability: layout.meta.reliability,
      warnings: layout.meta.warnings,
      totals: layout.meta.totals,
      cardLast4: layout.meta.cardLast4,
      linesScanned: layout.meta.linesScanned,
      excluded: layout.meta.excluded,
    }

    rawRows = layout.rows.map((row) => ({
      key: row.key,
      date: row.date,
      merchant: row.merchant,
      amountCents: row.amountCents,
      currency: row.currency,
      installmentNumber: row.installmentNumber,
      installments: row.installments,
      period: row.period,
      suggestedCategory: row.categoryName,
      confidence: row.confidence,
      warnings: row.warnings,
      include: row.include,
      ...(row.excludedReason ? { excludedReason: row.excludedReason } : {}),
    }))
  } else {
    if (!text) return { error: 'Subí un PDF o pegá el texto del resumen.' }

    const parsed = parseStatementText(text, {
      today,
      currency: card.currency,
      card: { closingDay: card.closingDay, dueDay: card.dueDay },
    })

    const period = explicitPeriod ?? (parsed.meta.dueDate ? monthKeyOf(parsed.meta.dueDate) : null)
    meta = {
      closingDate: parsed.meta.closingDate,
      dueDate: parsed.meta.dueDate,
      nextClosingDate: null,
      period,
      reliability: parsed.meta.reliability,
      warnings: parsed.meta.warnings,
      totals: { UYU: parsed.meta.currency === 'UYU' ? parsed.meta.totalAmountCents : null, USD: parsed.meta.currency === 'USD' ? parsed.meta.totalAmountCents : null },
      cardLast4: null,
      linesScanned: parsed.meta.linesScanned,
      excluded: parsed.meta.linesSkipped,
    }

    rawRows = parsed.rows.map((row) => ({
      key: row.key,
      date: row.date,
      merchant: row.merchant,
      amountCents: row.amountCents,
      currency: row.currency ?? card.currency,
      installmentNumber: row.installmentNumber,
      installments: row.installments,
      period,
      suggestedCategory: suggestCategoryName(row.merchant),
      confidence: row.confidence,
      warnings: row.warnings,
      include: row.include,
    }))
  }

  const existingRows = await prisma.expense.findMany({
    where: { userId: user.id, status: { not: 'DISCARDED' } },
    select: {
      id: true, date: true, merchant: true, amount: true, currency: true, source: true,
      accountId: true, creditCardId: true, installments: true, origin: true, status: true,
    },
  })
  const existing = existingRows.map((row) => ({
    id: row.id,
    date: row.date.toISOString().slice(0, 10),
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

  const rows: PreviewRow[] = rawRows.map((row) => {
    const matches =
      row.amountCents && row.amountCents > 0
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

    const exactMatch = matches.some((match) => match.confidence === 'exact')
    const suggested = row.suggestedCategory
    return {
      ...row,
      merchant: cleanMerchantName(row.merchant),
      categoryId: suggested ? categoryByName.get(suggested) ?? null : null,
      include: row.include && !exactMatch,
      matches,
    }
  })

  rows.sort((first, second) => {
    if (first.date && second.date) return first.date < second.date ? 1 : first.date > second.date ? -1 : 0
    if (first.date) return -1
    if (second.date) return 1
    return 0
  })

  return {
    cardId: card.id,
    fileName,
    fileHash,
    meta,
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
  categoryId?: string | null
  include?: boolean
  confidence?: string
}

type ImportPayload = {
  cardId?: string
  period?: string | null
  closingDate?: string | null
  dueDate?: string | null
  totalAmount?: string | null
  totalUyu?: string | null
  totalUsd?: string | null
  fileName?: string | null
  fileHash?: string | null
  source?: 'PDF' | 'TEXT' | 'MANUAL'
  saveRules?: boolean
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

  const userCategories = await prisma.category.findMany({ where: { userId: user.id } })
  const categoryIds = new Set(userCategories.map((category) => category.id))

  const statementPeriod = isMonthKey(payload.period) ? payload.period : null

  const existingRows = await prisma.expense.findMany({
    where: { userId: user.id, status: { not: 'DISCARDED' } },
    select: {
      id: true, date: true, merchant: true, amount: true, currency: true, source: true,
      accountId: true, creditCardId: true, installments: true, origin: true, status: true,
    },
  })
  const existing = existingRows.map((row) => ({
    id: row.id,
    date: row.date.toISOString().slice(0, 10),
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
      period: statementPeriod,
      source: payload.source ?? 'PDF',
      status: 'DRAFT',
      closingDate: isISODate(payload.closingDate) ? new Date(`${payload.closingDate}T00:00:00.000Z`) : null,
      dueDate: isISODate(payload.dueDate) ? new Date(`${payload.dueDate}T00:00:00.000Z`) : null,
      totalAmount:
        payload.totalAmount && parseAmountInput(payload.totalAmount) !== null
          ? fromCents(parseAmountInput(payload.totalAmount)!)
          : null,
      totalUyu:
        payload.totalUyu && parseAmountInput(payload.totalUyu) !== null
          ? fromCents(parseAmountInput(payload.totalUyu)!)
          : null,
      totalUsd:
        payload.totalUsd && parseAmountInput(payload.totalUsd) !== null
          ? fromCents(parseAmountInput(payload.totalUsd)!)
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
  const rules = new Map<string, string>()

  for (const row of rows) {
    const merchant = cleanMerchantName((row.merchant ?? '').trim().slice(0, 200))
    const amountCents = parseAmountInput(row.amount ?? '')
    const currency: CurrencyCode = row.currency === 'USD' ? 'USD' : 'UYU'
    const rawCount = Math.min(60, Math.max(1, Number(row.installments ?? 1) || 1))
    const installmentNumber = row.installmentNumber
      ? Math.max(1, Math.min(rawCount, Number(row.installmentNumber)))
      : null
    const date = isISODate(row.date) ? row.date : todayISO()
    const categoryId = row.categoryId && categoryIds.has(row.categoryId) ? row.categoryId : null

    if (!merchant) {
      errors.push('Una fila no tiene comercio y se omitió.')
      continue
    }
    if (amountCents === null || amountCents <= 0) {
      errors.push(`"${merchant}" no tiene un importe válido y se omitió.`)
      continue
    }

    // Si el resumen dice "cuota 1/10", el importe es la cuota y el total se estima.
    const isInstallmentLine = rawCount > 1 && installmentNumber !== null
    const count = isInstallmentLine ? rawCount : rawCount
    const totalCents = isInstallmentLine ? amountCents * count : amountCents

    const rowPeriod =
      statementPeriod ??
      (isInstallmentLine
        ? monthKeyOf(date)
        : statementPeriodForPurchase(date, card.closingDay, card.dueDay))

    const firstPeriod = isInstallmentLine
      ? addMonthsKey(rowPeriod, -(installmentNumber! - 1))
      : rowPeriod

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
            categoryId,
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
              // En una compra en cuotas el importe real es el total estimado;
              // la cuota del resumen es el valor fiable.
              amount: fromCents(amountCents),
              currency,
              period,
              dueDate: new Date(`${period}-${String(Math.min(card.dueDay, 28)).padStart(2, '0')}T00:00:00.000Z`),
              isPaid: alreadyPaid,
              paidAt: alreadyPaid ? new Date(`${date}T00:00:00.000Z`) : null,
              isEstimated: true,
            }
          }),
        })

        if (categoryId) rules.set(normalizeMerchant(merchant), categoryId)

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

  if (payload.saveRules && rules.size > 0) {
    for (const [pattern, categoryId] of rules) {
      await prisma.merchantRule.upsert({
        where: { userId_pattern: { userId: user.id, pattern } },
        create: { userId: user.id, pattern, categoryId },
        update: { categoryId, hits: { increment: 1 } },
      })
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

export async function discardStatementBatch(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  const id = String(formData.get('id') ?? '')
  await prisma.statementImport.deleteMany({ where: { id, userId: user.id } })
  revalidatePath('/ajustes')
  return { ok: true }
}
