import Link from 'next/link'
import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { loadFinanceData, loadFormOptions } from '@/lib/finance/data'
import { convertUsdToUyu, fromCents, formatMoney, formatRate, type CurrencyCode } from '@/lib/money'
import { APP_TIME_ZONE, dateLabel, monthLabel, toISODate, todayISO } from '@/lib/period'
import { Money, Alert, Badge, SectionHead, EmptyState } from '@/components/ui'
import { Icon, type IconName } from '@/components/icons'
import { Dialog } from '@/components/dialog'
import { AccountForm, AdjustmentForm, ExpenseForm, IncomeEditForm, IncomeForm } from '@/components/forms/money-forms'
import { CardForm, CategoryForm, MiniForm } from '@/components/forms/other-forms'
import { GmailSyncButton } from '@/components/gmail-sync'
import { updateUsdRate } from '@/app/actions/settings'
import { ActionForm } from '@/components/action-form'
import { deleteAdjustment, deleteIncome, toggleDefaultAccount, toggleIncome } from '@/app/actions/accounts'
import { deactivateCategory, deleteMerchantRule, restoreCategory } from '@/app/actions/categories'
import { disconnectGmail, dismissGmailMessage, resolveGmailMessage, updateGmailSettings } from '@/app/actions/gmail'
import { isGmailConfigured } from '@/lib/gmail/client'

export const metadata: Metadata = { title: 'Ajustes' }
export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Params = Promise<Record<string, string | string[] | undefined>>

function single(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : ''
}

const GMAIL_MESSAGES: Record<string, { tone: 'ok' | 'warn' | 'danger' | 'info'; text: string }> = {
  connected: { tone: 'ok', text: 'Gmail quedó conectado. Ya podés importar los avisos de consumo.' },
  denied: { tone: 'warn', text: 'No autorizaste el acceso a Gmail. Podés intentarlo de nuevo cuando quieras.' },
  error: { tone: 'danger', text: 'No se pudo completar la conexión con Google. Revisá las credenciales OAuth.' },
  invalid: { tone: 'danger', text: 'La respuesta de Google llegó incompleta. Intentá conectar de nuevo.' },
  state: { tone: 'danger', text: 'La verificación de seguridad del flujo OAuth falló. Empezá de nuevo.' },
  unconfigured: {
    tone: 'warn',
    text: 'Faltan GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET o GOOGLE_REDIRECT_URI en las variables de entorno.',
  },
}

export default async function AjustesPage({ searchParams }: { searchParams: Params }) {
  const user = await requireUser()
  const params = await searchParams
  const gmailStatus = single(params.gmail)

  const [data, options, accounts, incomes, cardRows, categories, rules, connection, messages, syncLogs, imports] =
    await Promise.all([
      loadFinanceData(user.id, { months: 6 }),
      loadFormOptions(user.id),
      prisma.account.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } }),
      prisma.income.findMany({
        where: { userId: user.id },
        orderBy: [{ isActive: 'desc' }, { startDate: 'desc' }],
        include: { account: true },
      }),
      prisma.creditCard.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } }),
      prisma.category.findMany({ where: { userId: user.id }, orderBy: [{ isActive: 'desc' }, { name: 'asc' }] }),
      prisma.merchantRule.findMany({
        where: { userId: user.id },
        include: { category: true },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      }),
      prisma.gmailConnection.findUnique({ where: { userId: user.id } }),
      prisma.processedGmailMessage.findMany({
        where: { connection: { userId: user.id }, status: 'NEEDS_REVIEW' },
        orderBy: { receivedAt: 'desc' },
        take: 20,
      }),
      prisma.syncLog.findMany({ where: { userId: user.id }, orderBy: { startedAt: 'desc' }, take: 5 }),
      prisma.statementImport.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 5 }),
    ])

  const today = todayISO()
  const usage = await prisma.expense.groupBy({
    by: ['categoryId'],
    where: { userId: user.id, status: { not: 'DISCARDED' } },
    _count: { _all: true },
  })
  const usageByCategory = new Map(usage.map((row) => [row.categoryId, row._count._all]))
  const balanceByAccount = new Map(data.balances.map((row) => [row.accountId, row.balanceCents]))
  const gmailConfigured = isGmailConfigured()
  const gmailActive = connection?.status === 'ACTIVE' && Boolean(connection.refreshToken)

  return (
    <div className="settings-layout">
      <nav className="settings-nav" aria-label="Secciones de ajustes">
        <a href="#cuentas">Cuentas y saldos</a>
        <a href="#ingresos">Ingresos</a>
        <a href="#tarjetas">Tarjetas</a>
        <a href="#categorias">Categorías</a>
        <a href="#preferencias">Preferencias</a>
        <a href="#importaciones">Resúmenes importados</a>
        <a href="#gmail">Conexión con Gmail</a>
        <a href="#privacidad">Privacidad</a>
      </nav>

      <div className="stack">
        {gmailStatus && GMAIL_MESSAGES[gmailStatus] ? (
          <Alert tone={GMAIL_MESSAGES[gmailStatus].tone}>{GMAIL_MESSAGES[gmailStatus].text}</Alert>
        ) : null}

        <section className="panel settings-section" id="cuentas">
          <SectionHead
            title="Cuentas y saldos"
            note="El saldo inicial es el punto de partida. Los movimientos se descuentan desde esa fecha."
            action={
              <div className="row" style={{ gap: 6 }}>
                <Dialog label="Nueva cuenta" icon="plus" buttonClassName="secondary-button small-button" title="Nueva cuenta">
                  <AccountForm />
                </Dialog>
                <Dialog label="Ajuste manual" icon="edit" buttonClassName="ghost-button small-button" title="Ajuste de saldo" description="Queda registrado con su motivo.">
                  <AdjustmentForm accounts={options.accounts} />
                </Dialog>
              </div>
            }
          />
          {accounts.length === 0 ? (
            <EmptyState title="Sin cuentas registradas">Cargá el saldo inicial de tu cuenta bancaria, efectivo o billetera.</EmptyState>
          ) : (
            <div className="stack-sm">
              {accounts.map((account) => (
                <div className="list-row" key={account.id}>
                  <span className="category-icon lavender">
                    <Icon name={account.kind === 'CASH' ? 'wallet' : account.kind === 'WALLET' ? 'coins' : 'bank'} size={16} />
                  </span>
                  <div className="item-main">
                    <strong>
                      {account.name} {!account.isActive ? <Badge tone="neutral">Inactiva</Badge> : null}{' '}
                      {account.isDefault ? <Badge tone="info">Predeterminada</Badge> : null}
                    </strong>
                    <small>
                      {account.currency} · saldo inicial {formatMoney(Math.round(Number(account.openingBalance) * 100), account.currency)} desde{' '}
                      {toISODate(account.openingDate)}
                    </small>
                  </div>
                  <div className="item-amount">
                    <strong>
                      <Money cents={balanceByAccount.get(account.id) ?? 0} currency={account.currency} />
                    </strong>
                    <span className="paid">Saldo actual</span>
                  </div>
                  <div className="actions">
                    <MiniForm
                      action={toggleDefaultAccount}
                      hidden={{ id: account.id }}
                      label={account.isDefault ? 'Quitar predeterminada' : 'Usar por defecto'}
                      className="ghost-button small-button"
                    />
                    <Dialog label="Editar" icon="edit" buttonClassName="ghost-button small-button" title={`Editar ${account.name}`}>
                      <AccountForm
                        defaults={{
                          id: account.id,
                          name: account.name,
                          kind: account.kind,
                          currency: account.currency,
                          openingBalance: fromCents(Math.round(Number(account.openingBalance) * 100)),
                          openingDate: toISODate(account.openingDate),
                          isActive: account.isActive,
                        }}
                      />
                    </Dialog>
                  </div>
                </div>
              ))}
            </div>
          )}

          {data.input.adjustments.length > 0 ? (
            <details className="disclosure" style={{ marginTop: 14 }}>
              <summary>
                <span>
                  <Icon name="clock" size={15} /> Ajustes registrados ({data.input.adjustments.length})
                </span>
                <Icon name="chevron" size={15} />
              </summary>
              <div className="disclosure-body">
                {data.input.adjustments.slice(0, 20).map((adjustment) => (
                  <div className="list-row" key={adjustment.id}>
                    <div className="item-main">
                      <strong>{adjustment.reason}</strong>
                      <small>
                        {adjustment.date} ·{' '}
                        {accounts.find((account) => account.id === adjustment.accountId)?.name ?? 'Cuenta'}
                      </small>
                    </div>
                    <div className="item-amount">
                      <strong>
                        <Money cents={adjustment.deltaCents} currency={adjustment.currency} signed />
                      </strong>
                    </div>
                    <MiniForm
                      action={deleteAdjustment}
                      hidden={{ id: adjustment.id }}
                      label="Eliminar"
                      className="ghost-button small-button"
                      confirmMessage="¿Eliminar este ajuste?"
                    />
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </section>

        <section className="panel settings-section" id="ingresos">
          <SectionHead
            title="Ingresos"
            note="Los fijos mensuales se repiten; los variables se registran una sola vez."
            action={
              <Dialog label="Nuevo ingreso" icon="plus" buttonClassName="secondary-button small-button" title="Nuevo ingreso">
                <IncomeForm accounts={options.accounts} />
              </Dialog>
            }
          />
          {incomes.length === 0 ? (
            <EmptyState title="Sin ingresos registrados">Sin ingresos no se puede calcular cuánto podés ahorrar.</EmptyState>
          ) : (
            <div className="stack-sm">
              {incomes.map((income) => (
                <div className="list-row" key={income.id}>
                  <span className="category-icon mint">
                    <Icon name="arrowDown" size={16} />
                  </span>
                  <div className="item-main">
                    <strong>
                      {income.description} {!income.isActive ? <Badge tone="neutral">Inactivo</Badge> : null}
                    </strong>
                    <small>
                      {income.kind === 'FIXED' ? 'Fijo' : 'Variable'} ·{' '}
                      {income.recurrence ? 'mensual' : 'una vez'} · desde {toISODate(income.startDate)}
                      {income.account ? ` · ${income.account.name}` : ''}
                    </small>
                  </div>
                  <div className="item-amount">
                    <strong>
                      <Money cents={Math.round(Number(income.amount) * 100)} currency={income.currency} />
                    </strong>
                  </div>
                  <div className="actions">
                    <Dialog label="Editar" icon="edit" buttonClassName="ghost-button small-button" title="Editar ingreso">
                      <IncomeEditForm
                        income={{
                          id: income.id,
                          description: income.description,
                          amount: fromCents(Math.round(Number(income.amount) * 100)),
                          startDate: toISODate(income.startDate),
                          isActive: income.isActive,
                        }}
                      />
                    </Dialog>
                    <MiniForm
                      action={toggleIncome}
                      hidden={{ id: income.id }}
                      label={income.isActive ? 'Desactivar' : 'Activar'}
                      className="ghost-button small-button"
                    />
                    <MiniForm
                      action={deleteIncome}
                      hidden={{ id: income.id }}
                      label="Eliminar"
                      className="ghost-button small-button"
                      confirmMessage="¿Eliminar este ingreso?"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel settings-section" id="tarjetas">
          <SectionHead
            title="Tarjetas de crédito"
            note="Cierre y vencimiento definen el período de cada cuota."
            action={
              <Dialog label="Nueva tarjeta" icon="plus" buttonClassName="secondary-button small-button" title="Nueva tarjeta">
                <CardForm />
              </Dialog>
            }
          />
          {cardRows.length === 0 ? (
            <p className="hint">Sin tarjetas registradas.</p>
          ) : (
            <div className="stack-sm">
              {cardRows.map((card) => (
                <div className="list-row" key={card.id}>
                  <span className="category-icon blue">
                    <Icon name="card" size={16} />
                  </span>
                  <div className="item-main">
                    <strong>
                      {card.name} {!card.isActive ? <Badge tone="neutral">Inactiva</Badge> : null}
                    </strong>
                    <small>
                      Pesos y dólares · cierre día {card.closingDay} · vence día {card.dueDay}
                      {card.last4 ? ` · •••• ${card.last4}` : ''}
                    </small>
                  </div>
                  <div className="actions">
                    <Dialog label="Editar" icon="edit" buttonClassName="ghost-button small-button" title={`Editar ${card.name}`}>
                      <CardForm
                        defaults={{
                          id: card.id,
                          name: card.name,
                          last4: card.last4,
                          closingDay: card.closingDay,
                          dueDay: card.dueDay,
                          notes: card.notes,
                          isActive: card.isActive,
                        }}
                      />
                    </Dialog>
                    <Link href={`/ajustes/importar?tarjeta=${card.id}`} className="ghost-button small-button">
                      Importar resumen
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel settings-section" id="categorias">
          <SectionHead
            title="Categorías"
            note="Desactivar conserva el historial. Las reglas recuerdan la categoría por comercio."
            action={
              <Dialog label="Nueva categoría" icon="plus" buttonClassName="secondary-button small-button" title="Nueva categoría">
                <CategoryForm />
              </Dialog>
            }
          />
          <div className="stack-sm">
            {categories.map((category) => (
              <div className="list-row" key={category.id}>
                <span className={`category-icon ${category.color ?? 'gray'}`}>
                  <Icon name={(category.icon ?? 'dots') as IconName} size={15} />
                </span>
                <div className="item-main">
                  <strong>
                    {category.name}{' '}
                    {!category.isActive ? <Badge tone="neutral">Inactiva</Badge> : null}
                    {category.isSystem ? <Badge tone="info">Sistema</Badge> : null}
                  </strong>
                  <small>{usageByCategory.get(category.id) ?? 0} movimientos</small>
                </div>
                <div className="actions">
                  <Dialog label="Editar" icon="edit" buttonClassName="ghost-button small-button" title={`Editar ${category.name}`}>
                    <CategoryForm
                      defaults={{
                        id: category.id,
                        name: category.name,
                        icon: category.icon,
                        color: category.color,
                        isActive: category.isActive,
                      }}
                    />
                  </Dialog>
                  {category.isActive && !category.isSystem ? (
                    <MiniForm
                      action={deactivateCategory}
                      hidden={{ id: category.id }}
                      label="Desactivar"
                      className="ghost-button small-button"
                    />
                  ) : !category.isSystem ? (
                    <MiniForm
                      action={restoreCategory}
                      hidden={{ id: category.id }}
                      label="Reactivar"
                      className="ghost-button small-button"
                    />
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          {rules.length > 0 ? (
            <div className="form-section">
              <h3 className="section-title" style={{ marginBottom: 6 }}>
                Reglas por comercio
              </h3>
              <p className="hint" style={{ marginBottom: 8 }}>
                Se aplican como sugerencia al cargar un gasto. Nunca se asignan sin que lo veas.
              </p>
              <div className="stack-sm">
                {rules.map((rule) => (
                  <div className="list-row" key={rule.id}>
                    <div className="item-main">
                      <strong>{rule.pattern}</strong>
                      <small>
                        → {rule.category.name} · usada {rule.hits} vez{rule.hits === 1 ? '' : 'es'}
                      </small>
                    </div>
                    <MiniForm
                      action={deleteMerchantRule}
                      hidden={{ id: rule.id }}
                      label="Quitar"
                      className="ghost-button small-button"
                      confirmMessage="¿Quitar esta regla? No afecta los gastos ya registrados."
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section className="panel settings-section" id="preferencias">
          <SectionHead
            title="Cotización del dólar"
            note="Se usa para pagar resúmenes en dólares desde una cuenta en pesos"
          />
          <div className="form-section">
            <ActionForm action={updateUsdRate} submitLabel="Guardar cotización" compact>
              <div className="field-grid">
                <label className="field">
                  <span>Pesos por 1 dólar</span>
                  <input
                    className="input"
                    name="rate"
                    inputMode="decimal"
                    required
                    defaultValue={formatRate(user.usdRateCents)}
                    placeholder="41,00"
                  />
                  <span className="hint">
                    Ej. 41 o 41,35. No convierte tus saldos: sólo define cuántos pesos salen de la cuenta
                    cuando pagás un resumen en dólares.
                  </span>
                </label>
                <label className="field">
                  <span>Equivalente de ejemplo</span>
                  <input className="input" value={`US$ 100 = ${formatMoney(convertUsdToUyu(10_000, user.usdRateCents), 'UYU')}`} disabled />
                  <span className="hint">Se recalcula al guardar y se muestra en el formulario de pago.</span>
                </label>
              </div>
            </ActionForm>
          </div>
        </section>

        <section className="panel settings-section" id="importaciones">
          <SectionHead
            title="Resúmenes importados"
            note="El PDF no se guarda: sólo se conserva el resultado y una huella del archivo."
            action={
              <Link href="/ajustes/importar" className="secondary-button small-button">
                <Icon name="upload" size={14} /> Importar resumen
              </Link>
            }
          />
          {imports.length === 0 ? (
            <p className="hint">No importaste resúmenes todavía.</p>
          ) : (
            <div className="stack-sm">
              {imports.map((batch) => (
                <div className="list-row" key={batch.id}>
                  <span className="category-icon lavender">
                    <Icon name="receipt" size={15} />
                  </span>
                  <div className="item-main">
                    <strong>
                      {batch.period ? monthLabel(batch.period) : 'Sin período'} ·{' '}
                      {batch.creditCardId ? cardRows.find((card) => card.id === batch.creditCardId)?.name ?? 'Tarjeta' : 'Tarjeta'}
                    </strong>
                    <small>
                      {batch.rowsImported} importadas · {batch.needsReview} para revisar · {batch.source}
                      {batch.fileName ? ` · ${batch.fileName}` : ''}
                    </small>
                  </div>
                  <Badge tone={batch.status === 'IMPORTED' ? 'ok' : batch.status === 'FAILED' ? 'danger' : 'warn'}>
                    {batch.status === 'IMPORTED' ? 'Importado' : batch.status === 'FAILED' ? 'Falló' : 'Borrador'}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel settings-section" id="gmail">
          <SectionHead
            title="Conexión con Gmail"
            note="Sólo lectura de los avisos de consumo de Itaú. Nunca se envía ni se borra nada."
          />

          {!gmailConfigured ? (
            <Alert tone="warn" title="Faltan las credenciales de Google">
              Configurá <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code> y{' '}
              <code>GOOGLE_REDIRECT_URI</code> en las variables de entorno. El paso a paso está en el README.
            </Alert>
          ) : !gmailActive ? (
            <div className="stack-sm">
              {connection?.status === 'REVOKED' ? (
                <Alert tone="info">
                  Desconectaste Gmail. Los gastos ya importados siguen existiendo y los correos procesados se
                  recuerdan para no duplicarlos si volvés a conectar.
                </Alert>
              ) : null}
              {connection?.lastSyncError ? <Alert tone="danger">{connection.lastSyncError}</Alert> : null}
              <a href="/api/gmail/connect" className="primary-button" style={{ width: 'fit-content' }}>
                <Icon name="mail" size={16} /> Conectar mi cuenta de Gmail
              </a>
              <p className="hint">
                Permisos solicitados: <code>gmail.readonly</code> (leer mensajes), <code>openid</code> y{' '}
                <code>email</code> (saber qué cuenta conectaste). No se pide borrar, enviar ni administrar la cuenta.
              </p>
            </div>
          ) : (
            <div className="stack">
              <div className="list-row">
                <span className="category-icon mint">
                  <Icon name="mail" size={16} />
                </span>
                <div className="item-main">
                  <strong>{connection?.emailAddress}</strong>
                  <small>
                    Última sincronización:{' '}
                    {connection?.lastSyncAt ? connection.lastSyncAt.toISOString().slice(0, 16).replace('T', ' ') : 'nunca'}
                    {connection?.lastSyncStatus ? ` · ${connection.lastSyncStatus}` : ''}
                  </small>
                </div>
                <Badge tone={connection?.lastSyncStatus === 'ERROR' ? 'danger' : 'ok'}>Conectado</Badge>
              </div>

              {connection?.lastSyncError ? <Alert tone="danger">{connection.lastSyncError}</Alert> : null}

              <div className="form-section">
                <p className="hint" style={{ marginBottom: 10 }}>
                  Escucha correos desde el{' '}
                  <strong>
                    {connection
                      ? new Intl.DateTimeFormat('es-UY', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                          timeZone: APP_TIME_ZONE,
                        }).format(connection.importFrom)
                      : '-'}
                  </strong>
                  . No se importa nada anterior a la conexión.
                </p>
                <ActionForm action={updateGmailSettings} submitLabel="Guardar configuración" compact>
                  <label className="checkbox">
                    <input type="checkbox" name="autoSync" defaultChecked={connection?.autoSync} />
                    <span>Sincronización automática diaria (Vercel Cron)</span>
                  </label>
                </ActionForm>
              </div>

              <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                <GmailSyncButton />
                <MiniForm
                  action={disconnectGmail}
                  hidden={{}}
                  label="Desconectar Gmail"
                  className="danger-button small-button"
                  confirmMessage="¿Desconectar Gmail? Se borran los tokens guardados. Los gastos importados se mantienen."
                />
              </div>

              <div className="form-section">
                <h3 className="section-title" style={{ marginBottom: 6 }}>
                  Correos que necesitan revisión ({messages.length})
                </h3>
                {messages.length === 0 ? (
                  <p className="hint">No hay correos pendientes de revisión.</p>
                ) : (
                  <div className="stack-sm">
                    {messages.map((message) => {
                      const amountCents = message.amount ? Math.round(Number(message.amount) * 100) : null
                      return (
                        <div className="import-row needs-review" key={message.id}>
                          <div className="between" style={{ flexWrap: 'wrap', gap: 8 }}>
                            <div className="item-main">
                              <strong>{message.merchant ?? message.subject ?? 'Correo sin asunto'}</strong>
                              <small>
                                {message.fromAddress} ·{' '}
                                {message.receivedAt ? dateLabel(toISODate(message.receivedAt)) : 'sin fecha'}
                                {message.cardLast4 ? ` · tarjeta •••• ${message.cardLast4}` : ''}
                              </small>
                            </div>
                            <div className="item-amount">
                              {amountCents !== null && message.currency ? (
                                <strong>
                                  <Money cents={amountCents} currency={message.currency as CurrencyCode} />
                                </strong>
                              ) : (
                                <Badge tone="warn">Sin importe</Badge>
                              )}
                              <span className="estimated">Revisar</span>
                            </div>
                          </div>
                          {message.reason ? (
                            <p className="review-flag" style={{ marginTop: 6 }}>
                              <Icon name="warning" size={13} /> {message.reason}
                            </p>
                          ) : null}
                          <div className="row" style={{ marginTop: 8, gap: 6 }}>
                            {message.expenseId ? (
                              <>
                                <Link href={`/movimientos?editar=${message.expenseId}`} className="secondary-button small-button">
                                  Revisar gasto
                                </Link>
                                <MiniForm
                                  action={resolveGmailMessage}
                                  hidden={{ messageId: message.messageId }}
                                  label="Marcar resuelto"
                                  className="ghost-button small-button"
                                />
                              </>
                            ) : (
                              <Dialog
                                label="Crear gasto"
                                icon="plus"
                                buttonClassName="secondary-button small-button"
                                title="Crear gasto desde el correo"
                                description="Completá lo que falta. Nada se importa sin tu confirmación."
                              >
                                <ExpenseForm
                                  accounts={options.accounts}
                                  cards={options.cards}
                                  categories={options.categories}
                                  rules={options.rules}
                                  today={today}
                                  gmailMessageId={message.messageId}
                                  defaults={{
                                    merchant: message.merchant ?? '',
                                    amount: amountCents !== null ? fromCents(amountCents) : '',
                                    currency: (message.currency as CurrencyCode | null) ?? 'UYU',
                                    date: message.purchaseDate ? toISODate(message.purchaseDate) : today,
                                    source: message.cardType === 'DEBIT' ? 'ACCOUNT' : 'CREDIT_CARD',
                                    installments: message.installments ?? 1,
                                  }}
                                />
                              </Dialog>
                            )}
                            <MiniForm
                              action={dismissGmailMessage}
                              hidden={{ messageId: message.messageId }}
                              label="Descartar"
                              className="ghost-button small-button"
                              confirmMessage="¿Descartar este correo? No se volverá a revisar."
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="form-section">
                <h3 className="section-title" style={{ marginBottom: 6 }}>
                  Últimas sincronizaciones
                </h3>
                {syncLogs.length === 0 ? (
                  <p className="hint">Todavía no sincronizaste.</p>
                ) : (
                  <div className="stack-sm">
                    {syncLogs.map((log) => (
                      <div className="list-row" key={log.id}>
                        <div className="item-main">
                          <strong>
                            {log.kind} · {log.startedAt.toISOString().slice(0, 16).replace('T', ' ')}
                          </strong>
                          <small>
                            {log.imported} importados · {log.needsReview} para revisar · {log.skipped} omitidos ·{' '}
                            {log.errors} errores
                            {log.message ? ` · ${log.message.slice(0, 120)}` : ''}
                          </small>
                        </div>
                        <Badge tone={log.status === 'OK' ? 'ok' : log.status === 'ERROR' ? 'danger' : 'warn'}>
                          {log.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <p className="hint">
                Se guardan sólo los datos extraídos (comercio, importe, moneda, fecha, cuotas y últimos 4 dígitos) y
                el ID del mensaje para no reimportarlo. No se guarda el cuerpo completo del correo.
              </p>
            </div>
          )}
        </section>

        <section className="panel settings-section" id="privacidad">
          <SectionHead title="Privacidad y datos" note="Qué se guarda y qué no" />
          <div className="stack-sm">
            <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
              <Icon name="shield" size={17} />
              <p className="hint" style={{ flex: 1 }}>
                Todas las rutas requieren sesión. Cada consulta filtra por tu usuario: no hay endpoints públicos con
                datos financieros. Los tokens de Gmail se guardan cifrados con AES-256-GCM y nunca se envían al
                navegador.
              </p>
            </div>
            <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
              <Icon name="lock" size={17} />
              <p className="hint" style={{ flex: 1 }}>
                No se guardan archivos PDF ni el cuerpo de los correos. De los resúmenes se conserva la huella del
                archivo y las compras que confirmaste; de Gmail, los campos extraídos y el ID del mensaje.
              </p>
            </div>
            <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
              <Icon name="info" size={17} />
              <p className="hint" style={{ flex: 1 }}>
                El contenido de los correos se trata como no confiable: sólo se buscan patrones de texto y nunca se
                ejecutan instrucciones que aparezcan en un mensaje.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
