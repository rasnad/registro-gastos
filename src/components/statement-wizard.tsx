'use client'

import Link from 'next/link'
import { Fragment, useActionState, useState } from 'react'
import {
  confirmStatementImport,
  parseStatementPreview,
  type PreviewRow,
  type StatementPreview,
} from '@/app/actions/imports'
import { fromCents, parseAmountInput } from '@/lib/money'
import { Icon } from '@/components/icons'
import { Badge, CategoryDot, Money } from '@/components/ui'
import { suggestCategoryName } from '@/lib/categories-rules'

type CardOption = { id: string; name: string; closingDay: number; dueDay: number }
type CategoryOption = {
  id: string
  name: string
  icon: string | null
  color: string | null
}

export function StatementWizard({
  cards,
  categories,
  defaultCardId,
  today,
}: {
  cards: CardOption[]
  categories: CategoryOption[]
  defaultCardId?: string
  today: string
}) {
  const [cardId, setCardId] = useState(defaultCardId ?? cards[0]?.id ?? '')
  const [mode, setMode] = useState<'pdf' | 'text' | 'manual'>('pdf')
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<StatementPreview | null>(null)
  const [rows, setRows] = useState<PreviewRow[]>([])
  const [period, setPeriod] = useState('')
  const [saveRules, setSaveRules] = useState(true)
  const [grouped, setGrouped] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [state, action, pending] = useActionState(confirmStatementImport, {})

  const card = cards.find((item) => item.id === cardId)
  const included = rows.filter((row) => row.include && !row.excludedReason)
  const excluded = rows.filter((row) => row.excludedReason)
  const isInstallmentRow = (row: PreviewRow) => (row.installments ?? 1) > 1
  const visibleEntries = rows
    .map((row, index) => ({ row, index }))
    .filter((entry) => !entry.row.excludedReason)
  const orderedEntries = grouped
    ? [
        ...visibleEntries.filter((entry) => !isInstallmentRow(entry.row)),
        ...visibleEntries.filter((entry) => isInstallmentRow(entry.row)),
      ]
    : visibleEntries
  const oneOffCount = orderedEntries.filter((entry) => !isInstallmentRow(entry.row)).length
  const installmentCount = orderedEntries.filter((entry) => isInstallmentRow(entry.row)).length

  const sumSelected = (installments: boolean, currency: 'UYU' | 'USD') =>
    included
      .filter((row) => isInstallmentRow(row) === installments && row.currency === currency)
      .reduce((acc, row) => acc + (row.amountCents ?? 0), 0)
  const cashUyu = sumSelected(false, 'UYU')
  const cashUsd = sumSelected(false, 'USD')
  const installUyu = sumSelected(true, 'UYU')
  const installUsd = sumSelected(true, 'USD')
  const totalUyu = preview?.meta?.totals?.UYU ?? null
  const totalUsd = preview?.meta?.totals?.USD ?? null

  async function analyze() {
    setError(null)
    setAnalyzing(true)
    try {
      const formData = new FormData()
      formData.set('cardId', cardId)
      if (period) formData.set('period', period)
      if (mode === 'pdf') {
        if (!file) {
          setError('Elegí un archivo PDF o cambiá a carga manual.')
          return
        }
        formData.set('file', file)
      } else {
        if (!text.trim()) {
          setError('Pegá el texto del resumen o usá la carga manual.')
          return
        }
        formData.set('text', text)
      }
      const result = await parseStatementPreview(formData)
      if (result.error) {
        setError(result.error)
        return
      }
      setPreview(result)
      setRows(result.rows ?? [])
      setPeriod(result.meta?.period ?? '')
    } finally {
      setAnalyzing(false)
    }
  }

  function startManual() {
    setError(null)
    setPreview({
      cardId,
      meta: {
        closingDate: null,
        dueDate: null,
        nextClosingDate: null,
        period: null,
        reliability: 'baja',
        warnings: ['Carga manual: completá cada fila con los datos del resumen.'],
        totals: { UYU: null, USD: null },
        cardLast4: null,
        linesScanned: 0,
        excluded: 0,
      },
      rows: [],
    })
    setPeriod('')
    setRows([blankRow()])
  }

  function blankRow(): PreviewRow {
    return {
      key: `manual-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      date: today,
      merchant: '',
      amountCents: null,
      currency: 'UYU',
      installmentNumber: null,
      installments: null,
      period: null,
      categoryId: null,
      suggestedCategory: null,
      confidence: 'low',
      warnings: [],
      include: true,
      matches: [],
    }
  }

  function updateRow(index: number, patch: Partial<PreviewRow>) {
    setRows((current) => current.map((row, position) => (position === index ? { ...row, ...patch } : row)))
  }

  function suggestFor(index: number, merchant: string) {
    const name = suggestCategoryName(merchant)
    const category = name ? categories.find((item) => item.name === name) : null
    updateRow(index, { merchant, suggestedCategory: name, categoryId: category?.id ?? null })
  }

  function addRow() {
    setRows((current) => [...current, blankRow()])
  }

  const payload = {
    cardId,
    period: period || null,
    closingDate: preview?.meta?.closingDate ?? null,
    dueDate: preview?.meta?.dueDate ?? null,
    totalAmount: totalUyu != null ? fromCents(totalUyu) : null,
    totalUyu: totalUyu != null ? fromCents(totalUyu) : null,
    totalUsd: totalUsd != null ? fromCents(totalUsd) : null,
    fileName: preview?.fileName ?? null,
    fileHash: preview?.fileHash ?? null,
    source: mode === 'manual' ? 'MANUAL' : mode === 'text' ? 'TEXT' : 'PDF',
    saveRules,
    rows: rows.map((row) => ({
      date: row.date,
      merchant: row.merchant,
      amount: row.amountCents != null ? fromCents(row.amountCents) : '',
      currency: row.currency,
      installments: row.installments ?? 1,
      installmentNumber: row.installmentNumber,
      categoryId: row.categoryId,
      include: row.include && !row.excludedReason,
      confidence: row.confidence,
    })),
  }

  if (state?.ok) {
    return (
      <div className="panel stack">
        <div className="alert ok">
          <Icon name="check" size={18} />
          <div>
            <strong>Importación completada</strong>
            <p>{state.message}</p>
          </div>
        </div>
        <p className="hint">
          Las compras están en Movimientos y las cuotas futuras en Tarjetas. Los registros dudosos quedaron
          con estado “Por revisar”.
        </p>
        <div className="row">
          <Link href="/tarjetas" className="primary-button">
            Ver cuotas y próximo pago
          </Link>
          <Link href="/movimientos" className="secondary-button">
            Ver movimientos
          </Link>
          <button
            type="button"
            className="ghost-button"
            onClick={() => {
              setPreview(null)
              setRows([])
              setFile(null)
              setText('')
              window.location.reload()
            }}
          >
            Importar otro resumen
          </button>
        </div>
      </div>
    )
  }

  if (!preview) {
    return (
      <div className="stack">
        <div className="steps">
          <span className="step active">
            <b>1</b> Subir o pegar
          </span>
          <span className="step">
            <b>2</b> Revisar
          </span>
          <span className="step">
            <b>3</b> Confirmar
          </span>
        </div>

        <div className="panel">
          <div className="field-grid">
            <label className="field">
              <span>Tarjeta</span>
              <select className="select" value={cardId} onChange={(event) => setCardId(event.target.value)}>
                {cards.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <span className="hint">
                Cierre día {card?.closingDay} · vencimiento día {card?.dueDay}
              </span>
            </label>
            <div className="field">
              <span className="field-label">Cómo cargar</span>
              <div className="segmented" style={{ width: '100%' }}>
                <button type="button" style={{ flex: 1 }} className={mode === 'pdf' ? 'selected' : ''} onClick={() => setMode('pdf')}>
                  PDF
                </button>
                <button type="button" style={{ flex: 1 }} className={mode === 'text' ? 'selected' : ''} onClick={() => setMode('text')}>
                  Pegar texto
                </button>
                <button type="button" style={{ flex: 1 }} className={mode === 'manual' ? 'selected' : ''} onClick={() => setMode('manual')}>
                  Manual
                </button>
              </div>
            </div>
          </div>

          {mode === 'pdf' ? (
            <label className="dropzone" style={{ display: 'block', cursor: 'pointer' }}>
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
              <Icon name="upload" size={22} />
              <strong>{file ? file.name : 'Subí el PDF del resumen'}</strong>
              <small>Hasta 10 MB. Se procesa en memoria y no se guarda.</small>
            </label>
          ) : mode === 'text' ? (
            <label className="field">
              <span>Texto del resumen</span>
              <textarea
                className="textarea"
                style={{ minHeight: 180 }}
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={'Pegá el texto del resumen tal como lo copiaste del PDF'}
              />
            </label>
          ) : (
            <div className="stack-sm">
              <p className="hint">
                Cargá las compras a mano. Es el camino recomendado si el PDF es una imagen o la extracción
                no es confiable.
              </p>
              <button type="button" className="secondary-button" style={{ width: 'fit-content' }} onClick={startManual}>
                <Icon name="plus" size={15} /> Empezar carga manual
              </button>
            </div>
          )}

          {error ? (
            <p className="error-text" role="alert">
              {error}
            </p>
          ) : null}

          {mode !== 'manual' ? (
            <div className="form-actions">
              <button type="button" className="primary-button" onClick={analyze} disabled={analyzing}>
                {analyzing ? 'Analizando…' : 'Analizar resumen'}
                {!analyzing ? <Icon name="arrow" size={15} /> : null}
              </button>
            </div>
          ) : null}
        </div>

        <p className="hint">
          El formato del PDF de Itaú se lee por columnas: fecha, tarjeta, comercio, cuota y dos importes
          (pesos y dólares). Aun así, revisá cada fila antes de confirmar.
        </p>
      </div>
    )
  }

  return (
    <div className="stack">
      <div className="steps">
        <span className="step">
          <b>1</b> Subir o pegar
        </span>
        <span className="step active">
          <b>2</b> Revisar
        </span>
        <span className="step">
          <b>3</b> Confirmar
        </span>
      </div>

      <div className="panel stack-sm">
        <div className="between" style={{ flexWrap: 'wrap' }}>
          <div>
            <h2 className="section-title">
              {preview.meta?.reliability === 'alta'
                ? 'Lectura completa'
                : preview.meta?.reliability === 'media'
                  ? 'Lectura parcial: revisá cada fila'
                  : 'Lectura poco confiable: completá a mano'}
            </h2>
            <p className="hint">
              {included.length} consumo{included.length === 1 ? '' : 's'} detectado{included.length === 1 ? '' : 's'}
              {preview.meta?.closingDate ? ` · cierre ${preview.meta.closingDate}` : ''}
              {preview.meta?.dueDate ? ` · vence ${preview.meta.dueDate}` : ''}
              {preview.meta?.cardLast4 ? ` · tarjeta •••• ${preview.meta.cardLast4}` : ''}
            </p>
          </div>
          <div className="row">
            <Badge tone={preview.meta?.reliability === 'alta' ? 'ok' : preview.meta?.reliability === 'media' ? 'warn' : 'danger'}>
              Confiabilidad {preview.meta?.reliability}
            </Badge>
            <button type="button" className="ghost-button small-button" onClick={() => setPreview(null)}>
              Volver
            </button>
          </div>
        </div>

        <div className="field-grid">
          <label className="field">
            <span>Período del resumen</span>
            <input
              className="input"
              type="month"
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
            />
            <span className="hint">
              Es el mes en que vence este resumen. Las cuotas 2/10, 3/10… se ubican en los meses siguientes.
            </span>
          </label>
          <div className="field">
            <span className="field-label">Totales del resumen</span>
            <div className="row" style={{ gap: 14, minHeight: 40, alignItems: 'center' }}>
              {totalUyu != null ? (
                <strong>
                  <Money cents={totalUyu} currency="UYU" />
                </strong>
              ) : null}
              {totalUsd != null ? (
                <strong>
                  <Money cents={totalUsd} currency="USD" />
                </strong>
              ) : null}
              {totalUyu == null && totalUsd == null ? <span className="hint">No se detectaron</span> : null}
            </div>
            <div className="import-split">
              <div>
                <span>Contado</span>
                <strong>
                  <Money cents={cashUyu} currency="UYU" />
                  {cashUsd > 0 ? <> · <Money cents={cashUsd} currency="USD" /></> : null}
                </strong>
              </div>
              <div>
                <span>Cuotas</span>
                <strong>
                  <Money cents={installUyu} currency="UYU" />
                  {installUsd > 0 ? <> · <Money cents={installUsd} currency="USD" /></> : null}
                </strong>
              </div>
            </div>
          </div>
        </div>

        {preview.meta?.warnings.map((warning) => (
          <p className="review-flag" key={warning}>
            <Icon name="warning" size={13} /> {warning}
          </p>
        ))}
      </div>

      <div className="panel">
        <div className="between" style={{ marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
          <h2 className="section-title">Consumos del resumen</h2>
          <div className="row">
            <div className="segmented" role="group" aria-label="Orden de las filas">
              <button
                type="button"
                className={grouped ? '' : 'selected'}
                onClick={() => setGrouped(false)}
              >
                Orden del resumen
              </button>
              <button
                type="button"
                className={grouped ? 'selected' : ''}
                onClick={() => setGrouped(true)}
              >
                Agrupar cuotas
              </button>
            </div>
            <button type="button" className="ghost-button small-button" onClick={addRow}>
              <Icon name="plus" size={14} /> Agregar fila
            </button>
            <span className="hint">
              {included.length} de {rows.length} seleccionadas
            </span>
          </div>
        </div>

        {included.length === 0 && excluded.length === 0 ? (
          <div className="empty-state">
            <strong>No se detectaron consumos</strong>
            Agregá las filas a mano con el botón “Agregar fila”.
          </div>
        ) : (
          <div className="stack-sm">
            {grouped && oneOffCount > 0 ? (
              <p className="import-group-title">Gastos puntuales ({oneOffCount})</p>
            ) : null}
            {orderedEntries.map(({ row, index }, position) => {
              const previous = orderedEntries[position - 1]
              const showInstallmentDivider =
                grouped && isInstallmentRow(row) && (!previous || !isInstallmentRow(previous.row))
              return (
                <Fragment key={row.key}>
                  {showInstallmentDivider ? (
                    <p className="import-group-title">En cuotas ({installmentCount})</p>
                  ) : null}
                <div className={`import-row ${row.matches.length > 0 ? 'needs-review' : ''}`}>
                  <div className="import-grid">
                    <label className="checkbox" style={{ margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={row.include}
                        onChange={(event) => updateRow(index, { include: event.target.checked })}
                        aria-label={`Incluir ${row.merchant || 'fila'}`}
                      />
                      <span className="sr-only">Incluir</span>
                    </label>
                    <input
                      className="input"
                      type="date"
                      value={row.date ?? ''}
                      onChange={(event) => updateRow(index, { date: event.target.value })}
                      aria-label="Fecha"
                    />
                    <input
                      className="input"
                      value={row.merchant}
                      onChange={(event) => suggestFor(index, event.target.value)}
                      placeholder="Comercio"
                      aria-label="Comercio"
                    />
                    <input
                      className="input amount"
                      value={row.amountCents != null ? fromCents(row.amountCents) : ''}
                      onChange={(event) => updateRow(index, { amountCents: parseAmountInput(event.target.value) })}
                      placeholder="0,00"
                      inputMode="decimal"
                      aria-label="Importe"
                    />
                    <select
                      className="select"
                      value={row.currency}
                      onChange={(event) => updateRow(index, { currency: event.target.value as 'UYU' | 'USD' })}
                      aria-label="Moneda"
                    >
                      <option value="UYU">UYU</option>
                      <option value="USD">USD</option>
                    </select>
                    <input
                      className="input"
                      type="number"
                      min={1}
                      max={60}
                      value={row.installments ?? 1}
                      onChange={(event) => updateRow(index, { installments: Number(event.target.value) || 1 })}
                      aria-label="Cuotas"
                      title="Cantidad de cuotas"
                    />
                    <div className="category-with-icon">
                      <select
                        className="select"
                        value={row.categoryId ?? ''}
                        onChange={(event) => updateRow(index, { categoryId: event.target.value || null })}
                        aria-label="Categoría"
                      >
                        <option value="">Sin categorizar</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                      <CategoryDot
                        icon={categories.find((category) => category.id === row.categoryId)?.icon}
                        color={categories.find((category) => category.id === row.categoryId)?.color}
                        size={30}
                      />
                    </div>
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => setRows((current) => current.filter((_, position) => position !== index))}
                      aria-label="Quitar fila"
                      title="Quitar fila"
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </div>

                  <div className="row" style={{ marginTop: 6, gap: 8, flexWrap: 'wrap' }}>
                    <Badge tone={row.confidence === 'high' ? 'ok' : row.confidence === 'medium' ? 'warn' : 'danger'}>
                      {row.confidence === 'high' ? 'Datos completos' : row.confidence === 'medium' ? 'Revisar' : 'Incompleta'}
                    </Badge>
                    {row.installmentNumber ? (
                      <Badge tone="info">
                        Cuota {row.installmentNumber} de {row.installments}
                        {row.installments && row.installmentNumber < row.installments
                          ? ` · quedan ${row.installments - row.installmentNumber + 1}`
                          : ''}
                      </Badge>
                    ) : null}
                    {row.suggestedCategory && !row.categoryId ? (
                      <span className="hint">Sugerencia: {row.suggestedCategory}</span>
                    ) : null}
                    {row.warnings.map((warning) => (
                      <span className="review-flag" key={warning}>
                        <Icon name="warning" size={12} /> {warning}
                      </span>
                    ))}
                    {row.matches.map((match) => (
                      <span key={match.expenseId} className="review-flag">
                        <Icon name="info" size={12} /> Posible duplicado ({match.confidence}): {match.merchant} ·{' '}
                        {fromCents(match.amountCents)} · {match.date}
                      </span>
                    ))}
                  </div>
                </div>
                </Fragment>
              )
            })}
          </div>
        )}

        {excluded.length > 0 ? (
          <details className="disclosure" style={{ marginTop: 14 }}>
            <summary>
              <span>
                <Icon name="info" size={15} /> Líneas omitidas ({excluded.length})
              </span>
              <Icon name="chevron" size={15} />
            </summary>
            <div className="disclosure-body">
              {excluded.map((row) => (
                <div className="list-row" key={row.key}>
                  <div className="item-main">
                    <strong>{row.merchant}</strong>
                    <small>
                      {row.date ?? 'sin fecha'} · {row.excludedReason}
                    </small>
                  </div>
                  {row.amountCents != null ? (
                    <div className="item-amount">
                      <strong>
                        <Money cents={row.amountCents} currency={row.currency} />
                      </strong>
                    </div>
                  ) : null}
                </div>
              ))}
              <p className="hint">
                Pagos, saldos, ajustes de IVA y devoluciones no se importan como consumos para no duplicar
                ni distorsionar las estadísticas.
              </p>
            </div>
          </details>
        ) : null}
      </div>

      <form action={action} className="panel">
        <input type="hidden" name="payload" value={JSON.stringify(payload)} />
        {state?.error ? (
          <p className="error-text" role="alert">
            {state.error}
          </p>
        ) : null}
        <div className="between" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div>
            <p className="hint" style={{ maxWidth: 560 }}>
              Se importan sólo las filas tildadas. Si una compra ya existe se omite para no duplicar
              consumos ni cuotas. Las filas “Incompleta” quedan para revisión.
            </p>
            <label className="checkbox">
              <input type="checkbox" checked={saveRules} onChange={(event) => setSaveRules(event.target.checked)} />
              <span>Recordar la categoría de cada comercio para próximos gastos</span>
            </label>
          </div>
          <div className="row">
            <Link href="/ajustes" className="ghost-button">
              Cancelar
            </Link>
            <button type="submit" className="primary-button" disabled={pending || included.length === 0}>
              {pending ? 'Importando…' : `Importar ${included.length} compra${included.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
