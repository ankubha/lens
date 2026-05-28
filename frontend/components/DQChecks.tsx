'use client'
import { useEffect, useState, useMemo, useRef } from 'react'
import {
  DQCheck, DQAnomaly, ScanResult, DQDimension, DQCheckStatus, DQCheckType,
  inferDQChecks, getDQChecks, updateCheckStatus, bulkUpdateChecks, runScan, getScanResult,
  uploadDQRules, addManualDQRule, getProfile,
} from '@/lib/api'

interface Props { profileId: string }

type Phase = 'idle' | 'inferring' | 'checks' | 'scanning' | 'results'

// ── Dimension colours ──────────────────────────────────────
const DIM_COLORS: Record<DQDimension, { bg: string; text: string }> = {
  completeness:  { bg: 'rgba(215,30,43,0.10)',  text: '#D71E2B' },
  validity:      { bg: 'rgba(59,130,246,0.12)', text: '#2563EB' },
  numeric:       { bg: 'rgba(26,127,75,0.12)',  text: '#1A7F4B' },
  string:        { bg: 'rgba(139,92,246,0.12)', text: '#7C3AED' },
  date_time:     { bg: 'rgba(245,158,11,0.12)', text: '#B45309' },
  cross_field:   { bg: 'rgba(6,182,212,0.12)',  text: '#0891B2' },
  aggregate:     { bg: 'rgba(220,38,38,0.12)',  text: '#DC2626' },
  dataset_level: { bg: 'rgba(79,70,229,0.12)',  text: '#4338CA' },
}

const SEV_COLORS: Record<string, string> = {
  high:   '#D71E2B',
  medium: '#B45309',
  low:    '#1A7F4B',
}

const ALL_CHECK_TYPES: DQCheckType[] = [
  // Completeness
  'not_null', 'any_not_null', 'required_values',
  // Validity
  'is_type', 'matches_pattern', 'expected_values', 'expected_schema', 'field_count',
  // Numeric
  'between', 'min_value', 'max_value', 'not_negative', 'positive', 'greater_than', 'less_than', 'distinct_count',
  // String
  'min_length', 'max_length',
  // DateTime
  'not_future', 'after_date_time', 'before_date_time', 'between_times',
  // Cross-field
  'greater_than_field', 'less_than_field', 'equal_to_field',
  // Aggregate
  'sum',
  // Dataset-level
  'unique',
  // Custom expression
  'satisfies_expression',
]

const CHECK_TYPE_GROUPS: { label: string; types: DQCheckType[] }[] = [
  { label: 'Completeness',  types: ['not_null', 'any_not_null', 'required_values'] },
  { label: 'Validity',      types: ['is_type', 'matches_pattern', 'expected_values', 'expected_schema', 'field_count'] },
  { label: 'Numeric',       types: ['between', 'min_value', 'max_value', 'not_negative', 'positive', 'greater_than', 'less_than', 'distinct_count'] },
  { label: 'String',        types: ['min_length', 'max_length'] },
  { label: 'DateTime',      types: ['not_future', 'after_date_time', 'before_date_time', 'between_times'] },
  { label: 'Cross-field',   types: ['greater_than_field', 'less_than_field', 'equal_to_field'] },
  { label: 'Aggregate',     types: ['sum'] },
  { label: 'Dataset-level', types: ['unique'] },
  { label: 'Custom',        types: ['satisfies_expression'] },
]

const ALL_DIMENSIONS: DQDimension[] = [
  'completeness', 'validity', 'numeric', 'string',
  'date_time', 'cross_field', 'aggregate', 'dataset_level',
]

const PARAM_HINTS: Record<string, string> = {
  not_null:               '{}',
  any_not_null:           '{"columns": ["col_a", "col_b"]}',
  required_values:        '{"required": ["val1", "val2"]}',
  is_type:                '{"expected_type": "numeric"}',
  matches_pattern:        '{"pattern": "^\\\\d{4}-\\\\d{2}-\\\\d{2}$"}',
  expected_values:        '{"allowed_values": ["A", "B", "C"]}',
  expected_schema:        '{}',
  field_count:            '{"min": 5, "max": 20}',
  between:                '{"min": 0, "max": 100}',
  min_value:              '{"min": 0}',
  max_value:              '{"max": 1000}',
  not_negative:           '{}',
  positive:               '{}',
  greater_than:           '{"threshold": 0}',
  less_than:              '{"threshold": 1000000}',
  distinct_count:         '{"min": 2, "max": 50}',
  min_length:             '{"min_length": 1}',
  max_length:             '{"max_length": 255}',
  not_future:             '{}',
  after_date_time:      '{"after": "2020-01-01"}',
  before_date_time:     '{"before": "2030-12-31"}',
  between_times:        '{"after": "2020-01-01", "before": "2030-12-31"}',
  greater_than_field:   '{"field": "other_column"}',
  less_than_field:      '{"field": "other_column"}',
  equal_to_field:       '{"field": "other_column"}',
  sum:                  '{"min": 0, "max": 1000000000}',
  unique:               '{}',
  satisfies_expression: '{"expression": "col_a > col_b"}',
}

// ── DQ Score semicircle gauge ──────────────────────────────
function DQGauge({ score }: { score: number }) {
  const r = 54
  const stroke = 10
  const circumference = Math.PI * r
  const filled = (score / 100) * circumference
  const cx = r + stroke, cy = r + stroke
  const color = score >= 80 ? '#1A7F4B' : score >= 50 ? '#B45309' : '#D71E2B'
  const dim = (r + stroke) * 2
  return (
    <div style={{ position: 'relative', width: dim, height: r + stroke + 20, flexShrink: 0 }}>
      <svg width={dim} height={r + stroke + 4} viewBox={`0 0 ${dim} ${r + stroke}`} style={{ overflow: 'visible' }}>
        <path
          d={`M ${stroke} ${r + stroke} A ${r} ${r} 0 0 1 ${dim - stroke} ${r + stroke}`}
          fill="none" stroke="var(--surface-tertiary, #E5E7EB)" strokeWidth={stroke} strokeLinecap="round"
        />
        <path
          d={`M ${stroke} ${r + stroke} A ${r} ${r} 0 0 1 ${dim - stroke} ${r + stroke}`}
          fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          style={{ transition: 'stroke-dasharray 1s ease' }}
        />
      </svg>
      <div style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', textAlign: 'center' }}>
        <div style={{ fontSize: 26, fontWeight: 700, color, fontFamily: 'var(--font-display)', lineHeight: 1 }}>
          {score.toFixed(1)}
        </div>
        <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>/ 100</div>
      </div>
    </div>
  )
}

// ── Severity badge ─────────────────────────────────────────
function SeverityBadge({ severity }: { severity?: string }) {
  const sev = (severity ?? 'MEDIUM').toUpperCase()
  const colors: Record<string, { bg: string; text: string; border: string }> = {
    HIGH:   { bg: 'rgba(215,30,43,0.10)',  text: '#D71E2B', border: 'rgba(215,30,43,0.3)' },
    MEDIUM: { bg: 'rgba(180,83,9,0.10)',   text: '#B45309', border: 'rgba(180,83,9,0.3)'  },
    LOW:    { bg: 'rgba(26,127,75,0.10)',  text: '#1A7F4B', border: 'rgba(26,127,75,0.3)' },
  }
  const c = colors[sev] ?? colors.MEDIUM
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
      background: c.bg, color: c.text, border: `0.5px solid ${c.border}`,
      letterSpacing: '0.04em',
    }}>{sev}</span>
  )
}

// ── Parameter pills ────────────────────────────────────────
function ParamPills({ params, checkType }: { params: Record<string, any>; checkType: DQCheckType }) {
  const skip = new Set(['ks_statistic', 'p_value', 'distribution', 'q1', 'q3', 'iqr', 'mean', 'std',
    'loc', 'scale', 's', 'null_threshold_pct', 'min_unique_pct', 'pattern_example'])
  const entries = Object.entries(params).filter(([k]) => !skip.has(k))
  if (entries.length === 0) return null
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {entries.map(([k, v]) => {
          const display = Array.isArray(v)
            ? `${k}: [${v.slice(0, 3).join(', ')}${v.length > 3 ? ', …' : ''}]`
            : typeof v === 'number'
            ? `${k}: ${Number.isInteger(v) ? v : v.toFixed(4)}`
            : `${k}: ${v}`
          return (
            <span key={k} style={{
              fontSize: 10, fontFamily: 'monospace',
              background: 'var(--surface-2)', border: '0.5px solid var(--border-1)',
              borderRadius: 4, padding: '2px 6px', color: 'var(--ink-2)',
            }}>
              {display}
            </span>
          )
        })}
      </div>
      {checkType === 'pattern_match' && params.pattern_example != null && (
        <div style={{ marginTop: 5, fontSize: 11, color: 'var(--ink-3)' }}>
          e.g.{' '}
          <code style={{
            fontSize: 11, fontFamily: 'monospace',
            background: 'var(--surface-2)', border: '0.5px solid var(--border-1)',
            borderRadius: 4, padding: '1px 5px', color: 'var(--ink)',
          }}>{params.pattern_example}</code>
        </div>
      )}
    </div>
  )
}

// ── Single check card ──────────────────────────────────────
function CheckCard({ check, onStatusChange }: {
  check: DQCheck
  onStatusChange: (id: string, status: DQCheckStatus) => void
}) {
  const dim = DIM_COLORS[check.dimension] ?? { bg: 'var(--surface-2)', text: 'var(--ink-3)' }
  const isAuthorized  = check.status === 'authorized'
  const isRejected    = check.status === 'rejected'
  const isUserDefined = check.source === 'user_defined'
  const hasScanData   = check.pass_count != null

  return (
    <div style={{
      background: 'var(--surface)',
      borderTop:    `0.5px solid ${isAuthorized ? 'rgba(26,127,75,0.4)' : isRejected ? 'rgba(215,30,43,0.2)' : isUserDefined ? 'rgba(37,99,235,0.3)' : 'var(--border-1)'}`,
      borderRight:  `0.5px solid ${isAuthorized ? 'rgba(26,127,75,0.4)' : isRejected ? 'rgba(215,30,43,0.2)' : isUserDefined ? 'rgba(37,99,235,0.3)' : 'var(--border-1)'}`,
      borderBottom: `0.5px solid ${isAuthorized ? 'rgba(26,127,75,0.4)' : isRejected ? 'rgba(215,30,43,0.2)' : isUserDefined ? 'rgba(37,99,235,0.3)' : 'var(--border-1)'}`,
      borderLeft:   isUserDefined ? '3px solid #2563EB' : `0.5px solid ${isAuthorized ? 'rgba(26,127,75,0.4)' : isRejected ? 'rgba(215,30,43,0.2)' : 'var(--border-1)'}`,
      borderRadius: 'var(--radius-md)',
      padding: '14px 16px',
      opacity: isRejected ? 0.55 : 1,
      transition: 'opacity 0.2s',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 5 }}>
            <code style={{
              fontSize: 12, fontFamily: 'monospace', fontWeight: 600,
              color: 'var(--ink)', background: 'var(--surface-2)',
              border: '0.5px solid var(--border-1)', borderRadius: 4,
              padding: '1px 6px',
            }}>{check.column_name}</code>
            <span style={{
              fontSize: 11, fontWeight: 500, padding: '2px 8px',
              borderRadius: 10, background: dim.bg, color: dim.text,
            }}>{check.check_type.replace(/_/g, ' ')}</span>
            <span style={{
              fontSize: 10, padding: '1px 6px', borderRadius: 10,
              background: 'var(--surface-2)', color: 'var(--ink-3)',
              border: '0.5px solid var(--border-1)',
            }}>{check.dimension}</span>
            <SeverityBadge severity={check.severity} />
            {isUserDefined ? (
              <span style={{
                fontSize: 10, padding: '1px 7px', borderRadius: 10, fontWeight: 600,
                background: 'rgba(37,99,235,0.1)', color: '#2563EB',
                border: '0.5px solid rgba(37,99,235,0.3)',
              }}>Authored</span>
            ) : (
              <span style={{
                fontSize: 10, padding: '1px 7px', borderRadius: 10, fontWeight: 600,
                background: 'rgba(6,182,212,0.1)', color: '#0891B2',
                border: '0.5px solid rgba(6,182,212,0.3)',
              }}>Inferred</span>
            )}
          </div>
          <p style={{ fontSize: 12, color: 'var(--ink-2)', margin: 0, lineHeight: 1.5 }}>
            {check.description || <em style={{ color: 'var(--ink-3)' }}>No description</em>}
          </p>
          {check.rationale && (
            <p style={{ fontSize: 11, color: 'var(--ink-3)', margin: '4px 0 0', lineHeight: 1.4, fontStyle: 'italic' }}>
              {check.rationale}
            </p>
          )}
          <ParamPills params={check.parameters} checkType={check.check_type} />
        </div>
        {/* Actions */}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {isRejected ? (
            <button onClick={() => onStatusChange(check.check_id, 'pending')} style={{
              fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '0.5px solid var(--border-1)',
              background: 'transparent', color: 'var(--ink-3)', cursor: 'pointer',
            }}>Restore</button>
          ) : (
            <>
              <button onClick={() => onStatusChange(check.check_id, isAuthorized ? 'pending' : 'authorized')} style={{
                fontSize: 11, padding: '4px 10px', borderRadius: 6, border: 'none',
                background: isAuthorized ? '#1A7F4B' : 'rgba(26,127,75,0.12)',
                color: isAuthorized ? '#fff' : '#1A7F4B', cursor: 'pointer', fontWeight: 500,
              }}>{isAuthorized ? '✓ Authorized' : 'Authorize'}</button>
              <button onClick={() => onStatusChange(check.check_id, 'rejected')} style={{
                fontSize: 11, padding: '4px 10px', borderRadius: 6,
                border: '0.5px solid var(--border-1)', background: 'transparent',
                color: 'var(--ink-3)', cursor: 'pointer',
              }}>Reject</button>
            </>
          )}
        </div>
      </div>

      {/* Scan results row */}
      {hasScanData && (
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <span style={{
            fontSize: 11, padding: '3px 8px', borderRadius: 6,
            background: 'rgba(26,127,75,0.1)', color: '#1A7F4B', fontWeight: 500,
          }}>✓ {(check.pass_count ?? 0).toLocaleString()} pass</span>
          {(check.fail_count ?? 0) > 0 && (
            <span style={{
              fontSize: 11, padding: '3px 8px', borderRadius: 6,
              background: 'rgba(215,30,43,0.1)', color: '#D71E2B', fontWeight: 500,
            }}>✗ {(check.fail_count ?? 0).toLocaleString()} fail ({check.fail_pct?.toFixed(1)}%)</span>
          )}
        </div>
      )}
    </div>
  )
}

// ── Anomaly row ────────────────────────────────────────────
function AnomalyRow({ anomaly, isCustom, check }: {
  anomaly: DQAnomaly
  isCustom: boolean
  check?: DQCheck
}) {
  const [expanded, setExpanded] = useState(false)
  const isRecord = anomaly.anomaly_type === 'record'
  const sevColor = SEV_COLORS[anomaly.severity] ?? 'var(--ink-3)'

  // For satisfies_expression, highlight every column referenced in the expression
  const offendingCols = new Set<string>([anomaly.column_name])
  if (check?.check_type === 'satisfies_expression' && check.parameters?.expression && anomaly.row_data) {
    const expr = String(check.parameters.expression)
    for (const col of Object.keys(anomaly.row_data)) {
      if (expr.includes(col)) offendingCols.add(col)
    }
  }

  return (
    <>
      <tr
        style={{
          borderBottom: expanded ? 'none' : '0.5px solid var(--border-1)',
          background: expanded ? 'rgba(215,30,43,0.03)' : 'transparent',
          cursor: isRecord ? 'pointer' : 'default',
        }}
        onClick={() => isRecord && setExpanded(e => !e)}
      >
        <td style={{ padding: '10px 12px', width: 70 }}>
          <span style={{
            fontSize: 11, fontWeight: 600, padding: '2px 7px',
            borderRadius: 10, background: `${sevColor}18`, color: sevColor,
          }}>{anomaly.severity}</span>
        </td>
        <td style={{ padding: '10px 12px' }}>
          <code style={{ fontSize: 12 }}>{anomaly.column_name}</code>
        </td>
        <td style={{ padding: '10px 12px' }}>
          <span style={{
            fontSize: 11, padding: '2px 7px', borderRadius: 10, fontWeight: 500,
            background: isRecord ? 'rgba(59,130,246,0.12)' : 'rgba(245,158,11,0.12)',
            color: isRecord ? '#2563EB' : '#B45309',
          }}>{anomaly.anomaly_type}</span>
        </td>
        <td style={{ padding: '10px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '2px 8px',
              borderRadius: 6, fontFamily: 'monospace',
              background: 'var(--surface-2)', border: '0.5px solid var(--border-1)',
              color: 'var(--ink)', whiteSpace: 'nowrap',
            }}>{anomaly.check_type.replace(/_/g, ' ')}</span>
            {isCustom ? (
              <span style={{
                fontSize: 10, padding: '1px 6px', borderRadius: 10, fontWeight: 600,
                background: 'rgba(37,99,235,0.1)', color: '#2563EB',
                border: '0.5px solid rgba(37,99,235,0.3)', whiteSpace: 'nowrap',
              }}>Custom Rule</span>
            ) : (
              <span style={{
                fontSize: 10, padding: '1px 6px', borderRadius: 10, fontWeight: 600,
                background: 'rgba(6,182,212,0.08)', color: '#0891B2',
                border: '0.5px solid rgba(6,182,212,0.25)', whiteSpace: 'nowrap',
              }}>Inferred</span>
            )}
          </div>
        </td>
        <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--ink-2)' }}>
          {anomaly.description}
        </td>
        <td style={{ padding: '10px 12px', width: 80, textAlign: 'right' }}>
          {isRecord && (
            <span style={{
              fontSize: 11, padding: '3px 8px', borderRadius: 6, fontWeight: 500,
              background: expanded ? 'rgba(215,30,43,0.1)' : 'var(--surface-2)',
              color: expanded ? '#D71E2B' : 'var(--ink-3)',
              border: `0.5px solid ${expanded ? 'rgba(215,30,43,0.25)' : 'var(--border-1)'}`,
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              {expanded ? 'Hide' : 'View row'}
              <span style={{ fontSize: 10, display: 'inline-block', transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'none' }}>▾</span>
            </span>
          )}
        </td>
      </tr>
      {expanded && isRecord && anomaly.row_data && (
        <tr style={{ borderBottom: '0.5px solid var(--border-1)' }}>
          <td colSpan={6} style={{ padding: '0 12px 14px' }}>
            <div style={{
              background: 'var(--surface)',
              border: '1px solid rgba(215,30,43,0.2)',
              borderRadius: 8, padding: '12px 14px',
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: '#D71E2B' }}>⚠</span>
                Row {anomaly.row_index != null ? `#${anomaly.row_index}` : ''} — offending value highlighted
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {Object.entries(anomaly.row_data).map(([k, v]) => {
                  const isOffending = offendingCols.has(k)
                  return (
                    <div key={k} style={{
                      background: isOffending ? 'rgba(215,30,43,0.07)' : 'var(--surface-2)',
                      border: isOffending ? '2px solid #D71E2B' : '0.5px solid var(--border-1)',
                      borderRadius: 6, padding: '7px 11px', minWidth: 90,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                        <span style={{ fontSize: 10, color: isOffending ? '#D71E2B' : 'var(--ink-3)', fontWeight: isOffending ? 600 : 400 }}>{k}</span>
                        {isOffending && (
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
                            background: '#D71E2B', color: '#fff', letterSpacing: '0.04em', flexShrink: 0,
                          }}>ERROR</span>
                        )}
                      </div>
                      <div style={{
                        fontSize: 12, fontWeight: isOffending ? 700 : 400,
                        color: isOffending ? '#D71E2B' : 'var(--ink)',
                        fontFamily: 'monospace', wordBreak: 'break-all',
                      }}>{String(v ?? '—')}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ── JSON auto-repair for manual parameter entry ────────────
function repairJson(raw: string): Record<string, unknown> | null {
  let s = raw.trim()
  if (!s) return {}
  try { return JSON.parse(s) } catch {}

  // Wrap bare key:value pairs that have no outer braces
  if (!s.startsWith('{')) s = `{${s}}`
  if (!s.endsWith('}') && !s.endsWith(']')) s = `${s}}`

  // Python literals → JSON
  s = s.replace(/\bNone\b/g, 'null')
       .replace(/\bTrue\b/g, 'true')
       .replace(/\bFalse\b/g, 'false')
  // Single quotes → double quotes
  s = s.replace(/'/g, '"')
  // Trailing commas before closing bracket/brace
  s = s.replace(/,(\s*[}\]])/g, '$1')
  // Unquoted object keys
  s = s.replace(/([{,]\s*)([A-Za-z_]\w*)(\s*:)/g, '$1"$2"$3')
  // Unquoted string values (not numbers, booleans, null, or already-quoted)
  s = s.replace(/:\s*([A-Za-z][A-Za-z0-9_.*+?^${}()|[\]\\-]*)\s*([,}])/g,
    (_, v, tail) => /^(true|false|null)$/.test(v) ? `: ${v}${tail}` : `: "${v}"${tail}`)

  try { return JSON.parse(s) } catch { return null }
}

// ── Main component ─────────────────────────────────────────
export default function DQChecks({ profileId }: Props) {
  const [phase, setPhase]       = useState<Phase>('idle')
  const [checks, setChecks]     = useState<DQCheck[]>([])
  const [scanResult, setScan]   = useState<ScanResult | null>(null)
  const [error, setError]       = useState('')
  const [profileColumns, setProfileColumns] = useState<string[]>([])

  // Section visibility
  const [showInferred,    setShowInferred]    = useState(true)
  const [showCustom,      setShowCustom]      = useState(false)

  // Inferred-check filters
  const [filterDim,    setFilterDim]    = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterType,   setFilterType]   = useState<string>('all')

  // Anomaly filters
  const [filterSev,        setFilterSev]        = useState<string>('all')
  const [filterCol,        setFilterCol]        = useState('')
  const [filterAType,      setFilterAType]      = useState<string>('all')
  const [filterACheckType, setFilterACheckType] = useState<string>('all')
  const [filterASource,    setFilterASource]    = useState<string>('all')

  // Authored rules section ref (for scroll-to on idle CTA)
  const customSectionRef = useRef<HTMLDivElement>(null)

  // Upload
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading,    setUploading]    = useState(false)
  const [uploadMsg,    setUploadMsg]    = useState('')
  const [uploadIsErr,  setUploadIsErr]  = useState(false)

  // Manual form
  const [showManualForm,   setShowManualForm]   = useState(false)
  const [manualCol,        setManualCol]        = useState('')
  const [manualCheckType,  setManualCheckType]  = useState<DQCheckType>('not_null')
  const [manualDimension,  setManualDimension]  = useState<DQDimension>('validity')
  const [manualDescription,setManualDescription]= useState('')
  const [manualParams,     setManualParams]     = useState('{}')
  const [manualError,      setManualError]      = useState('')
  const [manualSaving,     setManualSaving]     = useState(false)

  // ── Derived ──────────────────────────────────────────────
  const inferredChecks = useMemo(() => checks.filter(c => (c.source ?? 'inferred') !== 'user_defined'), [checks])
  const customChecks   = useMemo(() => checks.filter(c => c.source === 'user_defined'), [checks])
  const authorizedCount = checks.filter(c => c.status === 'authorized').length

  const filteredInferred = useMemo(() => inferredChecks.filter(c => {
    if (filterDim    !== 'all' && c.dimension  !== filterDim)    return false
    if (filterStatus !== 'all' && c.status     !== filterStatus) return false
    if (filterType   !== 'all' && c.check_type !== filterType)   return false
    return true
  }), [inferredChecks, filterDim, filterStatus, filterType])

  const groupedByDim = useMemo(() => {
    const g: Record<string, DQCheck[]> = {}
    for (const c of filteredInferred) {
      if (!g[c.dimension]) g[c.dimension] = []
      g[c.dimension].push(c)
    }
    return g
  }, [filteredInferred])


  const checkMap = useMemo(() => {
    const m: Record<string, DQCheck> = {}
    for (const c of checks) m[c.check_id] = c
    return m
  }, [checks])

  const filteredAnomalies = useMemo(() => {
    if (!scanResult) return []
    return scanResult.anomalies.filter(a => {
      if (filterSev        !== 'all' && a.severity     !== filterSev)        return false
      if (filterAType      !== 'all' && a.anomaly_type !== filterAType)      return false
      if (filterACheckType !== 'all' && a.check_type   !== filterACheckType) return false
      if (filterCol && a.column_name !== filterCol) return false
      if (filterASource !== 'all') {
        const src = checkMap[a.check_id]?.source ?? 'inferred'
        const isCustom = src === 'user_defined'
        if (filterASource === 'custom' && !isCustom)   return false
        if (filterASource === 'inferred' && isCustom)  return false
      }
      return true
    })
  }, [scanResult, filterSev, filterAType, filterACheckType, filterCol, filterASource, checkMap])

  // ── Restore on mount ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    async function restore() {
      try {
        const [checksData, scanData, profileData] = await Promise.all([
          getDQChecks(profileId).catch(() => null),
          getScanResult(profileId).catch(() => null),
          getProfile(profileId).catch(() => null),
        ])
        if (!cancelled && profileData?.columns) {
          setProfileColumns(profileData.columns.map((c: { column_name: string }) => c.column_name))
        }
        if (cancelled) return
        if (checksData && checksData.total > 0) {
          setChecks(checksData.checks)
          setScan(scanData)
          setPhase(scanData ? 'results' : 'checks')
          if (scanData) setShowInferred(false)
        }
      } catch {
        // stay idle
      }
    }
    restore()
    return () => { cancelled = true }
  }, [profileId])

  // ── Handlers ─────────────────────────────────────────────
  const handleInfer = async () => {
    setPhase('inferring')
    setError('')
    try {
      const data = await inferDQChecks(profileId)
      setChecks(prev => {
        // keep existing custom rules, replace inferred ones
        const custom = prev.filter(c => c.source === 'user_defined')
        return [...data.checks, ...custom]
      })
      setPhase('checks')
    } catch (e: any) {
      setError(e.message)
      setPhase('idle')
    }
  }

  const handleStatusChange = async (checkId: string, status: DQCheckStatus) => {
    try {
      await updateCheckStatus(profileId, checkId, status)
      setChecks(prev => prev.map(c => c.check_id === checkId ? { ...c, status } : c))
    } catch (e: any) { setError(e.message) }
  }

  const handleBulk = async (status: DQCheckStatus) => {
    try {
      await bulkUpdateChecks(profileId, status)
      setChecks(prev => prev.map(c => ({ ...c, status })))
    } catch (e: any) { setError(e.message) }
  }

  const handleScan = async () => {
    setPhase('scanning')
    setError('')
    try {
      const result = await runScan(profileId)
      setScan(result)
      setShowInferred(false)
      const resultMap = Object.fromEntries(result.check_results.map(c => [c.check_id, c]))
      setChecks(prev => prev.map(c => resultMap[c.check_id]
        ? { ...c, pass_count: resultMap[c.check_id].pass_count, fail_count: resultMap[c.check_id].fail_count, fail_pct: resultMap[c.check_id].fail_pct }
        : c
      ))
      setPhase('results')
      setShowCustom(false)
    } catch (e: any) {
      setError(e.message)
      setPhase('checks')
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadMsg('')
    setUploadIsErr(false)
    try {
      const result = await uploadDQRules(profileId, file)
      setChecks(prev => [...prev, ...result.checks])
      if (phase === 'idle' && result.added > 0) setPhase('checks')
      if (result.errors.length > 0) {
        setUploadMsg(`Loaded ${result.added} rule${result.added !== 1 ? 's' : ''}. Skipped: ${result.errors.join('; ')}`)
        setUploadIsErr(true)
      } else {
        setUploadMsg(`Successfully loaded ${result.added} rule${result.added !== 1 ? 's' : ''}`)
        setUploadIsErr(false)
      }
    } catch (e: any) {
      setUploadMsg(e.message)
      setUploadIsErr(true)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleAddManual = async () => {
    setManualError('')
    if (!manualCol.trim()) { setManualError('Column name is required.'); return }

    // Try to parse params; if broken, auto-repair common JSON issues before giving up
    let params: Record<string, any> = {}
    const raw = manualParams.trim()
    if (raw && raw !== '{}') {
      try {
        params = JSON.parse(raw)
      } catch {
        const repaired = repairJson(raw)
        if (repaired !== null) {
          params = repaired
        }
        // If still null, send {} and let the backend fill in defaults for the check type
      }
    }

    setManualSaving(true)
    try {
      const check = await addManualDQRule(profileId, {
        column_name: manualCol.trim(),
        check_type: manualCheckType,
        dimension: manualDimension,
        description: manualDescription,
        parameters: params,
      })
      setChecks(prev => [...prev, check])
      if (phase === 'idle') setPhase('checks')
      setShowManualForm(false)
      setManualCol('')
      setManualDescription('')
      setManualParams('{}')
    } catch (e: any) {
      setManualError(e.message)
    } finally {
      setManualSaving(false)
    }
  }

  // ── Shared styles ────────────────────────────────────────
  const card: React.CSSProperties = {
    background: 'var(--surface)', border: '0.5px solid var(--border-1)',
    borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)',
  }
  const btnPrimary: React.CSSProperties = {
    padding: '9px 20px', borderRadius: 'var(--radius-md)', border: 'none',
    background: 'var(--wf-red)', color: '#fff', fontSize: 13, fontWeight: 500,
    cursor: 'pointer', fontFamily: 'var(--font-body)',
  }
  const btnGhost: React.CSSProperties = {
    padding: '7px 14px', borderRadius: 'var(--radius-md)',
    border: '0.5px solid var(--border-1)', background: 'transparent',
    color: 'var(--ink-2)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)',
  }
  const selectStyle: React.CSSProperties = {
    padding: '6px 28px 6px 10px', borderRadius: 'var(--radius-md)', fontSize: 12,
    border: '0.5px solid var(--border-1)', background: 'var(--surface)',
    color: 'var(--ink)', cursor: 'pointer',
    appearance: 'none', WebkitAppearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M2 4l4 4 4-4' stroke='%238A8A8A' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
  }
  const inputStyle: React.CSSProperties = {
    padding: '7px 10px', borderRadius: 'var(--radius-md)', fontSize: 12,
    border: '0.5px solid var(--border-1)', background: 'var(--surface)',
    color: 'var(--ink)', outline: 'none', boxSizing: 'border-box',
  }

  // ── User-defined rules section (shared between idle + checks/results) ──
  const customSection = (
    <div ref={customSectionRef} style={{ ...card, border: '0.5px solid rgba(37,99,235,0.25)', overflow: 'visible' }}>
      <button
        onClick={() => setShowCustom(s => !s)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 18px', background: 'rgba(37,99,235,0.04)',
          border: 'none', borderBottom: showCustom ? '0.5px solid rgba(37,99,235,0.15)' : 'none',
          cursor: 'pointer', textAlign: 'left', borderRadius: showCustom ? '0' : 'var(--radius-lg)',
        }}
      >
        <span style={{
          fontSize: 11, display: 'inline-block', transition: 'transform 0.2s',
          transform: showCustom ? 'rotate(90deg)' : 'none', color: '#2563EB',
        }}>▶</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', flex: 1 }}>
          Existing Checks
        </span>
        <span style={{
          fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
          background: 'rgba(37,99,235,0.1)', color: '#2563EB',
          border: '0.5px solid rgba(37,99,235,0.25)',
        }}>{customChecks.length}</span>
        <span style={{ fontSize: 11, color: 'var(--ink-3)', marginLeft: 4 }}>
          {customChecks.filter(c => c.status === 'authorized').length} authorized
        </span>
      </button>

      {showCustom && (
        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Upload controls */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.csv"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{
                ...btnGhost,
                display: 'flex', alignItems: 'center', gap: 6,
                color: '#2563EB', borderColor: 'rgba(37,99,235,0.35)',
                background: 'rgba(37,99,235,0.04)',
                opacity: uploading ? 0.6 : 1,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M6.5 1v7M4 4l2.5-3 2.5 3" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M1.5 9.5v1a1 1 0 001 1h8a1 1 0 001-1v-1" stroke="#2563EB" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              {uploading ? 'Uploading…' : 'Upload Rules (JSON / CSV)'}
            </button>
            <button
              onClick={() => { setShowManualForm(s => !s); setManualError('') }}
              style={{
                ...btnGhost,
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {showManualForm ? '✕ Cancel' : '+ Add Rule Manually'}
            </button>
            <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
              Accepts .json (array) or .csv with columns: column_name, check_type, dimension, description, parameters
            </span>
          </div>

          {/* Upload feedback */}
          {uploadMsg && (
            <div style={{
              fontSize: 12, padding: '8px 12px', borderRadius: 'var(--radius-md)',
              background: uploadIsErr ? 'var(--wf-red-light)' : 'rgba(26,127,75,0.08)',
              border: `0.5px solid ${uploadIsErr ? 'rgba(215,30,43,0.3)' : 'rgba(26,127,75,0.3)'}`,
              color: uploadIsErr ? 'var(--wf-red)' : '#1A7F4B',
            }}>
              {uploadMsg}
            </div>
          )}

          {/* Manual entry form */}
          {showManualForm && (
            <div style={{
              padding: 16, background: 'rgba(37,99,235,0.04)',
              border: '0.5px solid rgba(37,99,235,0.2)', borderRadius: 'var(--radius-md)',
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 14 }}>
                Add Rule Manually
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                <div style={{ flex: 2, minWidth: 160 }}>
                  <label style={{ fontSize: 11, color: 'var(--ink-3)', display: 'block', marginBottom: 4 }}>Column Name *</label>
                  {profileColumns.length > 0 ? (
                    <select
                      value={manualCol}
                      onChange={e => setManualCol(e.target.value)}
                      style={{ ...selectStyle, width: '100%' }}
                    >
                      <option value="">Select column…</option>
                      {profileColumns.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                      <option value="__dataset__">__dataset__ (dataset-level)</option>
                    </select>
                  ) : (
                    <input
                      value={manualCol}
                      onChange={e => setManualCol(e.target.value)}
                      placeholder="e.g. customer_age"
                      style={{ ...inputStyle, width: '100%' }}
                    />
                  )}
                </div>
                <div style={{ flex: 2, minWidth: 160 }}>
                  <label style={{ fontSize: 11, color: 'var(--ink-3)', display: 'block', marginBottom: 4 }}>Check Type</label>
                  <select
                    value={manualCheckType}
                    onChange={e => {
                      const t = e.target.value as DQCheckType
                      setManualCheckType(t)
                      setManualParams(PARAM_HINTS[t] ?? '{}')
                    }}
                    style={{ ...selectStyle, width: '100%' }}
                  >
                    {CHECK_TYPE_GROUPS.map(g => (
                      <optgroup key={g.label} label={g.label}>
                        {g.types.map(t => (
                          <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <label style={{ fontSize: 11, color: 'var(--ink-3)', display: 'block', marginBottom: 4 }}>Dimension</label>
                  <select
                    value={manualDimension}
                    onChange={e => setManualDimension(e.target.value as DQDimension)}
                    style={{ ...selectStyle, width: '100%' }}
                  >
                    {ALL_DIMENSIONS.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, color: 'var(--ink-3)', display: 'block', marginBottom: 4 }}>Description</label>
                <input
                  value={manualDescription}
                  onChange={e => setManualDescription(e.target.value)}
                  placeholder="Human-readable description of this rule"
                  style={{ ...inputStyle, width: '100%' }}
                />
              </div>
              {manualCheckType === 'satisfies_expression' ? (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11, color: 'var(--ink-3)', display: 'block', marginBottom: 4 }}>
                    Pandas Expression <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>(evaluated per row using df.eval)</span>
                  </label>
                  <textarea
                    value={(() => { try { return JSON.parse(manualParams).expression ?? '' } catch { return '' } })()}
                    onChange={e => setManualParams(JSON.stringify({ expression: e.target.value }))}
                    rows={3}
                    placeholder="e.g. end_date > start_date"
                    style={{ ...inputStyle, width: '100%', fontFamily: 'monospace', resize: 'vertical' }}
                  />
                  <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 3 }}>
                    Any Pandas boolean expression referencing column names. Rows where the expression is <strong>False</strong> are flagged.
                  </div>
                </div>
              ) : (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11, color: 'var(--ink-3)', display: 'block', marginBottom: 4 }}>
                    Parameters (JSON)
                  </label>
                  <textarea
                    value={manualParams}
                    onChange={e => setManualParams(e.target.value)}
                    rows={2}
                    style={{ ...inputStyle, width: '100%', fontFamily: 'monospace', resize: 'vertical' }}
                  />
                  <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 3 }}>
                    Example for <strong>{manualCheckType.replace(/_/g, ' ')}</strong>:{' '}
                    <code style={{ fontFamily: 'monospace' }}>{PARAM_HINTS[manualCheckType] ?? '{}'}</code>
                  </div>
                </div>
              )}
              {manualError && (
                <div style={{ fontSize: 12, color: '#D71E2B', marginBottom: 10 }}>{manualError}</div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handleAddManual}
                  disabled={manualSaving}
                  style={{ ...btnPrimary, padding: '7px 18px', fontSize: 12, background: '#2563EB', opacity: manualSaving ? 0.6 : 1 }}
                >
                  {manualSaving ? 'Adding…' : 'Add Rule'}
                </button>
                <button onClick={() => { setShowManualForm(false); setManualError('') }} style={btnGhost}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Custom checks list */}
          {customChecks.length === 0 ? (
            <div style={{
              padding: '28px 20px', textAlign: 'center',
              border: '1.5px dashed rgba(37,99,235,0.25)', borderRadius: 'var(--radius-md)',
            }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink-2)', marginBottom: 4 }}>
                No authored rules yet
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                Upload a JSON or CSV file, or add rules manually above
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {customChecks.map(c => (
                <CheckCard key={c.check_id} check={c} onStatusChange={handleStatusChange} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )

  // ── IDLE ─────────────────────────────────────────────────
  if (phase === 'idle') return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{
          background: 'linear-gradient(135deg, rgba(215,30,43,0.05) 0%, rgba(37,99,235,0.05) 100%)',
          padding: '44px 40px 36px', textAlign: 'center',
        }}>
          <div style={{
            width: 60, height: 60, borderRadius: '50%', margin: '0 auto 20px',
            background: 'linear-gradient(135deg, rgba(215,30,43,0.12), rgba(37,99,235,0.10))',
            border: '1px solid rgba(215,30,43,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26,
          }}>🛡️</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginBottom: 6, fontFamily: 'var(--font-display)' }}>
            Data Quality Intelligence
          </h2>
          <p style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 28 }}>
            Automatically infers DQ checks from your data profile and runs deep anomaly scans to catch issues before they reach downstream systems
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 32 }}>
            {[
              { icon: '🔬', label: 'Profile-aware' },
              { icon: '🎯', label: 'Multi-check' },
              { icon: '⚡', label: 'Severity-ranked' },
              { icon: '💡', label: 'Business rationale' },
            ].map(f => (
              <span key={f.label} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '5px 12px', borderRadius: 20, fontSize: 12,
                background: 'var(--surface)', border: '0.5px solid var(--border-1)',
                color: 'var(--ink-2)', fontWeight: 500,
              }}>
                {f.icon} {f.label}
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={handleInfer} style={{ ...btnPrimary, padding: '10px 28px', fontSize: 14, borderRadius: 8 }}>
              Run Inference Engine
            </button>
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>or</span>
            <button
              onClick={() => {
                setShowCustom(true)
                setTimeout(() => customSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
              }}
              style={{
                padding: '10px 20px', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer',
                background: 'transparent', border: '1.5px solid rgba(37,99,235,0.4)',
                color: '#2563EB', fontFamily: 'var(--font-body)',
                display: 'flex', alignItems: 'center', gap: 7,
              }}
            >
              <span style={{ fontSize: 15 }}>✍️</span> Add Custom Checks
            </button>
          </div>
          {error && <p style={{ color: 'var(--wf-red)', fontSize: 12, marginTop: 14 }}>{error}</p>}
        </div>
      </div>
      {showCustom && customSection}
    </div>
  )

  // ── INFERRING ────────────────────────────────────────────
  if (phase === 'inferring') return (
    <div style={{ ...card, padding: '52px 40px', textAlign: 'center' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse-dot { 0%,100% { opacity: 0.3; transform: scale(0.85); } 50% { opacity: 1; transform: scale(1); } }
      `}</style>
      <div style={{ position: 'relative', width: 56, height: 56, margin: '0 auto 24px' }}>
        <div style={{
          width: 56, height: 56, border: '3px solid var(--surface-tertiary)',
          borderTop: '3px solid var(--wf-red)', borderRadius: '50%',
          animation: 'spin 0.85s linear infinite',
        }}/>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center', fontSize: 20,
        }}>🧠</div>
      </div>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>
        Proposing DQ Checks
      </h3>
      <p style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 28 }}>
        Reasoning over your dataset profile and sample data
      </p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, maxWidth: 400, margin: '0 auto' }}>
        {[
          { label: 'Load profile' },
          { label: 'Sample data' },
          { label: 'LLM reasoning', active: true },
          { label: 'Validate' },
        ].map((step, i) => (
          <div key={step.label} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ textAlign: 'center', minWidth: 70 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', margin: '0 auto 6px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700,
                background: i < 2 ? '#1A7F4B' : step.active ? 'var(--wf-red)' : 'var(--surface-2)',
                color: (i < 2 || step.active) ? '#fff' : 'var(--ink-3)',
                border: `2px solid ${i < 2 ? '#1A7F4B' : step.active ? 'var(--wf-red)' : 'var(--border-1)'}`,
                animation: step.active ? 'pulse-dot 1.4s ease-in-out infinite' : 'none',
              }}>
                {i < 2 ? '✓' : i + 1}
              </div>
              <div style={{ fontSize: 10, color: i < 2 ? '#1A7F4B' : step.active ? 'var(--wf-red)' : 'var(--ink-3)', fontWeight: step.active ? 600 : 400 }}>
                {step.label}
              </div>
            </div>
            {i < 3 && (
              <div style={{
                width: 24, height: 2, flexShrink: 0, marginBottom: 22,
                background: i < 1 ? '#1A7F4B' : 'var(--border-1)',
              }}/>
            )}
          </div>
        ))}
      </div>
    </div>
  )

  // ── SCANNING ─────────────────────────────────────────────
  if (phase === 'scanning') return (
    <div style={{ ...card, padding: '52px 40px', textAlign: 'center' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ position: 'relative', width: 56, height: 56, margin: '0 auto 24px' }}>
        <div style={{
          width: 56, height: 56, border: '3px solid var(--surface-tertiary)',
          borderTop: '3px solid var(--wf-red)', borderRadius: '50%',
          animation: 'spin 0.85s linear infinite',
        }}/>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center', fontSize: 20,
        }}>🔍</div>
      </div>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>
        Scanning for Anomalies
      </h3>
      <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>
        Running authorized checks across the full dataset
      </p>
    </div>
  )

  // ── CHECKS + RESULTS ──────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Action bar ──────────────────────────────────────── */}
      <div style={{
        ...card, padding: '10px 16px',
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      }}>
        {/* Stat pills */}
        <div style={{ display: 'flex', gap: 6, flex: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 12, padding: '4px 10px', borderRadius: 20, fontWeight: 500,
            background: 'var(--surface-2)', border: '0.5px solid var(--border-1)', color: 'var(--ink-2)',
          }}>{inferredChecks.length + customChecks.length} checks</span>
          <span style={{
            fontSize: 12, padding: '4px 10px', borderRadius: 20, fontWeight: 600,
            background: authorizedCount > 0 ? 'rgba(26,127,75,0.1)' : 'var(--surface-2)',
            border: `0.5px solid ${authorizedCount > 0 ? 'rgba(26,127,75,0.25)' : 'var(--border-1)'}`,
            color: authorizedCount > 0 ? '#1A7F4B' : 'var(--ink-3)',
          }}>{authorizedCount} authorized</span>
          {customChecks.length > 0 && (
            <span style={{
              fontSize: 12, padding: '4px 10px', borderRadius: 20, fontWeight: 500,
              background: 'rgba(37,99,235,0.08)', border: '0.5px solid rgba(37,99,235,0.2)', color: '#2563EB',
            }}>{customChecks.length} authored</span>
          )}
        </div>
        <button onClick={() => handleBulk('authorized')} style={btnGhost}>Authorize All</button>
        <button onClick={() => handleBulk('rejected')}   style={btnGhost}>Reject All</button>
        <button onClick={() => handleBulk('pending')}    style={{ ...btnGhost, color: 'var(--ink-3)' }}>Reset</button>
        <button onClick={handleInfer} style={btnGhost}>Re-infer</button>
        {phase !== 'results' ? (
          <button
            onClick={handleScan}
            disabled={authorizedCount === 0}
            style={{
              ...btnPrimary, borderRadius: 8,
              opacity: authorizedCount === 0 ? 0.4 : 1,
              cursor: authorizedCount === 0 ? 'not-allowed' : 'pointer',
            }}
          >Run Scan ({authorizedCount})</button>
        ) : (
          <button onClick={handleScan} style={btnGhost}>Re-scan</button>
        )}
      </div>

      {error && (
        <div style={{ background: 'var(--wf-red-light)', border: '0.5px solid rgba(215,30,43,0.3)', borderRadius: 'var(--radius-md)', padding: '10px 16px', color: 'var(--wf-red)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* ── Scan summary ─────────────────────────────────────── */}
      {phase === 'results' && scanResult && (
        <div style={{ ...card, overflow: 'hidden' }}>
          {/* Header bar */}
          <div style={{
            padding: '12px 20px', borderBottom: '0.5px solid var(--border-1)',
            background: 'var(--surface-2)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Scan Results</span>
            <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
              {new Date(scanResult.scanned_at).toLocaleString()}
            </span>
          </div>
          <div style={{ padding: '20px 24px', display: 'flex', gap: 28, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Score gauge */}
            <DQGauge score={scanResult.dq_score} />
            {/* Divider */}
            <div style={{ width: 1, height: 80, background: 'var(--border-1)', flexShrink: 0 }} />
            {/* Stats grid */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flex: 1 }}>
              {[
                { label: 'Rows',          value: scanResult.total_rows.toLocaleString(),       icon: '📄' },
                { label: 'Passed',        value: scanResult.checks_passed.toString(),          icon: '✓', ok: true },
                { label: 'Failed',        value: scanResult.checks_failed.toString(),          icon: '✗', alert: scanResult.checks_failed > 0 },
                { label: 'Shape issues',  value: scanResult.shape_anomalies.toString(),        icon: '⬛', alert: scanResult.shape_anomalies > 0 },
                { label: 'Record issues', value: scanResult.record_anomalies.toString(),       icon: '⬜', alert: scanResult.record_anomalies > 0 },
              ].map(s => (
                <div key={s.label} style={{
                  background: (s as any).alert ? 'rgba(215,30,43,0.05)' : (s as any).ok ? 'rgba(26,127,75,0.06)' : 'var(--surface-2)',
                  border: `0.5px solid ${(s as any).alert ? 'rgba(215,30,43,0.18)' : (s as any).ok ? 'rgba(26,127,75,0.18)' : 'var(--border-1)'}`,
                  borderRadius: 10, padding: '10px 14px', minWidth: 90, textAlign: 'center',
                }}>
                  <div style={{
                    fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-display)',
                    color: (s as any).alert ? 'var(--wf-red)' : (s as any).ok ? '#1A7F4B' : 'var(--ink)',
                    lineHeight: 1.1,
                  }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 3, fontWeight: 500 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Inferred checks section ─────────────────────────── */}
      <div style={card}>
        <button
          onClick={() => setShowInferred(s => !s)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px 18px', background: 'var(--surface-2)',
            border: 'none', borderBottom: showInferred ? '0.5px solid var(--border-1)' : 'none',
            cursor: 'pointer', textAlign: 'left',
          }}
        >
          <span style={{
            fontSize: 11, display: 'inline-block', transition: 'transform 0.2s',
            transform: showInferred ? 'rotate(90deg)' : 'none', color: 'var(--ink-3)',
          }}>▶</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', flex: 1 }}>
            Inferred Checks
          </span>
          <span style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
            background: 'rgba(6,182,212,0.1)', color: '#0891B2', border: '0.5px solid rgba(6,182,212,0.25)',
          }}>{inferredChecks.length}</span>
          <span style={{ fontSize: 11, color: 'var(--ink-3)', marginLeft: 6 }}>
            {inferredChecks.filter(c => c.status === 'authorized').length} authorized
          </span>
        </button>

        {showInferred && (
          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {inferredChecks.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--ink-3)' }}>
                No inferred checks. Click <strong>Re-infer</strong> or run the inference engine.
              </div>
            ) : (
              <>
                {/* Filters */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 500 }}>Filter:</span>
                  <select value={filterDim}    onChange={e => setFilterDim(e.target.value)}    style={selectStyle}>
                    <option value="all">All Dimensions</option>
                    {ALL_DIMENSIONS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selectStyle}>
                    <option value="all">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="authorized">Authorized</option>
                    <option value="rejected">Rejected</option>
                  </select>
                  <select value={filterType}   onChange={e => setFilterType(e.target.value)}   style={selectStyle}>
                    <option value="all">All Check Types</option>
                    {Array.from(new Set(inferredChecks.map(c => c.check_type))).map(t => (
                      <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>

                {/* Dimension groups */}
                {ALL_DIMENSIONS.filter(d => groupedByDim[d]?.length).map(dim => {
                  const dim_checks = groupedByDim[dim]
                  const dimColors  = DIM_COLORS[dim]
                  const authCount  = dim_checks.filter(c => c.status === 'authorized').length
                  return (
                    <div key={dim} style={{ border: `0.5px solid ${dimColors.text}22`, borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                      <div style={{
                        padding: '9px 14px', borderBottom: `0.5px solid ${dimColors.text}18`,
                        background: dimColors.bg, display: 'flex', alignItems: 'center', gap: 8,
                      }}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, color: dimColors.text,
                          textTransform: 'uppercase', letterSpacing: '0.06em',
                        }}>{dim.replace(/_/g, ' ')}</span>
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 10,
                          background: dimColors.text + '18', color: dimColors.text,
                        }}>{dim_checks.length}</span>
                        {authCount > 0 && (
                          <span style={{ fontSize: 10, color: '#1A7F4B', marginLeft: 'auto', fontWeight: 500 }}>
                            ✓ {authCount} authorized
                          </span>
                        )}
                      </div>
                      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--surface)' }}>
                        {dim_checks.map(c => (
                          <CheckCard key={c.check_id} check={c} onStatusChange={handleStatusChange} />
                        ))}
                      </div>
                    </div>
                  )
                })}

                {filteredInferred.length === 0 && inferredChecks.length > 0 && (
                  <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: 'var(--ink-3)' }}>
                    No checks match the current filters.
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── User-defined rules section ───────────────────────── */}
      {customSection}

      {/* ── Anomaly table ─────────────────────────────────────── */}
      {phase === 'results' && scanResult && scanResult.total_anomalies > 0 && (
        <div style={card}>
          <div style={{
            padding: '14px 20px', borderBottom: '0.5px solid var(--border-1)',
            background: 'var(--surface-2)',
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', flex: 1 }}>
              Anomalies ({scanResult.total_anomalies})
            </span>
            <select value={filterASource} onChange={e => setFilterASource(e.target.value)} style={selectStyle}>
              <option value="all">All Sources</option>
              <option value="inferred">Inferred</option>
              <option value="custom">Custom Rule</option>
            </select>
            <select value={filterAType} onChange={e => setFilterAType(e.target.value)} style={selectStyle}>
              <option value="all">Shape + Record</option>
              <option value="shape">Shape only</option>
              <option value="record">Record only</option>
            </select>
            <select value={filterACheckType} onChange={e => setFilterACheckType(e.target.value)} style={selectStyle}>
              <option value="all">All Check Types</option>
              {Array.from(new Set(scanResult.anomalies.map(a => a.check_type))).map(t => (
                <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
              ))}
            </select>
            <select value={filterSev} onChange={e => setFilterSev(e.target.value)} style={selectStyle}>
              <option value="all">All Severities</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <select
              value={filterCol}
              onChange={e => setFilterCol(e.target.value)}
              style={selectStyle}
            >
              <option value="">All Columns</option>
              {Array.from(new Set(scanResult.anomalies.map(a => a.column_name))).sort().map(col => (
                <option key={col} value={col}>{col}</option>
              ))}
            </select>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '0.5px solid var(--border-1)', background: 'var(--surface-2)' }}>
                  {['Severity', 'Column', 'Type', 'Check', 'Description', ''].map(h => (
                    <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredAnomalies.map(a => (
                  <AnomalyRow
                    key={a.anomaly_id}
                    anomaly={a}
                    check={checkMap[a.check_id]}
                    isCustom={checkMap[a.check_id]?.source === 'user_defined'}
                  />
                ))}
              </tbody>
            </table>
            {filteredAnomalies.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: 'var(--ink-3)' }}>
                No anomalies match the current filters.
              </div>
            )}
          </div>
        </div>
      )}

      {phase === 'results' && scanResult && scanResult.total_anomalies === 0 && (
        <div style={{
          ...card, padding: '32px 24px', textAlign: 'center',
          background: 'linear-gradient(135deg, rgba(26,127,75,0.04), rgba(26,127,75,0.02))',
          border: '0.5px solid rgba(26,127,75,0.2)',
        }}>
          <div style={{
            width: 52, height: 52, borderRadius: '50%', margin: '0 auto 14px',
            background: 'rgba(26,127,75,0.12)', border: '1.5px solid rgba(26,127,75,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
          }}>✓</div>
          <p style={{ fontSize: 15, color: '#1A7F4B', fontWeight: 700, marginBottom: 4 }}>All checks passed</p>
          <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>No anomalies detected across the full dataset.</p>
        </div>
      )}
    </div>
  )
}
