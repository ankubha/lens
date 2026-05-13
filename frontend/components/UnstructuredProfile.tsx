'use client'
import { useState, useEffect } from 'react'
import { ProfileContract, ExtractedFact, DiscoveredField } from '@/lib/api'
import Badge from './Badge'

interface Props {
  profile: ProfileContract
  activeTab: string
}

// ── Shared card ───────────────────────────────────────────
function Card({ title, subtitle, children, goldTop }: {
  title?: string
  subtitle?: string
  children: React.ReactNode
  goldTop?: boolean
}) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '0.5px solid var(--border-1)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      boxShadow: 'var(--shadow-sm)',
      position: 'relative',
    }}>
      {goldTop && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: 'linear-gradient(90deg, var(--wf-gold) 0%, var(--wf-gold-dark) 100%)',
        }}/>
      )}
      {title && (
        <div style={{
          padding: goldTop ? '16px 20px 14px' : '14px 20px',
          borderBottom: '0.5px solid var(--border-1)',
          background: 'var(--surface-2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: goldTop ? 3 : 0,
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{title}</span>
          {subtitle && <span style={{ fontSize: 12, color: 'var(--ink-3)', fontStyle: 'italic' }}>{subtitle}</span>}
        </div>
      )}
      {children}
    </div>
  )
}

// ── Markdown renderer ─────────────────────────────────────
function MarkdownText({ text, fontSize = 14 }: { text: string; fontSize?: number }) {
  if (!text) return null
  return (
    <div>
      {text.split(/\n+/).filter(l => l.trim()).map((line, i) => {
        const isH2 = line.startsWith('##')
        const isH3 = line.startsWith('###')
        const isBoldHeading = /^\*\*[^*]+\*\*\s*$/.test(line.trim()) ||
                              /^\*\*[^*]+:?\s*$/.test(line.trim())
        const clean = line
          .replace(/^###\s*/, '').replace(/^##\s*/, '')
          .replace(/^\*\*/, '').replace(/\*\*$/, '')
          .replace(/\*\*/g, '').trim()

        if (isH2 || isH3 || isBoldHeading) {
          return (
            <div key={i} style={{
              fontSize: 12, fontWeight: 700, color: 'var(--wf-red)',
              textTransform: 'uppercase', letterSpacing: '0.06em',
              marginTop: i === 0 ? 0 : 18, marginBottom: 6,
              paddingBottom: 4, borderBottom: '1px solid var(--wf-gold-light)',
            }}>
              {clean}
            </div>
          )
        }

        const isBullet = line.trim().startsWith('*') && !line.trim().startsWith('**')
        const bulletClean = isBullet ? line.trim().replace(/^\*\s*/, '') : clean

        return (
          <p key={i} style={{
            fontSize, color: 'var(--ink-2)', lineHeight: 1.8,
            margin: isBullet ? '0 0 4px 16px' : '0 0 6px 0',
            display: 'flex', gap: isBullet ? 8 : 0,
          }}>
            {isBullet && <span style={{ color: 'var(--wf-red)', flexShrink: 0, marginTop: 2 }}>•</span>}
            <span>
              {(isBullet ? bulletClean : clean).split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, j) => {
                if (part.startsWith('**') && part.endsWith('**'))
                  return <strong key={j} style={{ fontWeight: 600, color: 'var(--ink)' }}>{part.slice(2, -2)}</strong>
                if (part.startsWith('`') && part.endsWith('`'))
                  return <code key={j} style={{ fontSize: fontSize - 1, fontWeight: 600, color: 'var(--wf-red)', background: 'var(--wf-red-light)', padding: '1px 5px', borderRadius: 3, fontFamily: 'monospace' }}>{part.slice(1, -1)}</code>
                return <span key={j}>{part}</span>
              })}
            </span>
          </p>
        )
      })}
    </div>
  )
}

// ── Classification badges ─────────────────────────────────

function InfoClassBadge({ cls }: { cls?: string }) {
  if (!cls) return null
  const styles: Record<string, { bg: string; color: string; border: string }> = {
    Public:       { bg: '#EAF7F0', color: '#1A7F4B', border: 'rgba(26,127,75,0.25)' },
    Internal:     { bg: '#EFF6FF', color: '#1D4ED8', border: 'rgba(29,78,216,0.25)' },
    Confidential: { bg: '#FEF9EE', color: '#B45309', border: 'rgba(180,83,9,0.2)' },
    Restricted:   { bg: '#FEF2F2', color: '#CC2222', border: 'rgba(204,34,34,0.25)' },
  }
  const s = styles[cls] || styles.Internal
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
      background: s.bg, color: s.color, border: `0.5px solid ${s.border}`,
      whiteSpace: 'nowrap' as const, letterSpacing: '0.02em',
    }}>
      {cls}
    </span>
  )
}

function PiiClassBadge({ cls }: { cls?: string }) {
  if (!cls) return null
  const styles: Record<string, { bg: string; color: string; border: string }> = {
    PII:       { bg: '#FEF2F2', color: '#CC2222', border: 'rgba(204,34,34,0.25)' },
    Sensitive: { bg: '#FEF9EE', color: '#B45309', border: 'rgba(180,83,9,0.2)' },
    'Non-PII': { bg: '#F0EFED', color: '#4A4A4A', border: '#E5E3DF' },
  }
  const s = styles[cls] || styles['Non-PII']
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
      background: s.bg, color: s.color, border: `0.5px solid ${s.border}`,
      whiteSpace: 'nowrap' as const, letterSpacing: '0.02em',
    }}>
      {cls}
    </span>
  )
}

function CdeBadge({ isCde }: { isCde?: boolean }) {
  if (!isCde) return null
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
      background: 'var(--wf-red)', color: 'white',
      whiteSpace: 'nowrap' as const, letterSpacing: '0.04em',
    }}>
      CDE
    </span>
  )
}

// ── CDE Row ───────────────────────────────────────────────
function CDERow({ fact }: { fact: ExtractedFact }) {
  const [expanded, setExpanded] = useState(false)
  const found = fact.value != null
  return (
    <div style={{ borderBottom: '0.5px solid var(--border-1)', padding: '14px 20px', background: !found ? 'var(--surface-2)' : 'var(--surface)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        <div style={{ width: 200, flexShrink: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-2)', textTransform: 'capitalize' }}>
            {fact.field_name.replace(/_/g, ' ')}
          </div>
          {fact.business_definition && (
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 3, lineHeight: 1.5 }}>{fact.business_definition}</div>
          )}
          {/* Classification badges */}
          <div style={{ display: 'flex', gap: 4, marginTop: 5, flexWrap: 'wrap' as const }}>
            <CdeBadge isCde={fact.is_cde} />
            <InfoClassBadge cls={fact.info_classification} />
            <PiiClassBadge cls={fact.pii_classification} />
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {found ? (
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', wordBreak: 'break-word' }}>{fact.value}</div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Badge variant="warning" label="Not Found" />
              {fact.not_found_reason && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{fact.not_found_reason}</span>}
            </div>
          )}
          {fact.confidence_rationale && (
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4, fontStyle: 'italic', lineHeight: 1.5 }}>
              {fact.confidence_rationale}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {fact.provenance?.page && (
            <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 4, background: 'var(--wf-gold-light)', color: 'var(--wf-gold-dark)', border: '0.5px solid rgba(201,162,39,0.3)' }}>
              p.{fact.provenance.page}
            </span>
          )}
          {fact.provenance?.confidence_score != null && fact.provenance.confidence_score > 0 && (
            <span style={{ fontSize: 11, color: fact.provenance.confidence_score > 0.85 ? '#1A7F4B' : fact.provenance.confidence_score > 0.6 ? '#B45309' : 'var(--ink-3)' }}>
              {(fact.provenance.confidence_score * 100).toFixed(0)}%
            </span>
          )}
          {fact.raw_text && (
            <button onClick={() => setExpanded(!expanded)} style={{ fontSize: 11, color: 'var(--wf-red)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0, fontFamily: 'var(--font-body)' }}>
              {expanded ? 'hide source' : 'view source'}
            </button>
          )}
        </div>
      </div>
      {expanded && fact.raw_text && (
        <div style={{ marginTop: 10, padding: '10px 14px', background: 'var(--surface-3)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.6, fontStyle: 'italic', borderLeft: '3px solid var(--wf-gold)' }}>
          "{fact.raw_text.substring(0, 300)}{fact.raw_text.length > 300 ? '...' : ''}"
        </div>
      )}
    </div>
  )
}

// ── Health Score Breakdown ────────────────────────────────
function HealthBreakdown({ breakdown, score }: { breakdown: Record<string, number>; score?: number }) {
  const dims = [
    { key: 'CDE Core Completeness', weight: '40%', color: '#1D4ED8' },
    { key: 'Provenance Integrity',  weight: '30%', color: '#1A7F4B' },
    { key: 'Extraction Confidence', weight: '20%', color: '#B45309' },
    { key: 'Value Validity Rate',   weight: '10%', color: '#7C3AED' },
  ]

  return (
    <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border-1)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ padding: '14px 20px', borderBottom: '0.5px solid var(--border-1)', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Document Health Score</span>
        {score != null && (
          <span style={{ fontSize: 20, fontWeight: 700, color: score >= 70 ? '#1A7F4B' : score >= 50 ? '#B45309' : '#CC2222', fontFamily: 'var(--font-display)' }}>
            {score.toFixed(1)}<span style={{ fontSize: 12, fontWeight: 400, color: 'var(--ink-3)', marginLeft: 2 }}>/100</span>
          </span>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0 }}>
        {dims.map((dim, i) => {
          const val = breakdown[dim.key]
          return (
            <div key={dim.key} style={{
              padding: '18px 16px',
              borderRight: i < 3 ? '0.5px solid var(--border-1)' : 'none',
              textAlign: 'center' as const,
            }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: dim.color, fontFamily: 'var(--font-display)' }}>
                {val != null ? `${val.toFixed(1)}%` : '—'}
              </div>
              <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink-2)', marginTop: 4, lineHeight: 1.4 }}>{dim.key}</div>
              <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 3 }}>weight {dim.weight}</div>
              {val != null && (
                <div style={{ marginTop: 8, height: 4, borderRadius: 2, background: 'var(--surface-3)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, val)}%`, background: dim.color, borderRadius: 2 }} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Extraction Schema section ─────────────────────────────
function ExtractionSchemaSection({ schema }: { schema?: DiscoveredField[] }) {
  const [open, setOpen] = useState(false)
  if (!schema || schema.length === 0) return null

  const coreFields  = schema.filter(f => f.is_core_field)
  const cdeFields   = schema.filter(f => f.is_cde && !f.is_core_field)
  const otherFields = schema.filter(f => !f.is_cde && !f.is_core_field)

  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      style={{ background: 'var(--surface)', border: '0.5px solid var(--border-1)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}
    >
      <summary style={{
        padding: '14px 20px', cursor: 'pointer', listStyle: 'none',
        display: 'flex', alignItems: 'center', gap: 10,
        borderBottom: open ? '0.5px solid var(--border-1)' : 'none',
        background: 'var(--surface-2)',
      }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
          Discovered Extraction Schema
        </span>
        <span style={{ fontSize: 12, color: 'var(--ink-3)', fontStyle: 'italic' }}>
          {schema.length} fields · {coreFields.length} core · {cdeFields.length + coreFields.length} CDEs
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--wf-red)' }}>{open ? '▲ collapse' : '▼ expand'}</span>
      </summary>

      {open && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)' }}>
                {['Field', 'Description', 'Type', 'Core', 'CDE', 'Info Class', 'PII Class'].map(h => (
                  <th key={h} style={{ padding: '8px 14px', textAlign: 'left' as const, fontSize: 10, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '0.5px solid var(--border-1)', whiteSpace: 'nowrap' as const }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {schema.map((f, i) => (
                <tr key={i} style={{ background: f.is_core_field ? 'rgba(215,30,43,0.03)' : i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)', borderBottom: '0.5px solid var(--border-1)' }}>
                  <td style={{ padding: '9px 14px', fontWeight: f.is_core_field ? 600 : 400, fontSize: 12, color: 'var(--ink)', whiteSpace: 'nowrap' as const, fontFamily: 'monospace' }}>
                    {f.field_name}
                  </td>
                  <td style={{ padding: '9px 14px', fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5, maxWidth: 340 }}>
                    {f.description}
                  </td>
                  <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' as const }}>
                    <span style={{ fontSize: 11, fontFamily: 'monospace', background: 'var(--surface-3)', padding: '1px 6px', borderRadius: 3, color: 'var(--ink-2)', border: '0.5px solid var(--border-1)' }}>
                      {f.semantic_type}
                    </span>
                  </td>
                  <td style={{ padding: '9px 14px', textAlign: 'center' as const }}>
                    {f.is_core_field
                      ? <span style={{ fontSize: 12, color: 'var(--wf-red)', fontWeight: 700 }}>★</span>
                      : <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>—</span>}
                  </td>
                  <td style={{ padding: '9px 14px', textAlign: 'center' as const }}>
                    <CdeBadge isCde={f.is_cde} />
                  </td>
                  <td style={{ padding: '9px 14px' }}>
                    <InfoClassBadge cls={f.info_classification} />
                  </td>
                  <td style={{ padding: '9px 14px' }}>
                    <PiiClassBadge cls={f.pii_classification} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  )
}

// ── FR Y-14Q Validator ────────────────────────────────────
function FRY14Validator({ profile, results, setResults, filter, setFilter }: {
  profile: ProfileContract
  results: any
  setResults: (v: any) => void
  filter: string
  setFilter: (v: string) => void
}) {
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'

  const runValidation = async () => {
    setLoading(true)
    setError('')
    try {
      const res  = await fetch(`${API_BASE}/api/profiles/${profile.profile_id}/validate-fry14`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Validation failed')
      setResults(data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const statusStyle = (status: string) => {
    switch (status) {
      case 'pass':      return { bg: '#EAF7F0', color: '#1A7F4B', border: 'rgba(26,127,75,0.25)',   label: '✓ Pass' }
      case 'warn':      return { bg: '#FEF9EE', color: '#B45309', border: 'rgba(180,83,9,0.2)',    label: '⚠ Warn' }
      case 'fail':      return { bg: '#FEF2F2', color: '#CC2222', border: 'rgba(204,34,34,0.25)',  label: '✗ Fail' }
      case 'not_found': return { bg: '#F0EFED', color: '#4A4A4A', border: '#E5E3DF',               label: '— Not Found' }
      default:          return { bg: '#F0EFED', color: '#4A4A4A', border: '#E5E3DF',               label: status }
    }
  }

  if (!results) {
    return (
      <Card title="FR Y-14Q Schedule H Validator" subtitle="Federal Reserve Regulatory Compliance">
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🏛️</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>
            FR Y-14Q Schedule H Validation
          </div>
          <p style={{ fontSize: 14, color: 'var(--ink-2)', maxWidth: 520, margin: '0 auto 16px', lineHeight: 1.7 }}>
            Validates all extracted fields against Federal Reserve FR Y-14Q Schedule H.
            Every field from all four schedules is shown — matched fields are validated,
            unmatched fields are shown as Not Found.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' as const, marginBottom: 24 }}>
            {[
              'H.1 Corporate Loan — 104 fields',
              'H.2 Commercial Real Estate — 65 fields',
              'H.3 Line of Business — 2 fields',
              'H.4 Internal Risk Rating — 5 fields',
            ].map(s => (
              <span key={s} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 12, background: 'var(--surface-2)', border: '0.5px solid var(--border-1)', color: 'var(--ink-2)' }}>
                {s}
              </span>
            ))}
          </div>
          {error && (
            <div style={{ padding: '10px 16px', background: 'var(--wf-red-light)', border: '0.5px solid rgba(215,30,43,0.3)', borderRadius: 'var(--radius-md)', color: 'var(--wf-red)', fontSize: 13, marginBottom: 16 }}>
              {error}
            </div>
          )}
          <button
            onClick={runValidation}
            disabled={loading}
            style={{
              padding: '12px 32px', borderRadius: 'var(--radius-md)',
              background: loading ? 'var(--surface-3)' : 'var(--wf-red)',
              color: loading ? 'var(--ink-3)' : 'white',
              border: 'none', fontSize: 14, fontWeight: 500,
              cursor: loading ? 'default' : 'pointer',
              fontFamily: 'var(--font-body)',
            }}
          >
            {loading ? 'Running validation...' : 'Run Validation'}
          </button>
        </div>
      </Card>
    )
  }

  const { summary, results: validationResults } = results
  const filteredResults = filter === 'all'
    ? validationResults
    : validationResults.filter((r: any) => r.status === filter)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border-1)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-md)', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, var(--wf-gold) 0%, var(--wf-gold-dark) 100%)' }}/>
        <div style={{ padding: '16px 20px 14px', borderBottom: '0.5px solid var(--border-1)', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 3 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>FR Y-14Q Schedule H — Validation Results</span>
          <button onClick={() => { setResults(null); setFilter('all') }} style={{ fontSize: 12, color: 'var(--wf-red)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'var(--font-body)' }}>
            Re-run
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 0 }}>
          {[
            { label: 'Total Fields',  value: summary.total_checked, color: 'var(--ink)' },
            { label: 'Pass',          value: summary.pass,          color: '#1A7F4B'     },
            { label: 'Warnings',      value: summary.warn,          color: '#B45309'     },
            { label: 'Fail',          value: summary.fail,          color: '#CC2222'     },
            { label: 'Not Found',     value: summary.not_found,     color: 'var(--ink-3)'},
          ].map((item, i) => (
            <div key={item.label} style={{ padding: '20px 24px', borderRight: i < 4 ? '0.5px solid var(--border-1)' : 'none', textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: item.color, fontFamily: 'var(--font-display)' }}>{item.value}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>{item.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border-1)', borderRadius: 'var(--radius-lg)', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>Filter:</span>
        {[
          { label: 'All',                              value: 'all'       },
          { label: `✗ Fail (${summary.fail})`,         value: 'fail'      },
          { label: `⚠ Warn (${summary.warn})`,         value: 'warn'      },
          { label: `— Not Found (${summary.not_found})`, value: 'not_found'},
          { label: `✓ Pass (${summary.pass})`,         value: 'pass'      },
        ].map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            style={{
              padding: '5px 14px', borderRadius: 20,
              border: `1px solid ${filter === f.value ? 'var(--wf-red)' : 'var(--border-2)'}`,
              background: filter === f.value ? 'var(--wf-red)' : 'var(--surface-2)',
              color: filter === f.value ? 'white' : 'var(--ink-2)',
              fontSize: 12, fontWeight: filter === f.value ? 500 : 400,
              cursor: 'pointer', fontFamily: 'var(--font-body)',
              transition: 'all 0.15s ease',
            }}
          >
            {f.label}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink-3)' }}>
          {filteredResults.length} of {validationResults.length} fields shown
        </span>
      </div>

      {(['H.1', 'H.2', 'H.3', 'H.4'] as const).map(schedule => {
        const scheduleResults = filteredResults.filter((r: any) => r.schedule === schedule)
        if (scheduleResults.length === 0) return null
        return (
          <div key={schedule} style={{ background: 'var(--surface)', border: '0.5px solid var(--border-1)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ padding: '12px 20px', borderBottom: '0.5px solid var(--border-1)', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Schedule {schedule}</span>
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{scheduleResults.length} fields</span>
              <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                {(['pass', 'warn', 'fail', 'not_found'] as const).map(s => {
                  const count = scheduleResults.filter((r: any) => r.status === s).length
                  if (count === 0) return null
                  const st = statusStyle(s)
                  return (
                    <span key={s} style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 10, background: st.bg, color: st.color, border: `0.5px solid ${st.border}` }}>
                      {count} {s === 'not_found' ? 'not found' : s}
                    </span>
                  )
                })}
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
                <thead>
                  <tr style={{ background: 'var(--surface-2)' }}>
                    {['#', 'Schedule H Field', 'Document Field (LLM)', 'Req', 'Extracted Value', 'Confidence', 'Status', 'Message', 'Allowable Values'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left' as const, fontSize: 10, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase' as const, letterSpacing: '0.05em', borderBottom: '0.5px solid var(--border-1)', whiteSpace: 'nowrap' as const }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scheduleResults.map((r: any, i: number) => {
                    const s = statusStyle(r.status)
                    return (
                      <tr key={i} style={{ background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)', borderBottom: '0.5px solid var(--border-1)', opacity: r.status === 'not_found' && !r.required ? 0.55 : 1 }}>
                        <td style={{ padding: '8px 12px', fontSize: 11, color: 'var(--ink-3)', whiteSpace: 'nowrap' as const }}>{r.field_no}</td>
                        <td style={{ padding: '8px 12px', fontSize: 12, fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap' as const }}>{r.schedule_field}</td>
                        <td style={{ padding: '8px 12px', maxWidth: 160 }}>
                          {r.field_name && r.field_name !== r.schedule_field ? (
                            <span style={{ fontSize: 11, fontWeight: 500, background: 'var(--surface-2)', color: 'var(--ink-2)', border: '0.5px solid var(--border-2)', padding: '2px 7px', borderRadius: 4, fontFamily: 'monospace', whiteSpace: 'nowrap' as const }}>
                              {r.field_name.replace(/_/g, ' ')}
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, color: 'var(--ink-3)', fontStyle: 'italic' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' as const }}>
                          {r.required
                            ? <span style={{ fontSize: 12, color: 'var(--wf-red)', fontWeight: 700 }}>●</span>
                            : <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>○</span>}
                        </td>
                        <td style={{ padding: '8px 12px', maxWidth: 200 }}>
                          {r.extracted_value ? (
                            <code style={{ fontSize: 11, fontWeight: 600, color: 'var(--wf-red)', background: 'var(--wf-red-light)', padding: '1px 5px', borderRadius: 3, fontFamily: 'monospace' }}>
                              {r.extracted_value.length > 45 ? r.extracted_value.substring(0, 45) + '…' : r.extracted_value}
                            </code>
                          ) : (
                            <span style={{ fontSize: 11, color: 'var(--ink-3)', fontStyle: 'italic' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' as const }}>
                          {r.confidence > 0 ? (
                            <span style={{ fontSize: 11, fontWeight: 600, color: r.confidence >= 0.85 ? '#1A7F4B' : r.confidence >= 0.6 ? '#B45309' : 'var(--ink-3)' }}>
                              {(r.confidence * 100).toFixed(0)}%
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' as const }}>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: s.bg, color: s.color, border: `0.5px solid ${s.border}` }}>
                            {s.label}
                          </span>
                        </td>
                        <td style={{ padding: '8px 12px', fontSize: 11, color: 'var(--ink-2)', maxWidth: 240 }}>{r.message}</td>
                        <td style={{ padding: '8px 12px' }}>
                          {r.allowable_values && r.allowable_values.length > 0 ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 3 }}>
                              {r.allowable_values.slice(0, 3).map((v: string, j: number) => (
                                <span key={j} style={{ fontSize: 10, background: 'var(--surface-3)', padding: '1px 5px', borderRadius: 3, color: 'var(--ink-3)', border: '0.5px solid var(--border-1)', whiteSpace: 'nowrap' as const }}>
                                  {v.length > 18 ? v.substring(0, 18) + '…' : v}
                                </span>
                              ))}
                              {r.allowable_values.length > 3 && (
                                <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>+{r.allowable_values.length - 3} more</span>
                              )}
                            </div>
                          ) : (
                            <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>format check</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Main component ────────────────────────────────────────
function UnstructuredProfile({ profile, activeTab }: Props) {
  const [selectedPage, setSelectedPage]   = useState<number>(1)
  const [pageResult, setPageResult]       = useState<{ page: number; summary: string; key_entities: string[] } | null>(null)
  const [loadingPage, setLoadingPage]     = useState(false)
  const [pageError, setPageError]         = useState('')
  const [fryResults, setFryResults]       = useState<any>(null)
  const [fryFilter, setFryFilter]         = useState('all')
  const [mounted, setMounted]             = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'

  const fetchPageSummary = async (page: number) => {
    setLoadingPage(true)
    setPageError('')
    setPageResult(null)
    try {
      const res  = await fetch(`${API_BASE}/api/profiles/${profile.profile_id}/page-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Summary generation failed')
      setPageResult(data)
    } catch (e: any) {
      setPageError(e.message || 'Failed to generate summary')
    } finally {
      setLoadingPage(false)
    }
  }

  // Show top CDEs on overview: prefer is_cde=true, fall back to any with values
  const allFacts  = profile.critical_data_elements ?? []
  const coreCDEs  = allFacts.filter(f => f.value && f.is_cde)
  const overviewCDEs = (coreCDEs.length > 0
    ? coreCDEs
    : allFacts.filter(f => f.value)
  ).slice(0, 8)

  // ── OVERVIEW ──────────────────────────────────────────
  if (activeTab === 'overview') {
    if (!mounted) return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[1,2].map(i => (
          <div key={i} style={{ height: 120, borderRadius: 'var(--radius-lg)', background: 'var(--surface-2)', border: '0.5px solid var(--border-1)', animation: 'pulse 1.5s ease-in-out infinite' }}/>
        ))}
        <style>{`@keyframes pulse { 0%,100%{opacity:0.6} 50%{opacity:1} }`}</style>
      </div>
    )

    const hasSections = (profile.sections_detected?.length ?? 0) > 0
    const hasParties  = (profile.parties?.length ?? 0) > 0
    const sections    = profile.sections_detected ?? []
    const parties     = profile.parties ?? []

    const partyIcon = (name: string) => {
      const n = name.toLowerCase()
      if (n.includes('lend') || n.includes('bank'))   return { icon: 'LB', bg: '#1D4ED8', fg: 'white' }
      if (n.includes('borrow') || n.includes('debtor'))return { icon: 'BR', bg: '#7C3AED', fg: 'white' }
      if (n.includes('agent') || n.includes('admin')) return { icon: 'AG', bg: '#B45309', fg: 'white' }
      if (n.includes('guarantor'))                     return { icon: 'GU', bg: '#1A7F4B', fg: 'white' }
      return { icon: name.slice(0, 2).toUpperCase(), bg: 'var(--surface-3)', fg: 'var(--ink-2)' }
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── ROW 1: Key extracted facts — individual cards with gold top ── */}
        {overviewCDEs.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {overviewCDEs.slice(0, 8).map((fact, i) => (
              <div key={i} style={{
                background: 'var(--surface)',
                border: '0.5px solid var(--border-1)',
                borderRadius: 'var(--radius-lg)',
                overflow: 'hidden',
                boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                display: 'flex',
                flexDirection: 'column',
              }}>
                {/* Gold top bar */}
                <div style={{
                  height: 3,
                  background: fact.pii_classification === 'PII'
                    ? 'linear-gradient(90deg,#D71E2B,#AA1520)'
                    : 'linear-gradient(90deg, var(--wf-gold), var(--wf-gold-dark))',
                }}/>
                <div style={{ padding: '14px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {/* Label */}
                  <div style={{
                    fontSize: 10, fontWeight: 600, color: 'var(--ink-3)',
                    textTransform: 'uppercase', letterSpacing: '0.07em',
                    lineHeight: 1.2,
                  }}>
                    {fact.field_name.replace(/_/g, ' ')}
                  </div>
                  {/* Value */}
                  <div style={{
                    fontSize: 14, fontWeight: 700, color: 'var(--ink)',
                    lineHeight: 1.35, wordBreak: 'break-word', flex: 1,
                  }}>
                    {fact.value}
                  </div>
                  {/* Footer badges */}
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                    {fact.provenance?.page && (
                      <span style={{
                        fontSize: 9, fontWeight: 600,
                        color: 'var(--wf-gold-dark)', background: 'var(--wf-gold-light)',
                        padding: '1px 6px', borderRadius: 4,
                        border: '0.5px solid rgba(201,162,39,0.3)',
                      }}>
                        p.{fact.provenance.page}
                      </span>
                    )}
                    {fact.pii_classification && fact.pii_classification !== 'Non-PII' && (
                      <span style={{
                        fontSize: 9, fontWeight: 700,
                        color: 'var(--wf-red)', background: 'var(--wf-red-light)',
                        padding: '1px 6px', borderRadius: 4,
                        border: '0.5px solid rgba(215,30,43,0.2)',
                      }}>
                        {fact.pii_classification}
                      </span>
                    )}
                    {fact.is_cde && (
                      <span style={{
                        fontSize: 9, fontWeight: 700,
                        color: '#1D4ED8', background: '#EFF6FF',
                        padding: '1px 6px', borderRadius: 4,
                        border: '0.5px solid rgba(29,78,216,0.2)',
                      }}>
                        CDE
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── ROW 2: Structure (left) + Parties (right) ── */}
        {(hasSections || hasParties) && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: hasSections && hasParties ? '3fr 2fr' : '1fr',
            gap: 16,
            alignItems: 'start',
          }}>

            {/* Document Structure */}
            {hasSections && (() => {
              const articleCount = sections.filter(s => /^ARTICLE/i.test(s.trim())).length
              const sectionCount = sections.filter(s => /^Section/i.test(s.trim())).length
              return (
                <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border-1)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
                  {/* Header */}
                  <div style={{ padding: '12px 18px', borderBottom: '0.5px solid var(--border-1)', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', flex: 1 }}>Document Structure</span>
                    {articleCount > 0 && (
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: 'var(--wf-red-light)', color: 'var(--wf-red)', border: '0.5px solid rgba(215,30,43,0.18)' }}>
                        {articleCount} {articleCount === 1 ? 'Article' : 'Articles'}
                      </span>
                    )}
                    {sectionCount > 0 && (
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: 'var(--wf-gold-light)', color: 'var(--wf-gold-dark)', border: '0.5px solid rgba(201,162,39,0.2)' }}>
                        {sectionCount} {sectionCount === 1 ? 'Section' : 'Sections'}
                      </span>
                    )}
                    <span style={{ fontSize: 10, color: 'var(--ink-3)', marginLeft: 4 }}>{sections.length} total</span>
                  </div>

                  {/* Two-column section grid, scrollable */}
                  <div style={{ maxHeight: 320, overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                    {sections.map((s, i) => {
                      const isArticle = /^ARTICLE/i.test(s.trim())
                      const isSection = /^Section/i.test(s.trim())
                      const m       = s.match(/^((?:ARTICLE|Section)\s+[\w.]+)\s*[\-:—]?\s*(.*)/i)
                      const prefix  = m ? m[1].trim() : s.trim()
                      const title   = m ? m[2].trim() : ''
                      const cols    = 2
                      const isLastRow = i >= sections.length - (sections.length % cols || cols)
                      const isRight   = i % cols === cols - 1
                      return (
                        <div key={i} style={{
                          padding: '9px 14px',
                          borderBottom: isLastRow ? 'none' : '0.5px solid var(--border-1)',
                          borderRight: isRight ? 'none' : '0.5px solid var(--border-1)',
                          display: 'flex', gap: 8, alignItems: 'flex-start',
                          background: isArticle ? 'rgba(215,30,43,0.018)' : 'transparent',
                        }}>
                          <span style={{
                            flexShrink: 0, width: 18, height: 18, borderRadius: '50%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 8, fontWeight: 700, marginTop: 1,
                            background: isArticle ? 'var(--wf-red)' : isSection ? 'rgba(201,162,39,0.15)' : 'var(--surface-3)',
                            color: isArticle ? 'white' : isSection ? 'var(--wf-gold-dark)' : 'var(--ink-3)',
                          }}>
                            {i + 1}
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <div style={{
                              fontSize: 11, fontWeight: 700, lineHeight: 1.3,
                              color: isArticle ? 'var(--wf-red)' : 'var(--ink)',
                              textTransform: isArticle ? 'uppercase' as const : 'none' as const,
                              letterSpacing: isArticle ? '0.03em' : 0,
                            }}>{prefix}</div>
                            {title && (
                              <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 1, lineHeight: 1.35,
                                overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' as const }}>
                                {title}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {/* Parties */}
            {hasParties && (
              <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border-1)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ padding: '12px 18px', borderBottom: '0.5px solid var(--border-1)', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Parties Identified</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--wf-red)', background: 'var(--wf-red-light)', padding: '2px 8px', borderRadius: 20, border: '0.5px solid rgba(215,30,43,0.18)' }}>
                    {parties.length}
                  </span>
                </div>
                <div>
                  {parties.map((party, i) => {
                    const { icon, bg, fg } = partyIcon(party.field_name || '')
                    return (
                      <div key={i} style={{
                        padding: '13px 18px',
                        borderBottom: i < parties.length - 1 ? '0.5px solid var(--border-1)' : 'none',
                        display: 'flex', gap: 12, alignItems: 'center',
                      }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                          background: bg, color: fg,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
                        }}>
                          {icon}
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>
                            {party.field_name?.replace(/_/g, ' ')}
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {party.value
                              ? party.value
                              : <span style={{ color: 'var(--ink-3)', fontStyle: 'italic', fontWeight: 400, fontSize: 12 }}>Not identified</span>}
                          </div>
                        </div>
                        {party.provenance?.page && (
                          <span style={{ fontSize: 9, flexShrink: 0, color: 'var(--wf-gold-dark)', background: 'var(--wf-gold-light)', padding: '1px 6px', borderRadius: 3, fontWeight: 500 }}>
                            p.{party.provenance.page}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

          </div>
        )}

      </div>
    )
  }

  // ── CRITICAL DATA ELEMENTS ────────────────────────────
  if (activeTab === 'elements') {
    const foundCount   = profile.critical_data_elements?.filter(f => f.value).length || 0
    const missingCount = profile.critical_data_elements?.filter(f => !f.value).length || 0

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Discovered schema (collapsible) */}
        <ExtractionSchemaSection schema={profile.extraction_schema} />

        <Card
          title="Critical Data Elements"
          subtitle={`${foundCount} found · ${missingCount} missing`}
        >
          {profile.critical_data_elements?.map((fact, i) => <CDERow key={i} fact={fact} />)}
        </Card>

        {profile.additional_findings && profile.additional_findings.length > 0 && (
          <Card title="Additional Findings" subtitle="Discovered beyond standard schema" goldTop>
            {profile.additional_findings.map((fact, i) => <CDERow key={i} fact={fact} />)}
          </Card>
        )}

        {profile.monetary_amounts && profile.monetary_amounts.length > 0 && (
          <Card title="Monetary Amounts">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0 }}>
              {profile.monetary_amounts.map((amt, i) => (
                <div key={i} style={{ padding: '14px 20px', borderBottom: i < profile.monetary_amounts!.length - 3 ? '0.5px solid var(--border-1)' : 'none', borderRight: (i + 1) % 3 !== 0 ? '0.5px solid var(--border-1)' : 'none' }}>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', textTransform: 'capitalize', marginBottom: 4 }}>
                    {amt.field_name.replace(/_/g, ' ')}
                    {amt.provenance?.page && <span style={{ marginLeft: 6, background: 'var(--wf-gold-light)', color: 'var(--wf-gold-dark)', padding: '1px 5px', borderRadius: 3, fontSize: 10 }}>p.{amt.provenance.page}</span>}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--font-display)' }}>{amt.value}</div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {profile.key_dates && profile.key_dates.length > 0 && (
          <Card title="Key Dates">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0 }}>
              {profile.key_dates.map((d, i) => (
                <div key={i} style={{ padding: '14px 20px', borderBottom: i < profile.key_dates!.length - 3 ? '0.5px solid var(--border-1)' : 'none', borderRight: (i + 1) % 3 !== 0 ? '0.5px solid var(--border-1)' : 'none' }}>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', textTransform: 'capitalize', marginBottom: 4 }}>
                    {d.field_name.replace(/_/g, ' ')}
                    {d.provenance?.page && <span style={{ marginLeft: 6, background: 'var(--wf-gold-light)', color: 'var(--wf-gold-dark)', padding: '1px 5px', borderRadius: 3, fontSize: 10 }}>p.{d.provenance.page}</span>}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink)' }}>{d.value}</div>
                </div>
              ))}
            </div>
          </Card>
        )}

      </div>
    )
  }

  // ── SUMMARY ──────────────────────────────────────────
  if (activeTab === 'summary') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {profile.summary?.executive && (
          <Card title="Executive Summary" subtitle={`Generated by ${profile.llm_used || 'LLM'}`} goldTop>
            <div style={{ padding: '24px', maxHeight: 360, overflowY: 'auto' }}>
              <MarkdownText text={profile.summary.executive} fontSize={14} />
            </div>
          </Card>
        )}

        {profile.summary?.detailed && (
          <details style={{ background: 'var(--surface)', border: '0.5px solid var(--border-1)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
            <summary style={{ padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, listStyle: 'none', borderBottom: '0.5px solid var(--border-1)', background: 'var(--surface-2)' }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Detailed Summary</span>
              <Badge variant="neutral" label="Click to expand" />
            </summary>
            <div style={{ padding: '24px', maxHeight: 480, overflowY: 'auto' }}>
              <MarkdownText text={profile.summary.detailed} fontSize={14} />
            </div>
          </details>
        )}

        <Card title="Page-by-Page Summary" subtitle="Select a page · LLM generates the summary on demand">
          <div style={{ padding: '24px' }}>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-2)' }}>Select page:</span>
              <select
                value={selectedPage}
                onChange={e => { setSelectedPage(Number(e.target.value)); setPageResult(null); setPageError('') }}
                style={{ padding: '7px 14px', borderRadius: 'var(--radius-md)', border: '0.5px solid var(--border-2)', fontSize: 13, color: 'var(--ink)', background: 'var(--surface)', fontFamily: 'var(--font-body)', cursor: 'pointer', minWidth: 140 }}
              >
                {Array.from({ length: profile.page_count || 1 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>Page {i + 1}</option>
                ))}
              </select>
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>of {profile.page_count} pages</span>
              <button
                onClick={() => fetchPageSummary(selectedPage)}
                disabled={loadingPage}
                style={{ padding: '7px 20px', borderRadius: 'var(--radius-md)', background: loadingPage ? 'var(--surface-3)' : 'var(--wf-red)', color: loadingPage ? 'var(--ink-3)' : 'white', border: 'none', fontSize: 13, fontWeight: 500, cursor: loadingPage ? 'default' : 'pointer', fontFamily: 'var(--font-body)', transition: 'all 0.15s ease' }}
              >
                {loadingPage ? 'Generating…' : 'Generate Summary'}
              </button>
            </div>

            {loadingPage && (
              <div style={{ textAlign: 'center', padding: '28px' }}>
                <div style={{ width: 36, height: 36, border: '3px solid var(--surface-tertiary)', borderTop: '3px solid var(--wf-red)', borderRadius: '50%', margin: '0 auto 14px', animation: 'spin 1s linear infinite' }}/>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>Asking LLM to summarise page {selectedPage}…</p>
              </div>
            )}

            {pageError && !loadingPage && (
              <div style={{ padding: '12px 16px', background: 'var(--wf-red-light)', border: '0.5px solid rgba(215,30,43,0.3)', borderRadius: 'var(--radius-md)', color: 'var(--wf-red)', fontSize: 13 }}>
                {pageError}
              </div>
            )}

            {pageResult && !loadingPage && (
              <div style={{ background: 'var(--surface-2)', border: '0.5px solid var(--border-1)', borderRadius: 'var(--radius-md)', padding: '20px 24px', maxHeight: 400, overflowY: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: 'var(--wf-gold-light)', color: 'var(--wf-gold-dark)', border: '0.5px solid rgba(201,162,39,0.3)' }}>
                    Page {pageResult.page}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--ink-3)', fontStyle: 'italic' }}>AI-generated · Llama 4 Scout</span>
                </div>
                <p style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.8, margin: '0 0 14px 0' }}>{pageResult.summary}</p>
                {pageResult.key_entities.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Key entities on this page</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {pageResult.key_entities.map((e, i) => (
                        <span key={i} style={{ fontSize: 12, background: 'var(--surface)', color: 'var(--ink-2)', padding: '3px 10px', borderRadius: 4, border: '0.5px solid var(--border-2)' }}>{e}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {!pageResult && !loadingPage && !pageError && (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--ink-3)', fontSize: 13 }}>
                Select a page above and click <strong style={{ color: 'var(--ink-2)' }}>Generate Summary</strong> — the LLM will summarise only that page.
              </div>
            )}

          </div>
        </Card>


      </div>
    )
  }

  // ── OBLIGATIONS ──────────────────────────────────────
  if (activeTab === 'obligations') {
    const obligations = profile.obligations ?? []

    const obStyle = (type: string): { bg: string; border: string; color: string; icon: string } => {
      const t = type.toLowerCase()
      if (t.includes('financial'))   return { bg: '#FEF2F2', border: 'rgba(215,30,43,0.25)',  color: '#D71E2B', icon: '📊' }
      if (t.includes('negative'))    return { bg: '#FFF7ED', border: 'rgba(180,83,9,0.25)',   color: '#B45309', icon: '🚫' }
      if (t.includes('affirmative')) return { bg: '#EAF7F0', border: 'rgba(26,127,75,0.25)',  color: '#1A7F4B', icon: '✅' }
      if (t.includes('reporting'))   return { bg: '#EFF6FF', border: 'rgba(29,78,216,0.25)',  color: '#1D4ED8', icon: '📋' }
      if (t.includes('payment'))     return { bg: '#F5F3FF', border: 'rgba(124,58,237,0.25)', color: '#7C3AED', icon: '💳' }
      if (t.includes('information')) return { bg: '#EFF6FF', border: 'rgba(29,78,216,0.25)',  color: '#1D4ED8', icon: '📁' }
      return                                { bg: 'var(--surface-2)', border: 'var(--border-2)', color: 'var(--ink-2)', icon: '📌' }
    }

    // Summary counts by type
    const typeCounts: Record<string, number> = {}
    obligations.forEach(ob => {
      const label = ob.obligation_type.replace(/_/g, ' ')
      typeCounts[label] = (typeCounts[label] || 0) + 1
    })

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {obligations.length === 0 ? (
          <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border-1)', borderRadius: 'var(--radius-lg)', padding: '56px 40px', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>No obligations extracted</div>
            <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>No covenants or obligations were detected in this document.</div>
          </div>
        ) : (
          <>
            {/* Summary strip */}
            <div style={{
              display: 'flex', gap: 10, flexWrap: 'wrap',
              background: 'var(--surface)', border: '0.5px solid var(--border-1)',
              borderRadius: 'var(--radius-lg)', padding: '14px 18px',
              alignItems: 'center',
            }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 4 }}>
                {obligations.length} Total
              </span>
              {Object.entries(typeCounts).map(([label, count]) => {
                const { bg, border, color } = obStyle(label)
                return (
                  <span key={label} style={{
                    fontSize: 11, fontWeight: 600,
                    padding: '3px 10px', borderRadius: 20,
                    background: bg, color, border: `0.5px solid ${border}`,
                  }}>
                    {count} {label}
                  </span>
                )
              })}
            </div>

            {/* Obligation cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {obligations.map((ob, i) => {
                const { bg, border, color, icon } = obStyle(ob.obligation_type)
                return (
                  <div key={i} style={{
                    background: 'var(--surface)',
                    border: '0.5px solid var(--border-1)',
                    borderLeft: `4px solid ${color}`,
                    borderRadius: 'var(--radius-lg)',
                    padding: '16px 20px',
                    boxShadow: 'var(--shadow-sm)',
                    display: 'flex', flexDirection: 'column', gap: 10,
                  }}>
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700,
                        padding: '3px 10px', borderRadius: 20,
                        background: bg, color, border: `0.5px solid ${border}`,
                        textTransform: 'capitalize', whiteSpace: 'nowrap',
                        display: 'flex', alignItems: 'center', gap: 5,
                      }}>
                        <span>{icon}</span>
                        {ob.obligation_type.replace(/_/g, ' ')}
                      </span>
                      {ob.party_responsible && (
                        <span style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 500 }}>
                          → <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{ob.party_responsible}</span>
                        </span>
                      )}
                    </div>

                    {/* Description */}
                    <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.65 }}>
                      {ob.description}
                    </div>

                    {/* Trigger language */}
                    {ob.trigger_language && (
                      <div style={{
                        display: 'flex', alignItems: 'flex-start', gap: 8,
                        background: '#FFFBEB', border: '0.5px solid rgba(180,83,9,0.2)',
                        borderRadius: 8, padding: '8px 12px',
                      }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#B45309', whiteSpace: 'nowrap', marginTop: 1 }}>TRIGGER</span>
                        <span style={{ fontSize: 12, color: '#92400E', lineHeight: 1.5, fontStyle: 'italic' }}>
                          "{ob.trigger_language}"
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    )
  }

  // ── DATA DICTIONARY ──────────────────────────────────
  if (activeTab === 'dictionary') {
    const allFacts = [
      ...(profile.critical_data_elements || []),
      ...(profile.additional_findings || []),
    ].filter(f => f.value)

    return (
      <Card title="Data Dictionary" subtitle={`${allFacts.length} terms · Auto-generated by LLM`}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)' }}>
                {['Term', 'Value', 'Business Definition', 'Source Page', 'Confidence', 'CDE', 'Info Class', 'PII Class'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '0.5px solid var(--border-1)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allFacts.map((fact, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)', borderBottom: '0.5px solid var(--border-1)' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 500, fontSize: 13, color: 'var(--ink)', textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{fact.field_name.replace(/_/g, ' ')}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--wf-red)', fontWeight: 500, whiteSpace: 'nowrap' }}>{fact.value}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.6, minWidth: 200, maxWidth: 360 }}>{fact.business_definition || '—'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    {fact.provenance?.page
                      ? <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 4, background: 'var(--wf-gold-light)', color: 'var(--wf-gold-dark)', border: '0.5px solid rgba(201,162,39,0.3)' }}>p.{fact.provenance.page}</span>
                      : <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>—</span>}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {fact.provenance?.confidence_score != null && fact.provenance.confidence_score > 0
                      ? <Badge variant={fact.provenance.confidence_score > 0.85 ? 'high' : fact.provenance.confidence_score > 0.6 ? 'medium' : 'low'} label={`${(fact.provenance.confidence_score * 100).toFixed(0)}%`} />
                      : <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>—</span>}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <CdeBadge isCde={fact.is_cde} />
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <InfoClassBadge cls={fact.info_classification} />
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <PiiClassBadge cls={fact.pii_classification} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    )
  }

  // ── REGULATORY VALIDATION ────────────────────────────
  if (activeTab === 'regulatory') {
    return (
      <FRY14Validator
        profile={profile}
        results={fryResults}
        setResults={setFryResults}
        filter={fryFilter}
        setFilter={setFryFilter}
      />
    )
  }

  return null
}

export default UnstructuredProfile
