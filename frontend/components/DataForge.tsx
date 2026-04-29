'use client'
import { useState } from 'react'

interface Column {
  name: string
  type: 'uuid' | 'string' | 'integer' | 'decimal' | 'date' | 'categorical' | 'email' | 'phone'
  is_pk: boolean
  fk_table?: string
  fk_column?: string
  categories?: string[]
  min?: number
  max?: number
  nullable?: boolean
}

interface Table {
  id: string
  name: string
  row_count: number
  columns: Column[]
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'

const TYPE_OPTIONS = [
  { value: 'uuid',        label: 'UUID (unique ID)' },
  { value: 'string',      label: 'Free text' },
  { value: 'integer',     label: 'Integer' },
  { value: 'decimal',     label: 'Decimal' },
  { value: 'date',        label: 'Date' },
  { value: 'categorical', label: 'Categorical (fixed list)' },
  { value: 'email',       label: 'Email' },
  { value: 'phone',       label: 'Phone' },
]

const inputStyle: React.CSSProperties = {
  padding: '7px 10px',
  borderRadius: 6,
  border: '0.5px solid var(--border-2)',
  fontSize: 12,
  color: 'var(--ink)',
  background: 'var(--surface)',
  fontFamily: 'var(--font-body)',
  outline: 'none',
}

export default function DataForge() {
  const [prompt, setPrompt]               = useState('')
  const [tables, setTables]               = useState<Table[]>([])
  const [generating, setGenerating]       = useState(false)
  const [downloading, setDownloading]     = useState(false)
  const [step, setStep]                   = useState<'prompt' | 'schema' | 'done'>('prompt')
  const [generatedFiles, setGeneratedFiles] = useState<{ name: string; url: string }[]>([])
  const [error, setError]                 = useState('')

  // ── Schema generation ─────────────────────────────────
  const generateSchema = async () => {
    if (!prompt.trim()) return
    setGenerating(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE}/api/dataforge/schema`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Schema generation failed')
      setTables(data.tables)
      setStep('schema')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setGenerating(false)
    }
  }

  // ── Data generation ───────────────────────────────────
  const generateData = async () => {
    setDownloading(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE}/api/dataforge/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tables }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Generation failed')
      const files = data.tables.map((t: any) => {
        const blob = new Blob([t.csv], { type: 'text/csv' })
        const url  = URL.createObjectURL(blob)
        return { name: `${t.name}.csv`, url }
      })
      setGeneratedFiles(files)
      setStep('done')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setDownloading(false)
    }
  }

  // ── Table / column helpers ────────────────────────────
  const addTable = () => {
    const id = `table_${Date.now()}`
    setTables(prev => [...prev, {
      id, name: 'new_table', row_count: 100,
      columns: [{ name: 'id', type: 'uuid', is_pk: true, nullable: false }],
    }])
  }

  const removeTable = (id: string) =>
    setTables(prev => prev.filter(t => t.id !== id))

  const updateTable = (id: string, updates: Partial<Table>) =>
    setTables(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t))

  const addColumn = (tableId: string) =>
    setTables(prev => prev.map(t =>
      t.id === tableId
        ? { ...t, columns: [...t.columns, { name: 'new_column', type: 'string' as const, is_pk: false }] }
        : t
    ))

  const updateColumn = (tableId: string, colIdx: number, updates: Partial<Column>) =>
    setTables(prev => prev.map(t =>
      t.id === tableId
        ? { ...t, columns: t.columns.map((c, i) => i === colIdx ? { ...c, ...updates } : c) }
        : t
    ))

  const removeColumn = (tableId: string, colIdx: number) =>
    setTables(prev => prev.map(t =>
      t.id === tableId
        ? { ...t, columns: t.columns.filter((_, i) => i !== colIdx) }
        : t
    ))

  const totalRows = tables.reduce((s, t) => s + t.row_count, 0)

  // ══════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 32, textAlign: 'center' }}>
        <div style={{
          display: 'inline-block',
          background: 'var(--wf-red-light)', color: 'var(--wf-red)',
          fontSize: 11, fontWeight: 500, padding: '4px 12px', borderRadius: 20,
          letterSpacing: '0.06em', textTransform: 'uppercase' as const,
          marginBottom: 12, border: '0.5px solid rgba(215,30,43,0.2)',
        }}>
          DataForge — Synthetic Data Generator
        </div>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 700,
          color: 'var(--ink)', lineHeight: 1.15, letterSpacing: '-0.02em', marginBottom: 10,
        }}>
          Generate realistic relational data
        </h2>
        <p style={{ fontSize: 15, color: 'var(--ink-2)', maxWidth: 540, margin: '0 auto', lineHeight: 1.7 }}>
          Describe your schema in plain English. DataForge generates multiple linked tables
          with referential integrity, realistic distributions, and enforced FK chains.
        </p>
      </div>

      <div style={{
        height: 2,
        background: 'linear-gradient(90deg, var(--wf-gold) 0%, var(--wf-gold-dark) 100%)',
        borderRadius: 1, marginBottom: 32,
      }}/>

      {/* ── Error banner ── */}
      {error && (
        <div style={{
          marginBottom: 16, padding: '10px 14px',
          background: 'var(--wf-red-light)',
          border: '0.5px solid rgba(215,30,43,0.3)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--wf-red)', fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          STEP 1 — PROMPT
      ══════════════════════════════════════════════════ */}
      {step === 'prompt' && (
        <div style={{
          background: 'var(--surface)',
          border: '0.5px solid var(--border-1)',
          borderRadius: 'var(--radius-xl)',
          padding: '32px',
          boxShadow: 'var(--shadow-md)',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 3,
            background: 'linear-gradient(90deg, var(--wf-gold) 0%, var(--wf-gold-dark) 100%)',
          }}/>

          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 12 }}>
            Describe your data schema
          </div>

          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder={
              `Example:\nCreate a banking database with:\n- customers table (1000 rows): customer_id, name, email, credit_score (580-850), state\n- loans table (3000 rows): loan_id, customer_id (FK), amount (100k-10M), interest_rate, status (Active/Closed/Defaulted)\n- payments table (15000 rows): payment_id, loan_id (FK), amount, due_date, paid_date, status\nNote: payments can only link to loans, not directly to customers`
            }
            style={{
              width: '100%', height: 200, padding: '14px 16px',
              borderRadius: 'var(--radius-md)',
              border: '1.5px solid var(--wf-red)',
              fontSize: 13, color: 'var(--ink)', background: 'var(--surface)',
              fontFamily: 'var(--font-body)', outline: 'none',
              resize: 'vertical' as const, lineHeight: 1.6,
              boxSizing: 'border-box' as const,
              boxShadow: '0 0 0 3px rgba(215,30,43,0.08)',
              transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
            }}
            onFocus={e => {
              e.target.style.borderColor = 'var(--wf-red)'
              e.target.style.boxShadow = '0 0 0 4px rgba(215,30,43,0.12)'
            }}
            onBlur={e => {
              e.target.style.borderColor = 'var(--wf-red)'
              e.target.style.boxShadow = '0 0 0 3px rgba(215,30,43,0.08)'
            }}
          />

          <div style={{ display: 'flex', gap: 12, marginTop: 16, alignItems: 'center' }}>
            <button
              onClick={generateSchema}
              disabled={!prompt.trim() || generating}
              style={{
                padding: '10px 24px', borderRadius: 'var(--radius-md)',
                background: prompt.trim() && !generating ? 'var(--wf-red)' : 'var(--surface-3)',
                color: prompt.trim() && !generating ? 'white' : 'var(--ink-3)',
                border: 'none', fontSize: 13, fontWeight: 500,
                cursor: prompt.trim() && !generating ? 'pointer' : 'default',
                fontFamily: 'var(--font-body)',
              }}
            >
              {generating ? 'Generating schema...' : 'Generate Schema →'}
            </button>
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              AI interprets your description and builds the schema
            </span>
          </div>

          {/* Quick examples */}
          <div style={{ marginTop: 24, paddingTop: 20, borderTop: '0.5px solid var(--border-1)' }}>
            <div style={{
              fontSize: 12, fontWeight: 600, color: 'var(--ink-2)',
              marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              Try an example
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'Banking', desc: 'Loan portfolio with customers, loans, and payments tables' },
                { label: 'E-commerce', desc: 'Products, orders, order_items, and customers with FK chain' },
                { label: 'HR', desc: 'Departments, employees, salaries, and performance reviews' },
              ].map(ex => (
                <button
                  key={ex.label}
                  onClick={() => setPrompt(ex.desc)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 14px', borderRadius: 'var(--radius-md)',
                    border: '0.5px solid var(--border-1)',
                    background: 'var(--surface-2)', color: 'var(--ink)',
                    cursor: 'pointer', fontFamily: 'var(--font-body)',
                    textAlign: 'left', transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLButtonElement).style.background = 'var(--wf-red-light)'
                    ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(215,30,43,0.3)'
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-2)'
                    ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-1)'
                  }}
                >
                  <div style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: 'var(--wf-red)', flexShrink: 0,
                  }}/>
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--wf-red)', marginRight: 8 }}>
                      {ex.label}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{ex.desc}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          STEP 2 — SCHEMA EDITOR
      ══════════════════════════════════════════════════ */}
      {step === 'schema' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: 10 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>
                Review &amp; Edit Schema
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 2 }}>
                {tables.length} tables · {totalRows.toLocaleString()} total rows
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => { setStep('prompt'); setTables([]) }}
                style={{
                  padding: '8px 16px', borderRadius: 'var(--radius-md)',
                  background: 'transparent', color: 'var(--ink-2)',
                  border: '0.5px solid var(--border-2)',
                  fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)',
                }}
              >
                ← Back
              </button>
              <button
                onClick={addTable}
                style={{
                  padding: '8px 16px', borderRadius: 'var(--radius-md)',
                  background: 'var(--surface-2)', color: 'var(--ink-2)',
                  border: '0.5px solid var(--border-2)',
                  fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)',
                }}
              >
                + Add Table
              </button>
              <button
                onClick={generateData}
                disabled={downloading}
                style={{
                  padding: '8px 20px', borderRadius: 'var(--radius-md)',
                  background: downloading ? 'var(--surface-3)' : 'var(--wf-red)',
                  color: downloading ? 'var(--ink-3)' : 'white',
                  border: 'none', fontSize: 13, fontWeight: 500,
                  cursor: downloading ? 'default' : 'pointer',
                  fontFamily: 'var(--font-body)',
                }}
              >
                {downloading ? 'Generating...' : '⬇ Generate & Download'}
              </button>
            </div>
          </div>

          {/* Tables */}
          {tables.map((table, ti) => (
            <div key={table.id} style={{
              background: 'var(--surface)',
              border: '0.5px solid var(--border-1)',
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
              boxShadow: 'var(--shadow-sm)',
            }}>
              {/* Table header */}
              <div style={{
                padding: '12px 16px',
                borderBottom: '0.5px solid var(--border-1)',
                background: 'var(--surface-2)',
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 6,
                  background: 'var(--wf-red)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontSize: 12, fontWeight: 700, flexShrink: 0,
                }}>
                  T{ti + 1}
                </div>
                <input
                  value={table.name}
                  onChange={e => updateTable(table.id, { name: e.target.value })}
                  style={{ ...inputStyle, fontWeight: 600, fontSize: 14, width: 180 }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Rows:</span>
                  <input
                    type="number"
                    value={table.row_count}
                    onChange={e => updateTable(table.id, { row_count: Number(e.target.value) })}
                    style={{ ...inputStyle, width: 80 }}
                  />
                </div>
                <button
                  onClick={() => removeTable(table.id)}
                  style={{
                    marginLeft: 'auto', fontSize: 12, color: 'var(--ink-3)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  Remove table
                </button>
              </div>

              {/* Columns table */}
              <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
                <thead>
                  <tr style={{ background: 'var(--surface-2)' }}>
                    {['Column Name', 'Type', 'PK', 'FK → Table', 'FK Column', 'Options', ''].map(h => (
                      <th key={h} style={{
                        padding: '8px 12px', textAlign: 'left' as const,
                        fontSize: 10, fontWeight: 500, color: 'var(--ink-3)',
                        textTransform: 'uppercase' as const, letterSpacing: '0.05em',
                        borderBottom: '0.5px solid var(--border-1)',
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.columns.map((col, ci) => (
                    <tr key={ci} style={{ borderBottom: '0.5px solid var(--border-1)' }}>

                      {/* Column name */}
                      <td style={{ padding: '8px 12px' }}>
                        <input
                          value={col.name}
                          onChange={e => updateColumn(table.id, ci, { name: e.target.value })}
                          style={{ ...inputStyle, width: 150 }}
                        />
                      </td>

                      {/* Type */}
                      <td style={{ padding: '8px 12px' }}>
                        <select
                          value={col.type}
                          onChange={e => updateColumn(table.id, ci, { type: e.target.value as Column['type'] })}
                          style={{ ...inputStyle, width: 160 }}
                        >
                          {TYPE_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </td>

                      {/* PK */}
                      <td style={{ padding: '8px 12px', textAlign: 'center' as const }}>
                        <input
                          type="checkbox"
                          checked={col.is_pk}
                          onChange={e => updateColumn(table.id, ci, { is_pk: e.target.checked })}
                        />
                      </td>

                      {/* FK table */}
                      <td style={{ padding: '8px 12px' }}>
                        <select
                          value={col.fk_table || ''}
                          onChange={e => updateColumn(table.id, ci, { fk_table: e.target.value || undefined })}
                          style={{ ...inputStyle, width: 120 }}
                        >
                          <option value="">None</option>
                          {tables.filter(t => t.id !== table.id).map(t => (
                            <option key={t.id} value={t.name}>{t.name}</option>
                          ))}
                        </select>
                      </td>

                      {/* FK column */}
                      <td style={{ padding: '8px 12px' }}>
                        <input
                          value={col.fk_column || ''}
                          onChange={e => updateColumn(table.id, ci, { fk_column: e.target.value || undefined })}
                          placeholder={col.fk_table ? 'column name' : '—'}
                          disabled={!col.fk_table}
                          style={{ ...inputStyle, width: 100, opacity: col.fk_table ? 1 : 0.4 }}
                        />
                      </td>

                      {/* Options */}
                      <td style={{ padding: '8px 12px' }}>
                        {col.type === 'categorical' && (
                          <input
                            value={col.categories?.join(', ') || ''}
                            onChange={e => updateColumn(table.id, ci, {
                              categories: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                            })}
                            placeholder="val1, val2, val3"
                            style={{ ...inputStyle, width: 180 }}
                          />
                        )}
                        {(col.type === 'integer' || col.type === 'decimal') && (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <input
                              type="number"
                              value={col.min ?? ''}
                              onChange={e => updateColumn(table.id, ci, {
                                min: e.target.value ? Number(e.target.value) : undefined,
                              })}
                              placeholder="min"
                              style={{ ...inputStyle, width: 70 }}
                            />
                            <input
                              type="number"
                              value={col.max ?? ''}
                              onChange={e => updateColumn(table.id, ci, {
                                max: e.target.value ? Number(e.target.value) : undefined,
                              })}
                              placeholder="max"
                              style={{ ...inputStyle, width: 70 }}
                            />
                          </div>
                        )}
                        {col.type !== 'categorical' && col.type !== 'integer' && col.type !== 'decimal' && (
                          <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>—</span>
                        )}
                      </td>

                      {/* Remove */}
                      <td style={{ padding: '8px 12px' }}>
                        {!col.is_pk && (
                          <button
                            onClick={() => removeColumn(table.id, ci)}
                            style={{
                              fontSize: 13, color: 'var(--ink-3)',
                              background: 'none', border: 'none',
                              cursor: 'pointer', fontFamily: 'var(--font-body)',
                            }}
                          >
                            ✕
                          </button>
                        )}
                      </td>

                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Add column */}
              <div style={{ padding: '10px 12px', borderTop: '0.5px solid var(--border-1)' }}>
                <button
                  onClick={() => addColumn(table.id)}
                  style={{
                    fontSize: 12, color: 'var(--wf-red)',
                    background: 'none', border: 'none',
                    cursor: 'pointer', fontFamily: 'var(--font-body)',
                    textDecoration: 'underline',
                  }}
                >
                  + Add column
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          STEP 3 — DOWNLOAD
      ══════════════════════════════════════════════════ */}
      {step === 'done' && (
        <div style={{
          background: 'var(--surface)',
          border: '0.5px solid var(--border-1)',
          borderRadius: 'var(--radius-xl)',
          padding: '48px',
          textAlign: 'center' as const,
          boxShadow: 'var(--shadow-md)',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
          <div style={{
            fontSize: 22, fontWeight: 700,
            color: 'var(--ink)', marginBottom: 8,
            fontFamily: 'var(--font-display)',
          }}>
            Data generated successfully
          </div>
          <p style={{ fontSize: 14, color: 'var(--ink-2)', marginBottom: 28 }}>
            {totalRows.toLocaleString()} rows across {tables.length} tables with full referential integrity
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' as const }}>
            {generatedFiles.map(f => (
              <a
                key={f.name}
                href={f.url}
                download={f.name}
                style={{
                  padding: '10px 20px', borderRadius: 'var(--radius-md)',
                  background: 'var(--wf-red)', color: 'white',
                  textDecoration: 'none', fontSize: 13, fontWeight: 500,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                ⬇ {f.name}
              </a>
            ))}
          </div>
          <button
            onClick={() => {
              setStep('prompt')
              setPrompt('')
              setTables([])
              setGeneratedFiles([])
            }}
            style={{
              marginTop: 20, fontSize: 13, color: 'var(--wf-red)',
              background: 'none', border: 'none',
              cursor: 'pointer', textDecoration: 'underline',
              fontFamily: 'var(--font-body)',
            }}
          >
            Generate another dataset
          </button>
        </div>
      )}

    </div>
  )
}