'use client'
import { useEffect, useState, useMemo } from 'react'
import {
  DQCheck, DQAnomaly, ScanResult, DQDimension, DQCheckStatus, DQCheckType,
  inferDQChecks, getDQChecks, updateCheckStatus, bulkUpdateChecks, runScan, getScanResult,
} from '@/lib/api'

interface Props { profileId: string }

type Phase = 'idle' | 'inferring' | 'checks' | 'scanning' | 'results'

// ── Dimension colours ──────────────────────────────────────
const DIM_COLORS: Record<DQDimension, { bg: string; text: string }> = {
  completeness: { bg: 'rgba(215,30,43,0.10)',  text: '#D71E2B' },
  validity:     { bg: 'rgba(59,130,246,0.12)', text: '#2563EB' },
  uniqueness:   { bg: 'rgba(139,92,246,0.12)', text: '#7C3AED' },
  conformity:   { bg: 'rgba(245,158,11,0.12)', text: '#B45309' },
  accuracy:     { bg: 'rgba(26,127,75,0.12)',  text: '#1A7F4B' },
  consistency:  { bg: 'rgba(6,182,212,0.12)',  text: '#0891B2' },
}

const SEV_COLORS: Record<string, string> = {
  high:   '#D71E2B',
  medium: '#B45309',
  low:    '#1A7F4B',
}

// ── DQ Score semicircle gauge ──────────────────────────────
function DQGauge({ score }: { score: number }) {
  const r = 54
  const stroke = 10
  // Semicircle: use only top half of circle (180° arc)
  const circumference = Math.PI * r  // half circle
  const filled = (score / 100) * circumference
  const cx = r + stroke, cy = r + stroke
  const color = score >= 80 ? '#1A7F4B' : score >= 50 ? '#B45309' : '#D71E2B'
  const dim = (r + stroke) * 2
  return (
    <div style={{ position: 'relative', width: dim, height: r + stroke + 20, flexShrink: 0 }}>
      <svg width={dim} height={r + stroke + 4} viewBox={`0 0 ${dim} ${r + stroke}`} style={{ overflow: 'visible' }}>
        {/* Track */}
        <path
          d={`M ${stroke} ${r + stroke} A ${r} ${r} 0 0 1 ${dim - stroke} ${r + stroke}`}
          fill="none" stroke="var(--surface-tertiary, #E5E7EB)" strokeWidth={stroke} strokeLinecap="round"
        />
        {/* Fill */}
        <path
          d={`M ${stroke} ${r + stroke} A ${r} ${r} 0 0 1 ${dim - stroke} ${r + stroke}`}
          fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          style={{ transition: 'stroke-dasharray 1s ease' }}
        />
      </svg>
      <div style={{
        position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 26, fontWeight: 700, color, fontFamily: 'var(--font-display)', lineHeight: 1 }}>
          {score.toFixed(1)}
        </div>
        <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>/ 100</div>
      </div>
    </div>
  )
}

// ── Confidence bar ─────────────────────────────────────────
function ConfBar({ value }: { value: number }) {
  const pct = value * 100
  const color = pct >= 95 ? '#1A7F4B' : pct >= 90 ? '#B45309' : '#D71E2B'
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink-3)', marginBottom: 3 }}>
        <span>Confidence</span>
        <span style={{ fontWeight: 600, color }}>{pct.toFixed(1)}%</span>
      </div>
      <div style={{ height: 5, background: 'var(--surface-tertiary, #E5E7EB)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  )
}

// ── Parameter pills ────────────────────────────────────────
function ParamPills({ params, checkType }: { params: Record<string, any>; checkType: DQCheckType }) {
  const skip = new Set(['ks_statistic', 'p_value', 'distribution', 'q1', 'q3', 'iqr', 'mean', 'std',
    'loc', 'scale', 's', 'null_threshold_pct', 'min_unique_pct'])
  const entries = Object.entries(params).filter(([k]) => !skip.has(k))
  if (entries.length === 0) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
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
  )
}

// ── Single check card ──────────────────────────────────────
function CheckCard({ check, onStatusChange }: {
  check: DQCheck
  onStatusChange: (id: string, status: DQCheckStatus) => void
}) {
  const dim = DIM_COLORS[check.dimension] ?? { bg: 'var(--surface-2)', text: 'var(--ink-3)' }
  const isAuthorized = check.status === 'authorized'
  const isRejected   = check.status === 'rejected'
  const hasScanData  = check.pass_count != null

  return (
    <div style={{
      background: 'var(--surface)',
      border: `0.5px solid ${isAuthorized ? 'rgba(26,127,75,0.4)' : isRejected ? 'rgba(215,30,43,0.2)' : 'var(--border-1)'}`,
      borderRadius: 'var(--radius-md)',
      padding: '14px 16px',
      opacity: isRejected ? 0.55 : 1,
      transition: 'opacity 0.2s',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
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
          </div>
          <p style={{ fontSize: 12, color: 'var(--ink-2)', margin: 0, lineHeight: 1.5 }}>
            {check.description}
          </p>
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

      {/* Confidence + scan results */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <ConfBar value={check.confidence} />
          <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 3 }}>
            {(check.confidence * 100).toFixed(1)}% confidence (tested on {check.sample_size.toLocaleString()} rows)
          </div>
        </div>
        {hasScanData && (
          <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
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
    </div>
  )
}

// ── Anomaly row ────────────────────────────────────────────
function AnomalyRow({ anomaly }: { anomaly: DQAnomaly }) {
  const [expanded, setExpanded] = useState(false)
  const isRecord = anomaly.anomaly_type === 'record'
  const sevColor = SEV_COLORS[anomaly.severity] ?? 'var(--ink-3)'

  return (
    <>
      <tr
        style={{
          borderBottom: '0.5px solid var(--border-1)',
          background: expanded ? 'var(--surface-2)' : 'transparent',
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
        <td style={{ padding: '10px 12px', fontSize: 11, color: 'var(--ink-3)' }}>
          {anomaly.check_type.replace(/_/g, ' ')}
        </td>
        <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--ink-2)' }}>
          {anomaly.description}
        </td>
        <td style={{ padding: '10px 12px', width: 32, textAlign: 'center', color: 'var(--ink-3)' }}>
          {isRecord && <span style={{ fontSize: 14, transition: 'transform 0.2s', display: 'inline-block', transform: expanded ? 'rotate(180deg)' : 'none' }}>▾</span>}
        </td>
      </tr>
      {expanded && isRecord && anomaly.row_data && (
        <tr style={{ background: 'var(--surface-2)', borderBottom: '0.5px solid var(--border-1)' }}>
          <td colSpan={6} style={{ padding: '12px 16px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {Object.entries(anomaly.row_data).map(([k, v]) => {
                const isOffending = k === anomaly.column_name
                return (
                  <div key={k} style={{
                    background: isOffending ? 'rgba(215,30,43,0.08)' : 'var(--surface)',
                    border: `0.5px solid ${isOffending ? 'rgba(215,30,43,0.3)' : 'var(--border-1)'}`,
                    borderRadius: 6, padding: '6px 10px', minWidth: 80,
                  }}>
                    <div style={{ fontSize: 10, color: 'var(--ink-3)', marginBottom: 2 }}>{k}</div>
                    <div style={{
                      fontSize: 12, fontWeight: isOffending ? 600 : 400,
                      color: isOffending ? 'var(--wf-red)' : 'var(--ink)',
                      fontFamily: 'monospace', wordBreak: 'break-all',
                    }}>{String(v ?? '—')}</div>
                  </div>
                )
              })}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ── Main component ─────────────────────────────────────────
export default function DQChecks({ profileId }: Props) {
  const [phase, setPhase]       = useState<Phase>('idle')
  const [checks, setChecks]     = useState<DQCheck[]>([])
  const [scanResult, setScan]   = useState<ScanResult | null>(null)
  const [error, setError]       = useState('')

  // Filters
  const [filterDim,    setFilterDim]    = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterType,   setFilterType]   = useState<string>('all')
  const [filterSev,    setFilterSev]    = useState<string>('all')
  const [filterCol,    setFilterCol]    = useState('')
  const [filterAType,  setFilterAType]  = useState<string>('all')

  // Restore state on mount
  useEffect(() => {
    let cancelled = false
    async function restore() {
      try {
        const [checksData, scanData] = await Promise.all([
          getDQChecks(profileId).catch(() => null),
          getScanResult(profileId).catch(() => null),
        ])
        if (cancelled) return
        if (checksData && checksData.total > 0) {
          setChecks(checksData.checks)
          setScan(scanData)
          setPhase(scanData ? 'results' : 'checks')
        }
      } catch {
        // nothing — stays idle
      }
    }
    restore()
    return () => { cancelled = true }
  }, [profileId])

  const handleInfer = async () => {
    setPhase('inferring')
    setError('')
    try {
      const data = await inferDQChecks(profileId)
      setChecks(data.checks)
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
      // Merge scan counts back into checks
      const resultMap = Object.fromEntries(result.check_results.map(c => [c.check_id, c]))
      setChecks(prev => prev.map(c => resultMap[c.check_id]
        ? { ...c, pass_count: resultMap[c.check_id].pass_count, fail_count: resultMap[c.check_id].fail_count, fail_pct: resultMap[c.check_id].fail_pct }
        : c
      ))
      setPhase('results')
    } catch (e: any) {
      setError(e.message)
      setPhase('checks')
    }
  }

  // ── Grouped checks ───────────────────────────────────────
  const dimensions: DQDimension[] = ['completeness', 'validity', 'accuracy', 'conformity', 'uniqueness', 'consistency']

  const filteredChecks = useMemo(() => checks.filter(c => {
    if (filterDim    !== 'all' && c.dimension    !== filterDim)    return false
    if (filterStatus !== 'all' && c.status       !== filterStatus) return false
    if (filterType   !== 'all' && c.check_type   !== filterType)   return false
    return true
  }), [checks, filterDim, filterStatus, filterType])

  const groupedByDim = useMemo(() => {
    const g: Record<string, DQCheck[]> = {}
    for (const c of filteredChecks) {
      if (!g[c.dimension]) g[c.dimension] = []
      g[c.dimension].push(c)
    }
    return g
  }, [filteredChecks])

  const authorizedCount = checks.filter(c => c.status === 'authorized').length

  // ── Filtered anomalies ───────────────────────────────────
  const filteredAnomalies = useMemo(() => {
    if (!scanResult) return []
    return scanResult.anomalies.filter(a => {
      if (filterSev   !== 'all' && a.severity     !== filterSev)   return false
      if (filterAType !== 'all' && a.anomaly_type !== filterAType) return false
      if (filterCol   && !a.column_name.toLowerCase().includes(filterCol.toLowerCase())) return false
      return true
    })
  }, [scanResult, filterSev, filterAType, filterCol])

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
    padding: '6px 10px', borderRadius: 'var(--radius-md)', fontSize: 12,
    border: '0.5px solid var(--border-1)', background: 'var(--surface)',
    color: 'var(--ink)', cursor: 'pointer',
  }

  // ── IDLE ─────────────────────────────────────────────────
  if (phase === 'idle') return (
    <div style={{ ...card, padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>
        Automated Data Quality Inference
      </h2>
      <p style={{ fontSize: 13, color: 'var(--ink-3)', maxWidth: 480, margin: '0 auto 24px' }}>
        The engine will statistically learn quality rules from your data using an 80/20 train/test split
        and propose checks with measured confidence scores.
      </p>
      <button onClick={handleInfer} style={btnPrimary}>Run Inference Engine</button>
      {error && <p style={{ color: 'var(--wf-red)', fontSize: 12, marginTop: 12 }}>{error}</p>}
    </div>
  )

  // ── INFERRING ────────────────────────────────────────────
  if (phase === 'inferring') return (
    <div style={{ ...card, padding: 48, textAlign: 'center' }}>
      <div style={{
        width: 40, height: 40, border: '3px solid var(--surface-tertiary)',
        borderTop: '3px solid var(--wf-red)', borderRadius: '50%',
        animation: 'spin 1s linear infinite', margin: '0 auto 16px',
      }}/>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <p style={{ fontSize: 14, color: 'var(--ink-3)' }}>
        Running statistical inference engine…
      </p>
      <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>
        Fitting distributions, splitting train/test, rewriting descriptions via LLM
      </p>
    </div>
  )

  // ── SCANNING ─────────────────────────────────────────────
  if (phase === 'scanning') return (
    <div style={{ ...card, padding: 48, textAlign: 'center' }}>
      <div style={{
        width: 40, height: 40, border: '3px solid var(--surface-tertiary)',
        borderTop: '3px solid var(--wf-red)', borderRadius: '50%',
        animation: 'spin 1s linear infinite', margin: '0 auto 16px',
      }}/>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <p style={{ fontSize: 14, color: 'var(--ink-3)' }}>Scanning dataset for anomalies…</p>
      <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>
        Running {authorizedCount} authorized check{authorizedCount !== 1 ? 's' : ''} in vectorized chunks
      </p>
    </div>
  )

  // ── CHECKS + RESULTS ──────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Action bar ──────────────────────────────────────── */}
      <div style={{
        ...card,
        padding: '14px 20px',
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
            {checks.length} rules inferred
          </span>
          <span style={{ fontSize: 12, color: 'var(--ink-3)', marginLeft: 12 }}>
            {authorizedCount} authorized
          </span>
        </div>
        <button onClick={() => handleBulk('authorized')} style={btnGhost}>Authorize All</button>
        <button onClick={() => handleBulk('rejected')}   style={btnGhost}>Reject All</button>
        <button onClick={() => handleBulk('pending')}    style={btnGhost}>Reset All</button>
        {phase !== 'results' && (
          <button
            onClick={handleScan}
            disabled={authorizedCount === 0}
            style={{
              ...btnPrimary,
              opacity: authorizedCount === 0 ? 0.4 : 1,
              cursor: authorizedCount === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            Run Scan ({authorizedCount})
          </button>
        )}
        {phase === 'results' && (
          <>
            <button onClick={handleScan} style={btnGhost}>Re-scan</button>
            <button onClick={handleInfer} style={btnGhost}>Re-infer</button>
          </>
        )}
      </div>

      {error && (
        <div style={{ background: 'var(--wf-red-light)', border: '0.5px solid rgba(215,30,43,0.3)', borderRadius: 'var(--radius-md)', padding: '10px 16px', color: 'var(--wf-red)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* ── Scan summary (results phase only) ─────────────── */}
      {phase === 'results' && scanResult && (
        <div style={{ ...card }}>
          <div style={{
            padding: '14px 20px', borderBottom: '0.5px solid var(--border-1)',
            background: 'var(--surface-2)',
            fontSize: 14, fontWeight: 600, color: 'var(--ink)',
          }}>Scan Results</div>
          <div style={{ padding: 20, display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
            <DQGauge score={scanResult.dq_score} />
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', flex: 1 }}>
              {[
                { label: 'Rows Scanned',     value: scanResult.total_rows.toLocaleString() },
                { label: 'Checks Passed',    value: scanResult.checks_passed.toString(), ok: true },
                { label: 'Checks Failed',    value: scanResult.checks_failed.toString(), alert: scanResult.checks_failed > 0 },
                { label: 'Shape Anomalies',  value: scanResult.shape_anomalies.toString(), alert: scanResult.shape_anomalies > 0 },
                { label: 'Record Anomalies', value: scanResult.record_anomalies.toString(), alert: scanResult.record_anomalies > 0 },
              ].map(s => (
                <div key={s.label} style={{
                  background: (s as any).alert ? 'var(--wf-red-light)' : (s as any).ok ? 'rgba(26,127,75,0.06)' : 'var(--surface-2)',
                  border: `0.5px solid ${(s as any).alert ? 'rgba(215,30,43,0.2)' : (s as any).ok ? 'rgba(26,127,75,0.2)' : 'var(--border-1)'}`,
                  borderRadius: 'var(--radius-md)', padding: '12px 16px', minWidth: 110,
                }}>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{s.label}</div>
                  <div style={{
                    fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-display)', lineHeight: 1.2,
                    color: (s as any).alert ? 'var(--wf-red)' : (s as any).ok ? '#1A7F4B' : 'var(--ink)',
                  }}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Check filters ────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 500 }}>Filter:</span>
        <select value={filterDim}    onChange={e => setFilterDim(e.target.value)}    style={selectStyle}>
          <option value="all">All Dimensions</option>
          {dimensions.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selectStyle}>
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="authorized">Authorized</option>
          <option value="rejected">Rejected</option>
        </select>
        <select value={filterType}   onChange={e => setFilterType(e.target.value)}   style={selectStyle}>
          <option value="all">All Check Types</option>
          {Array.from(new Set(checks.map(c => c.check_type))).map(t => (
            <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </div>

      {/* ── Check groups by dimension ─────────────────────────── */}
      {dimensions.filter(d => groupedByDim[d]?.length).map(dim => {
        const dim_checks = groupedByDim[dim]
        const dimColors = DIM_COLORS[dim]
        return (
          <div key={dim} style={card}>
            <div style={{
              padding: '12px 18px', borderBottom: '0.5px solid var(--border-1)',
              background: 'var(--surface-2)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{
                fontSize: 12, fontWeight: 600, padding: '3px 10px',
                borderRadius: 10, background: dimColors.bg, color: dimColors.text,
                textTransform: 'capitalize',
              }}>{dim}</span>
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                {dim_checks.length} rule{dim_checks.length !== 1 ? 's' : ''} ·{' '}
                {dim_checks.filter(c => c.status === 'authorized').length} authorized
              </span>
            </div>
            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {dim_checks.map(c => (
                <CheckCard key={c.check_id} check={c} onStatusChange={handleStatusChange} />
              ))}
            </div>
          </div>
        )
      })}

      {/* ── Anomaly table (results phase only) ────────────────── */}
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
            <select value={filterAType} onChange={e => setFilterAType(e.target.value)} style={selectStyle}>
              <option value="all">Shape + Record</option>
              <option value="shape">Shape only</option>
              <option value="record">Record only</option>
            </select>
            <select value={filterSev} onChange={e => setFilterSev(e.target.value)} style={selectStyle}>
              <option value="all">All Severities</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <input
              placeholder="Filter column…"
              value={filterCol}
              onChange={e => setFilterCol(e.target.value)}
              style={{ ...selectStyle, width: 130 }}
            />
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
                {filteredAnomalies.map(a => <AnomalyRow key={a.anomaly_id} anomaly={a} />)}
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
        <div style={{ ...card, padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
          <p style={{ fontSize: 14, color: '#1A7F4B', fontWeight: 600 }}>No anomalies detected.</p>
          <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>All authorized checks passed on the full dataset.</p>
        </div>
      )}
    </div>
  )
}
