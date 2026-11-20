import 'server-only'
import { prisma } from '@/lib/db'
import { fromCents, formatRate } from '@/lib/money'
import { buildDedupeKey, findDuplicates, normalizeMerchant } from '@/lib/finance/dedupe'
import {
  dateInMonth,
  monthKeyOf,
  statementDueDate,
  statementPeriodForPurchase,
  toISODate,
  todayISO,
  type ISODate,
} from '@/lib/period'
import { decryptToken } from '@/lib/gmail/crypto'
import {
  extractMessageText,
  gmailForRefreshToken,
  senderMatchesAllowed,
} from '@/lib/gmail/client'
import { parseConsumptionEmail } from '@/lib/gmail/parser'
import { isTransferSubject, parseTransferEmail } from '@/lib/gmail/transfer-parser'
import { buildTransferExpense } from '@/lib/gmail/transfer-expense'

export type SyncResult = {
  ok: boolean
  imported: number
  skipped: number
  needsReview: number
  errors: number
  message: string
}

const MAX_MESSAGES_PER_SYNC = 120
// Avisos de consumo (tarjeta) y de transferencia realizada (débito desde una cuenta).
const QUERY_SUBJECT =
  'subject:("Aviso de consumo aprobado") OR subject:("Aviso de transferencia realizada")'

function headerValue(headers: Array<{ name?: string | null; value?: string | null }> | undefined, name: string) {
  return headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value ?? ''
}

function receivedDate(internalDate: string | null | undefined): ISODate | null {
  if (!internalDate) return null
  const ms = Number(internalDate)
  if (!Number.isFinite(ms)) return null
  return todayISO(new Date(ms))
}

export async function syncGmailForUser(userId: string): Promise<SyncResult> {
  const connection = await prisma.gmailConnection.findUnique({ where: { userId } })
  if (!connection) {
    return { ok: false, imported: 0, skipped: 0, needsReview: 0, errors: 0, message: 'Gmail no está conectado.' }
  }
  if (connection.status !== 'ACTIVE' || !connection.refreshToken) {
    return {
      ok: false,
      imported: 0,
      skipped: 0,
      needsReview: 0,
      errors: 0,
      message: 'La conexión con Gmail está desconectada. Volvé a conectar la cuenta.',
    }
  }

  const log = await prisma.syncLog.create({
    data: { userId, kind: 'GMAIL', status: 'RUNNING' },
  })

  let imported = 0
  let skipped = 0
  let needsReview = 0
  let errors = 0
  const errorMessages: string[] = []

  try {
    const refreshToken = decryptToken(connection.refreshToken)
    const gmail = gmailForRefreshToken(refreshToken)
    const since = connection.importFrom
    const after = since.toISOString().slice(0, 10).replace(/-/g, '/')

    const cards = await prisma.creditCard.findMany({ where: { userId, isActive: true } })
    const accounts = await prisma.account.findMany({ where: { userId, isActive: true } })
    // Cotización configurada para registrar las transferencias en dólares.
    const settings = await prisma.user.findUnique({ where: { id: userId }, select: { usdRateCents: true } })
    const usdRateCents = settings?.usdRateCents ?? 0
    const merchantRules = await prisma.merchantRule.findMany({
      where: { userId, category: { userId, isActive: true } },
      select: { pattern: true, categoryId: true },
    })
    const categoriesByMerchant = new Map(merchantRules.map(({ pattern, categoryId }) => [pattern, categoryId]))

    const existingRows = await prisma.expense.findMany({
      where: { userId, status: { not: 'DISCARDED' } },
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

    let pageToken: string | undefined
    let processed = 0
    const seen = new Set<string>()

    while (processed < MAX_MESSAGES_PER_SYNC) {
      const list = await gmail.users.messages.list({
        userId: 'me',
        q: `after:${after} (${QUERY_SUBJECT})`,
        maxResults: Math.min(100, MAX_MESSAGES_PER_SYNC - processed),
        pageToken,
      })

      const messages = list.data.messages ?? []
      if (messages.length === 0) break

      for (const item of messages) {
        if (!item.id || seen.has(item.id) || processed >= MAX_MESSAGES_PER_SYNC) continue
        seen.add(item.id)
        processed += 1

        const already = await prisma.processedGmailMessage.findUnique({
          where: { connectionId_messageId: { connectionId: connection.id, messageId: item.id } },
        })
        if (already) {
          skipped += 1
          continue
        }

        // No procesar nada anterior al momento en que se conectó Gmail.
        const listedInternalDate = item.internalDate ? Number(item.internalDate) : null
        if (listedInternalDate !== null && listedInternalDate < since.getTime()) {
          const received = receivedDate(item.internalDate ?? null)
          await prisma.processedGmailMessage.create({
            data: {
              connectionId: connection.id,
              messageId: item.id,
              receivedAt: received ? new Date(`${received}T00:00:00.000Z`) : null,
              status: 'SKIPPED_IRRELEVANT',
              reason: 'Anterior al momento en que conectaste Gmail.',
            },
          })
          skipped += 1
          continue
        }

        try {
          const message = await gmail.users.messages.get({
            userId: 'me',
            id: item.id,
            format: 'full',
          })
          const headers = message.data.payload?.headers ?? []
          const subject = headerValue(headers, 'subject')
          const from = headerValue(headers, 'from')
          const receivedAt = receivedDate(message.data.internalDate)
          const text = extractMessageText(message.data.payload)

          if (!senderMatchesAllowed(from)) {
            await prisma.processedGmailMessage.create({
              data: {
                connectionId: connection.id,
                messageId: item.id,
                threadId: message.data.threadId ?? null,
                subject: subject.slice(0, 200),
                fromAddress: from.slice(0, 200),
                receivedAt: receivedAt ? new Date(`${receivedAt}T00:00:00.000Z`) : null,
                status: 'SKIPPED_SENDER',
                reason: 'El remitente no pertenece a un dominio permitido.',
              },
            })
            skipped += 1
            continue
          }

          // Aviso de transferencia realizada: sale plata de una cuenta, sin tarjeta.
          if (isTransferSubject(subject)) {
            const transfer = parseTransferEmail(text, receivedAt)
            const { draft, reason } = buildTransferExpense({ parsed: transfer, usdRateCents })
            const messageData = {
              connectionId: connection.id,
              messageId: item.id,
              threadId: message.data.threadId ?? null,
              subject: subject.slice(0, 200),
              fromAddress: from.slice(0, 200),
              receivedAt: receivedAt ? new Date(`${receivedAt}T00:00:00.000Z`) : null,
              merchant: draft ? draft.merchant.slice(0, 200) : null,
              // El importe y la moneda del mensaje quedan como vinieron en el correo.
              amount: transfer.amountCents === null ? null : fromCents(transfer.amountCents),
              currency: transfer.currency,
              purchaseDate:
                draft?.purchaseDate ? new Date(`${draft.purchaseDate}T00:00:00.000Z`) : null,
              installments: 1,
              cardLast4: null,
              cardType: null,
            }

            if (!draft) {
              await prisma.processedGmailMessage.create({
                data: { ...messageData, status: 'NEEDS_REVIEW', reason },
              })
              needsReview += 1
              continue
            }

            const transferDate = draft.purchaseDate ?? receivedAt ?? todayISO()
            const sameCurrency = accounts.filter((account) => account.currency === draft.currency)
            // Sin certeza de la cuenta de origen se deja vacía en lugar de adivinar.
            const accountId = sameCurrency.length === 1 ? sameCurrency[0].id : null
            const fields = {
              date: transferDate,
              amountCents: draft.amountCents,
              merchant: draft.merchant,
              currency: draft.currency,
              source: 'ACCOUNT' as const,
              accountId,
              creditCardId: null,
              installments: 1,
            }

            const duplicates = findDuplicates(fields, existing)
            const transferDuplicate = duplicates.find(
              (match) => match.confidence === 'exact' || match.confidence === 'likely',
            )
            if (transferDuplicate) {
              await prisma.processedGmailMessage.create({
                data: {
                  ...messageData,
                  status: 'SKIPPED_DUPLICATE',
                  expenseId: transferDuplicate.expense.id,
                  reason: `Coincide con un gasto existente (${transferDuplicate.confidence}): ${transferDuplicate.reasons.join('; ')}`,
                },
              })
              skipped += 1
              continue
            }

            const transferReason = [
              draft.converted
                ? `Convertida a pesos con la cotización configurada ($U ${formatRate(usdRateCents)} por US$ 1).`
                : null,
              reason,
              'Confirmá la categoría y la cuenta de origen.',
            ]
              .filter(Boolean)
              .join(' ')

            const transferExpense = await prisma.$transaction(async (tx) => {
              const created = await tx.expense.create({
                data: {
                  userId,
                  date: new Date(`${transferDate}T00:00:00.000Z`),
                  merchant: draft.merchant,
                  description: null,
                  amount: fromCents(draft.amountCents),
                  currency: draft.currency,
                  categoryId: null,
                  source: 'ACCOUNT',
                  accountId,
                  creditCardId: null,
                  installments: 1,
                  notes: draft.notes,
                  origin: 'EMAIL',
                  status: 'NEEDS_REVIEW',
                  isEstimated: draft.converted || draft.purchaseDate === null,
                  gmailMessageId: item.id,
                  dedupeKey: buildDedupeKey(fields),
                },
              })

              await tx.processedGmailMessage.create({
                data: { ...messageData, status: 'NEEDS_REVIEW', expenseId: created.id, reason: transferReason },
              })

              return created
            })

            existing.push({
              id: transferExpense.id,
              date: transferDate,
              merchant: draft.merchant,
              amountCents: draft.amountCents,
              currency: draft.currency,
              source: 'ACCOUNT',
              accountId,
              creditCardId: null,
              installments: 1,
              origin: 'EMAIL',
              status: 'NEEDS_REVIEW',
            })
            needsReview += 1
            continue
          }

          const parsed = parseConsumptionEmail({ subject, text, receivedAt })
          if (!parsed.kind) {
            await prisma.processedGmailMessage.create({
              data: {
                connectionId: connection.id,
                messageId: item.id,
                threadId: message.data.threadId ?? null,
                subject: subject.slice(0, 200),
                fromAddress: from.slice(0, 200),
                receivedAt: receivedAt ? new Date(`${receivedAt}T00:00:00.000Z`) : null,
                status: 'SKIPPED_IRRELEVANT',
                reason: 'El asunto no corresponde a un aviso de consumo de Itaú.',
              },
            })
            skipped += 1
            continue
          }

          const baseData = {
            connectionId: connection.id,
            messageId: item.id,
            threadId: message.data.threadId ?? null,
            subject: subject.slice(0, 200),
            fromAddress: from.slice(0, 200),
            receivedAt: receivedAt ? new Date(`${receivedAt}T00:00:00.000Z`) : null,
            merchant: parsed.merchant?.slice(0, 200) ?? null,
            amount: parsed.amountCents === null ? null : fromCents(parsed.amountCents),
            currency: parsed.currency,
            purchaseDate: parsed.purchaseDate ? new Date(`${parsed.purchaseDate}T00:00:00.000Z`) : null,
            installments: parsed.installments,
            cardLast4: parsed.cardLast4,
            cardType: parsed.kind,
          }

          // Sin importe o moneda no se puede crear un gasto correcto.
          if (parsed.amountCents === null || !parsed.currency) {
            await prisma.processedGmailMessage.create({
              data: {
                ...baseData,
                status: 'NEEDS_REVIEW',
                reason: [...parsed.missing, ...parsed.warnings].join(' ') || 'Datos incompletos.',
              },
            })
            needsReview += 1
            continue
          }

          let creditCardId: string | null = null
          if (parsed.kind === 'CREDIT') {
            const card = parsed.cardLast4
              ? cards.find((item) => item.last4 === parsed.cardLast4)
              : cards.length === 1
                ? cards[0]
                : undefined
            if (!card) {
              await prisma.processedGmailMessage.create({
                data: {
                  ...baseData,
                  status: 'NEEDS_REVIEW',
                  reason: 'No se encontró una tarjeta que coincida con el correo. Creá la tarjeta y revisá el gasto.',
                },
              })
              needsReview += 1
              continue
            }
            creditCardId = card.id
          }

          const merchant = parsed.merchant ?? 'Consumo sin identificar'
          const merchantPattern = parsed.merchant ? normalizeMerchant(parsed.merchant) : ''
          const categoryId = merchantPattern ? categoriesByMerchant.get(merchantPattern) ?? null : null
          const purchaseDate = parsed.purchaseDate ?? receivedAt ?? todayISO()
          const currency = parsed.currency
          const source = parsed.kind === 'CREDIT' ? 'CREDIT_CARD' : 'ACCOUNT'
          const accountId = parsed.kind === 'DEBIT' && accounts.length === 1 ? accounts.find((a) => a.currency === currency)?.id ?? null : null
          const installments = parsed.kind === 'CREDIT' ? Math.max(1, Math.min(60, parsed.installments ?? 1)) : 1

          const dedupeKey = buildDedupeKey({
            date: purchaseDate,
            amountCents: parsed.amountCents,
            merchant,
            currency,
            source,
            accountId,
            creditCardId,
            installments,
          })

          const duplicates = findDuplicates(
            {
              date: purchaseDate,
              amountCents: parsed.amountCents,
              merchant,
              currency,
              source,
              accountId,
              creditCardId,
              installments,
            },
            existing,
          )
          const strong = duplicates.find((match) => match.confidence === 'exact' || match.confidence === 'likely')
          if (strong) {
            await prisma.processedGmailMessage.create({
              data: {
                ...baseData,
                status: 'SKIPPED_DUPLICATE',
                expenseId: strong.expense.id,
                reason: `Coincide con un gasto existente (${strong.confidence}): ${strong.reasons.join('; ')}`,
              },
            })
            skipped += 1
            continue
          }

          const status =
            parsed.confidence === 'high' && parsed.kind === 'CREDIT' ? 'CONFIRMED' : 'NEEDS_REVIEW'
          const reviewReason =
            parsed.confidence === 'high' && parsed.kind === 'CREDIT'
              ? null
              : [...parsed.missing, ...parsed.warnings].join(' ') || 'Verificá los datos antes de confirmar.'

          const card = creditCardId ? cards.find((item) => item.id === creditCardId) : null

          const expense = await prisma.$transaction(async (tx) => {
            const created = await tx.expense.create({
              data: {
                userId,
                date: new Date(`${purchaseDate}T00:00:00.000Z`),
                merchant,
                categoryId,
                description: parsed.installments ? `${parsed.installments} cuotas` : null,
                amount: fromCents(parsed.amountCents!),
                currency,
                source,
                accountId,
                creditCardId,
                installments,
                origin: 'EMAIL',
                status,
                isEstimated: parsed.dateFromEmail,
                gmailMessageId: item.id,
                dedupeKey,
              },
            })

            if (card) {
              const firstPeriod = statementPeriodForPurchase(purchaseDate, card.closingDay, card.dueDay)
              const basePart = Math.trunc(parsed.amountCents! / installments)
              const remainder = parsed.amountCents! - basePart * installments
              await tx.cardInstallment.createMany({
                data: Array.from({ length: installments }, (_, index) => {
                  const [year, month] = firstPeriod.split('-').map(Number)
                  const absolute = year * 12 + (month - 1) + index
                  const period = `${Math.floor(absolute / 12)}-${String((absolute % 12) + 1).padStart(2, '0')}`
                  return {
                    expenseId: created.id,
                    cardId: card.id,
                    number: index + 1,
                    count: installments,
                    amount: fromCents(index === installments - 1 ? basePart + remainder : basePart),
                    currency,
                    period,
                    dueDate: new Date(`${statementDueDate(period, card.dueDay)}T00:00:00.000Z`),
                    isEstimated: parsed.installments === null || parsed.dateFromEmail,
                  }
                }),
              })
            }

            await tx.processedGmailMessage.create({
              data: {
                ...baseData,
                status: status === 'CONFIRMED' ? 'IMPORTED' : 'NEEDS_REVIEW',
                expenseId: created.id,
                reason: reviewReason,
              },
            })

            return created
          })

          if (status === 'CONFIRMED') imported += 1
          else needsReview += 1
          existing.push({
            id: expense.id,
            date: purchaseDate,
            merchant,
            amountCents: parsed.amountCents,
            currency,
            source,
            accountId,
            creditCardId,
            installments,
            origin: 'EMAIL',
            status,
          })
        } catch (error) {
          // Otra sincronización pudo importar este mensaje en paralelo. La creación
          // del gasto y del marcador es atómica y la restricción única evita duplicarlo.
          if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
            skipped += 1
            continue
          }
          errors += 1
          const message = error instanceof Error ? error.message.slice(0, 160) : 'Error desconocido'
          errorMessages.push(message)
          try {
            await prisma.processedGmailMessage.create({
              data: {
                connectionId: connection.id,
                messageId: item.id,
                status: 'ERROR',
                reason: message,
              },
            })
          } catch {
            // Si falla el registro del error, se informa en el log de sincronización.
          }
        }
      }

      pageToken = list.data.nextPageToken ?? undefined
      if (!pageToken) break
    }

    const status = errors > 0 ? (imported + needsReview > 0 ? 'PARTIAL' : 'ERROR') : 'OK'
    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status,
        finishedAt: new Date(),
        imported,
        skipped,
        needsReview,
        errors,
        message: errorMessages.join(' | ').slice(0, 500) || null,
      },
    })
    await prisma.gmailConnection.update({
      where: { id: connection.id },
      data: {
        lastSyncAt: new Date(),
        lastSyncStatus: status,
        lastSyncError: errorMessages[0]?.slice(0, 400) ?? null,
      },
    })

    return {
      ok: errors === 0,
      imported,
      skipped,
      needsReview,
      errors,
      message:
        errors === 0
          ? `Sincronización completa: ${imported} importados, ${needsReview} para revisar, ${skipped} omitidos.`
          : `Sincronización parcial: ${imported} importados, ${needsReview} para revisar, ${errors} errores.`,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : 'Error de sincronización'
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: 'ERROR', finishedAt: new Date(), errors: errors + 1, message },
    })
    await prisma.gmailConnection.update({
      where: { id: connection.id },
      data: {
        lastSyncAt: new Date(),
        lastSyncStatus: 'ERROR',
        lastSyncError: message,
        ...(message.includes('invalid_grant') ? { status: 'ERROR' } : {}),
      },
    })
    return { ok: false, imported, skipped, needsReview, errors: errors + 1, message }
  }
}

/** Para el cron: sincroniza todas las conexiones activas con autoSync. */
export async function syncAllGmailUsers(): Promise<{ users: number; results: SyncResult[] }> {
  const connections = await prisma.gmailConnection.findMany({
    where: { status: 'ACTIVE', autoSync: true, refreshToken: { not: '' } },
    select: { userId: true },
  })
  const results: SyncResult[] = []
  for (const connection of connections) {
    results.push(await syncGmailForUser(connection.userId))
  }
  return { users: connections.length, results }
}

/** Cálculo auxiliar expuesto para la UI de revisión. */
export function suggestStatementPeriod(purchaseDate: ISODate, closingDay: number, dueDay: number) {
  const period = statementPeriodForPurchase(purchaseDate, closingDay, dueDay)
  return { period, dueDate: statementDueDate(period, dueDay), month: monthKeyOf(dateInMonth(period, 1)) }
}
