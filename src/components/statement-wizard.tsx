'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import {
  confirmStatementImport,
  parseStatementPreview,
  type StatementPreview,
} from '@/app/actions/imports'
import { fromCents, parseAmountInput } from '@/lib/money'
import { Icon } from '@/components/icons'
import { Badge } from '@/components/ui'

type CardOption = { id: string; name: string; currency: string; closingDay: number; dueDay: number }

type EditableRow = NonNullable<StatementPreview['rows']>[number]

export function StatementWizard({ cards, defaultCardId, today }: { cards: CardOption[]; defaultCardId?: string; today: string }) {
  const [cardId, setCardId] = useState(defaultCardId ?? cards[0]?.id ?? '')
  const [mode, setMode] = useState<'pdf' | 'text' | 'manual'>('pdf')
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<StatementPreview | null>(null)
  const [rows, setRows] = useState<EditableRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [state, action, pending] = useActionState(confirmStatementImport, {})

  const card = cards.find((item) => item.id === cardId)

  async function analyze() {
    setError(null)
    setAnalyzing(true)
    try {
      const formData = new FormData()
      formData.set('cardId', cardId)
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
        totalAmountCents: null,
        currency: (card?.currency as 'UYU' | 'USD') ?? 'UYU',
        reliability: 'baja',
        warnings: ['Carga manual: completá cada fila con los datos del resumen.'],
        linesScanned: 0,
        linesSkipped: 0,
      },
      rows: [],
    })
    setRows([
      {
        key: 'manual-1',
        date: today,
        merchant: '',
        amountCents: null,
        currency: (card?.currency as 'UYU' | 'USD') ?? 'UYU',
        installmentNumber: null,
        installments: null,
        period: null,
        confidence: 'low',
        warnings: [],
        include: true,
        matches: [],
      },
    ])
  }

  function updateRow(index: number, patch: Partial<EditableRow>) {
    setRows((current) => current.map((row, position) => (position === index ? { ...row, ...patch } : row)))
  }

  function addRow() {
    setRows((current) => [
      ...current,
      {
        key: `manual-${current.length + 1}-${Date.now()}`,
        date: today,
        merchant: '',
        amountCents: null,
        currency: (card?.currency as 'UYU' | 'USD') ?? 'UYU',
        installmentNumber: null,
        installments: null,
        period: null,
        confidence: 'low',
        warnings: [],
        include: true,
        matches: [],
      },
    ])
  }

  const selected = rows.filter((row) => row.include)
  const payload = {
    cardId,
    period: preview?.meta?.dueDate ? preview.meta.dueDate.slice(0, 7) : null,
    closingDate: preview?.meta?.closingDate ?? null,
    dueDate: preview?.meta?.dueDate ?? null,
    totalAmount: preview?.meta?.totalAmountCents != null ? fromCents(preview.meta.totalAmountCents) : null,
    fileName: preview?.fileName ?? null,
    fileHash: preview?.fileHash ?? null,
    source: mode === 'manual' ? 'MANUAL' : mode === 'text' ? 'TEXT' : 'PDF',
    rows: rows.map((row) => ({
      date: row.date,
      merchant: row.merchant,
      amount: row.amountCents != null ? fromCents(row.amountCents) : '',
      currency: row.currency,
      installments: row.installments ?? 1,
      installmentNumber: row.installmentNumber,
      period: row.period,
      include: row.include,
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
          Las compras importadas ya están en Movimientos y las cuotas futuras en Tarjetas. Los registros marcados
          como dudosos quedaron con estado “Por revisar”.
        </p>
        <div className="row">
          <Link href="/movimientos" className="primary-button">
            Ver movimientos
          </Link>
          <Link href="/tarjetas" className="secondary-button">
            Ver cuotas
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
                    {item.name} · {item.currency}
                  </option>
                ))}
              </select>
              <span className="hint">
                Cierre día {card?.closingDay} · vencimiento día {card?.dueDay}: se usan para calcular el período de cada compra.
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
              <small>Hasta 10 MB. El archivo se procesa en memoria y no se guarda.</small>
            </label>
          ) : mode === 'text' ? (
            <label className="field">
              <span>Texto del resumen</span>
              <textarea
                className="textarea"
                style={{ minHeight: 180 }}
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={'Pegá el texto del resumen tal como lo copiaste del PDF\n\n17/06/2025  SUPERMERCADO DISCO  1.234,56'}
              />
            </label>
          ) : (
            <div className="stack-sm">
              <p className="hint">
                Cargá las compras a mano. Es el camino recomendado si el PDF es una imagen o la extracción no es
                confiable.
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
          No se conoce el formato exacto del PDF de Itaú: la extracción es heurística y puede fallar. Nada se importa
          hasta que lo confirmes.
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
                ? 'Lectura confiable, igual revisá'
                : preview.meta?.reliability === 'media'
                  ? 'Lectura parcial: revisá cada fila'
                  : 'Lectura poco confiable: completá a mano'}
            </h2>
            <p className="hint">
              {rows.length} fila{rows.length === 1 ? '' : 's'} detectada{rows.length === 1 ? '' : 's'}
              {preview.meta?.closingDate ? ` · cierre ${preview.meta.closingDate}` : ''}
              {preview.meta?.dueDate ? ` · vencimiento ${preview.meta.dueDate}` : ''}
              {preview.meta?.totalAmountCents != null
                ? ` · total ${fromCents(preview.meta.totalAmountCents)} ${preview.meta.currency}`
                : ''}
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

        {preview.meta?.warnings.map((warning) => (
          <p className="review-flag" key={warning}>
            <Icon name="warning" size={13} /> {warning}
          </p>
        ))}
      </div>

      <div className="panel">
        <div className="between" style={{ marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
          <h2 className="section-title">Compras detectadas</h2>
          <div className="row">
            <button type="button" className="ghost-button small-button" onClick={addRow}>
              <Icon name="plus" size={14} /> Agregar fila
            </button>
            <span className="hint">
              {selected.length} de {rows.length} seleccionadas
            </span>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="empty-state">
            <strong>No se detectaron compras</strong>
            Agregá las filas a mano con el botón “Agregar fila”.
          </div>
        ) : (
          <div className="stack-sm">
            {rows.map((row, index) => (
              <div className={`import-row ${row.matches.length > 0 ? 'needs-review' : ''}`} key={row.key}>
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
                    onChange={(event) => updateRow(index, { merchant: event.target.value })}
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
                    value={row.currency ?? card?.currency ?? 'UYU'}
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
                  <input
                    className="input"
                    value={row.period ?? ''}
                    onChange={(event) => updateRow(index, { period: event.target.value || null })}
                    placeholder="AAAA-MM"
                    aria-label="Período del resumen"
                    title="Período del resumen (vacío = calcular con el cierre)"
                  />
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
                    </Badge>
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
            ))}
          </div>
        )}
      </div>

      <form action={action} className="panel">
        <input type="hidden" name="payload" value={JSON.stringify(payload)} />
        {state?.error ? (
          <p className="error-text" role="alert">
            {state.error}
          </p>
        ) : null}
        <div className="between" style={{ flexWrap: 'wrap', gap: 10 }}>
          <p className="hint" style={{ maxWidth: 560 }}>
            Se importan sólo las filas tildadas. Si una compra ya existe (por correo o carga manual), se omite para
            no duplicar consumos ni cuotas. Las filas “Incompleta” quedan para revisión.
          </p>
          <div className="row">
            <Link href="/ajustes" className="ghost-button">
              Cancelar
            </Link>
            <button type="submit" className="primary-button" disabled={pending || selected.length === 0}>
              {pending ? 'Importando…' : `Importar ${selected.length} compra${selected.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
