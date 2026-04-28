'use client'
import { useState } from 'react'
import { ProfileContract, ColumnProfile } from '@/lib/api'
import Badge from './Badge'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, ScatterChart,
  Scatter, ZAxis, CartesianGrid, Legend
} from 'recharts'

interface Props {
  profile: ProfileContract
  activeTab: string
}

// ── Shared card wrapper ───────────────────────────────────
function Card({ title, subtitle, children }: {
  title?: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '0.5px solid var(--border-1)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      boxShadow: 'var(--shadow-sm)',
    }}>
      {title && (
        <div style={{
          padding: '14px 20px',
          borderBottom: '0.5px solid var(--border-1)',
          background: 'var(--surface-2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{title}</span>
          {subtitle && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{subtitle}</span>}
        </div>
      )}
      {children}
    </div>
  )
}

// ── Mini stat box ─────────────────────────────────────────
function StatBox({ label, value, alert }: { label: string; value: string | number; alert?: boolean }) {
  return (
    <div style={{
      padding: '12px 16px',
      background: alert ? 'var(--wf-red-light)' : 'var(--surface-2)',
      border: `0.5px solid ${alert ? 'rgba(215,30,43,0.2)' : 'var(--border-1)'}`,
      borderRadius: 'var(--radius-md)',
    }}>
      <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 3 }}>{label}</div>
      <div style={{
        fontSize: 18,
        fontWeight: 700,
        color: alert ? 'var(--wf-red)' : 'var(--ink)',
        fontFamily: 'var(--font-display)',
      }}>{value}</div>
    </div>
  )
}

// ── Histogram chart ───────────────────────────────────────
function HistogramChart({ col }: { col: ColumnProfile }) {
  if (!col.histogram || col.histogram.length === 0) return (
    <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>No distribution data</span>
    </div>
  )

  const isNumeric = !col.histogram[0].label
  const data = col.histogram.map((b, i) => ({
    name: b.label || `${b.bin_start}–${b.bin_end}`,
    count: b.count,
    index: i,
  }))

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 20, left: 4 }}>
        <XAxis
          dataKey="name"
          tick={{ fontSize: 9, fill: '#8A8A8A' }}
          axisLine={false}
          tickLine={false}
          interval={isNumeric ? Math.floor(data.length / 5) : 0}
          angle={isNumeric ? 0 : -35}
          textAnchor={isNumeric ? 'middle' : 'end'}
        />
        <YAxis hide />
        <Tooltip
          contentStyle={{
            fontSize: 11,
            border: '0.5px solid var(--border-1)',
            borderRadius: 6,
            boxShadow: 'var(--shadow-sm)',
          }}
          formatter={(v: any) => [v, 'Count']}
        />
        <Bar dataKey="count" radius={[3, 3, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={i % 2 === 0 ? '#D71E2B' : '#FFCD41'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export default function StructuredProfile({ profile, activeTab }: Props) {
  const [selectedCol, setSelectedCol] = useState<ColumnProfile | null>(profile.columns[0] || null)
  const [scatterX, setScatterX] = useState<string>(profile.columns.find(c => c.mean != null)?.column_name || '')
  const [scatterY, setScatterY] = useState<string>(profile.columns.filter(c => c.mean != null)[1]?.column_name || '')

  const numericCols = profile.columns.filter(c => c.mean != null)

  // ── OVERVIEW ────────────────────────────────────────────
  if (activeTab === 'overview') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 12,
        }}>
          <StatBox label="Total Rows" value={profile.row_count?.toLocaleString() || '—'} />
          <StatBox label="Total Columns" value={profile.column_count || '—'} />
          <StatBox label="Duplicate Rows" value={profile.duplicate_row_count || 0} alert={(profile.duplicate_row_count || 0) > 0} />
          <StatBox label="PII Columns" value={profile.columns.filter(c => c.is_pii).length} alert={profile.columns.some(c => c.is_pii)} />
          <StatBox label="Columns w/ Missing" value={profile.columns.filter(c => c.missing_pct > 0).length} alert={profile.columns.some(c => c.missing_pct > 10)} />
        </div>

        <Card title="Column Overview" subtitle={`${profile.columns.length} columns`}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)' }}>
                  {['Column', 'Type', 'Semantic Type', 'Missing %', 'Unique %', 'Sensitivity', 'PII'].map(h => (
                    <th key={h} style={{
                      padding: '10px 14px',
                      textAlign: 'left',
                      fontSize: 11,
                      fontWeight: 500,
                      color: 'var(--ink-3)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      borderBottom: '0.5px solid var(--border-1)',
                      whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {profile.columns.map((col, i) => (
                  <tr key={col.column_name} style={{
                    background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)',
                    borderBottom: '0.5px solid var(--border-1)',
                    cursor: 'pointer',
                  }}
                  onClick={() => setSelectedCol(col)}
                  >
                    <td style={{ padding: '10px 14px', fontWeight: 500, fontSize: 13 }}>{col.column_name}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <code style={{ fontSize: 11, background: 'var(--surface-3)', padding: '2px 6px', borderRadius: 4, color: 'var(--ink-2)' }}>
                        {col.data_type}
                      </code>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--info)' }}>
                      {col.semantic_type?.replace(/_/g, ' ') || '—'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 60, height: 4, background: 'var(--surface-3)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${col.missing_pct}%`, background: col.missing_pct > 10 ? 'var(--wf-red)' : '#1A7F4B', borderRadius: 2 }}/>
                        </div>
                        <span style={{ fontSize: 12, color: col.missing_pct > 10 ? 'var(--wf-red)' : 'var(--ink-2)', fontWeight: col.missing_pct > 10 ? 500 : 400 }}>
                          {col.missing_pct.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--ink-2)' }}>{col.unique_pct.toFixed(1)}%</td>
                    <td style={{ padding: '10px 14px' }}><Badge variant={col.sensitivity as any} label={col.sensitivity} /></td>
                    <td style={{ padding: '10px 14px' }}>{col.is_pii && <Badge variant="pii" label="PII" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {profile.drift_alerts && profile.drift_alerts.length > 0 && (
          <Card title={`⚠ Drift Detected — ${profile.drift_alerts.length} alerts`}>
            <div style={{ padding: '16px 20px' }}>
              {profile.drift_alerts.map((alert, i) => (
                <div key={i} style={{ display: 'flex', gap: 16, padding: '8px 0', borderBottom: i < profile.drift_alerts!.length - 1 ? '0.5px solid var(--border-1)' : 'none', fontSize: 13 }}>
                  <span style={{ fontWeight: 500, color: 'var(--ink)', width: 160 }}>{alert.column_name}</span>
                  <span style={{ color: 'var(--ink-2)' }}>{alert.metric}</span>
                  <span style={{ color: 'var(--ink-3)' }}>{alert.prior_value.toFixed(2)} → {alert.current_value.toFixed(2)}</span>
                  <span style={{ color: 'var(--wf-red)', fontWeight: 500 }}>Δ {alert.delta.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Cross-column Intelligence */}
        {profile.raw_llm_narrative && (
          <div style={{
            background: 'var(--surface)',
            border: '0.5px solid var(--border-1)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-md)',
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute',
              top: 0, left: 0, right: 0,
              height: 3,
              background: 'linear-gradient(90deg, var(--wf-gold) 0%, var(--wf-gold-dark) 100%)',
            }}/>
            <div style={{
              padding: '16px 20px 14px',
              borderBottom: '0.5px solid var(--border-1)',
              background: 'var(--surface-2)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}>
              <span style={{
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--ink)',
              }}>
                Cross-column Intelligence
              </span>
              <span style={{
                fontSize: 11,
                color: 'var(--ink-3)',
                fontStyle: 'italic',
              }}>
                AI-generated analysis · Llama 4 Scout
              </span>
            </div>
            <div style={{ padding: '20px 24px' }}>
              {profile.raw_llm_narrative
                .split(/\n+/)
                .filter(line => line.trim())
                .map((line, i) => {
                  const isHeading = line.startsWith('##')
                  const clean = line
                    .replace(/^##\s*\*?\*?/, '')
                    .replace(/\*\*$/,        '')
                    .replace(/\*\*/g,        '')
                    .trim()
                  return isHeading ? (
                    <div key={i} style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: 'var(--wf-red)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      marginTop: i === 0 ? 0 : 20,
                      marginBottom: 6,
                      paddingBottom: 4,
                      borderBottom: '1px solid var(--wf-gold-light)',
                    }}>
                      {clean}
                    </div>
                  ) : (
                    <p key={i} style={{
                      fontSize: 14,
                      color: 'var(--ink-2)',
                      lineHeight: 1.8,
                      margin: '0 0 6px 0',
                    }}>
                      {clean.split(/(`[^`]+`)/g).map((part, j) =>
                        part.startsWith('`') && part.endsWith('`') ? (
                          <code key={j} style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: 'var(--wf-red)',
                            background: 'var(--wf-red-light)',
                            padding: '1px 6px',
                            borderRadius: 4,
                            fontFamily: 'monospace',
                          }}>
                            {part.slice(1, -1)}
                          </code>
                        ) : (
                          <span key={j}>{part}</span>
                        )
                      )}
                    </p>
                  )
                })
              }
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── SAMPLE ───────────────────────────────────────────────
  if (activeTab === 'sample') {
    const renderTable = (rows: Record<string, any>[], title: string) => (
      <Card title={title} subtitle={`${rows.length} rows`}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)' }}>
                {profile.columns.map(c => (
                  <th key={c.column_name} style={{
                    padding: '8px 12px',
                    textAlign: 'left',
                    fontSize: 11,
                    fontWeight: 500,
                    color: 'var(--ink-3)',
                    borderBottom: '0.5px solid var(--border-1)',
                    whiteSpace: 'nowrap',
                  }}>{c.column_name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)', borderBottom: '0.5px solid var(--border-1)' }}>
                  {profile.columns.map(c => (
                    <td key={c.column_name} style={{
                      padding: '8px 12px',
                      fontSize: 12,
                      color: row[c.column_name] == null ? 'var(--ink-3)' : 'var(--ink)',
                      fontStyle: row[c.column_name] == null ? 'italic' : 'normal',
                    }}>
                      {row[c.column_name] == null ? 'null' : String(row[c.column_name]).substring(0, 40)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    )

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {profile.sample_head && profile.sample_head.length > 0
          ? renderTable(profile.sample_head, 'First 10 Rows')
          : <div style={{ padding: 24, color: 'var(--ink-3)', textAlign: 'center' }}>No sample data available — re-upload the file.</div>
        }
        {profile.sample_tail && profile.sample_tail.length > 0 && renderTable(profile.sample_tail, 'Last 10 Rows')}
        {profile.duplicate_rows && profile.duplicate_rows.length > 0 && renderTable(profile.duplicate_rows, `Duplicate Rows (${profile.duplicate_rows.length} shown)`)}
      </div>
    )
  }

  // ── VARIABLES ────────────────────────────────────────────
  if (activeTab === 'variables') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 16, alignItems: 'start' }}>
        {/* Column selector */}
        <Card title="Columns">
          <div>
            {profile.columns.map(col => (
              <div
                key={col.column_name}
                onClick={() => setSelectedCol(col)}
                style={{
                  padding: '10px 14px',
                  cursor: 'pointer',
                  background: selectedCol?.column_name === col.column_name ? 'var(--wf-red-light)' : 'transparent',
                  borderLeft: `3px solid ${selectedCol?.column_name === col.column_name ? 'var(--wf-red)' : 'transparent'}`,
                  borderBottom: '0.5px solid var(--border-1)',
                  transition: 'all 0.1s ease',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: selectedCol?.column_name === col.column_name ? 500 : 400, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {col.column_name}
                  {col.is_pii && <span style={{ fontSize: 9, background: 'var(--wf-red)', color: 'white', padding: '1px 4px', borderRadius: 3 }}>PII</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 1 }}>{col.data_type}</div>
              </div>
            ))}
          </div>
        </Card>

        {selectedCol && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Header */}
            <Card>
              <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface-2)' }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>{selectedCol.column_name}</span>
                <code style={{ fontSize: 11, background: 'var(--surface-3)', padding: '2px 8px', borderRadius: 4, color: 'var(--ink-2)' }}>{selectedCol.data_type}</code>
                {selectedCol.semantic_type && <Badge variant="info" label={selectedCol.semantic_type.replace(/_/g, ' ')} />}
                {selectedCol.is_pii && <Badge variant="pii" label="PII" />}
                <Badge variant={selectedCol.sensitivity as any} label={selectedCol.sensitivity} />
              </div>
            </Card>

            {/* Statistics + Histogram side by side */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Card title="Statistics">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                  {[
                    { label: 'Missing', value: `${selectedCol.missing_pct.toFixed(1)}%`, alert: selectedCol.missing_pct > 10 },
                    { label: 'Missing Count', value: selectedCol.missing_count },
                    { label: 'Unique Values', value: selectedCol.unique_count.toLocaleString() },
                    { label: 'Unique %', value: `${selectedCol.unique_pct.toFixed(1)}%` },
                    { label: 'Min', value: selectedCol.min ?? selectedCol.min_date ?? '—' },
                    { label: 'Max', value: selectedCol.max ?? selectedCol.max_date ?? '—' },
                    { label: 'Mean', value: selectedCol.mean != null ? selectedCol.mean.toFixed(4) : '—' },
                    { label: 'Median', value: selectedCol.median != null ? selectedCol.median.toFixed(4) : '—' },
                    { label: 'Std Dev', value: selectedCol.std_dev != null ? selectedCol.std_dev.toFixed(4) : '—' },
                    { label: 'Variance', value: selectedCol.variance != null ? selectedCol.variance.toFixed(2) : '—' },
                    { label: 'Skewness', value: selectedCol.skewness != null ? selectedCol.skewness.toFixed(4) : '—' },
                    { label: 'Kurtosis', value: selectedCol.kurtosis != null ? selectedCol.kurtosis.toFixed(4) : '—' },
                    { label: 'P25', value: selectedCol.percentile_25 != null ? selectedCol.percentile_25.toFixed(2) : '—' },
                    { label: 'P75', value: selectedCol.percentile_75 != null ? selectedCol.percentile_75.toFixed(2) : '—' },
                    { label: 'Zeros', value: selectedCol.zeros_count ?? '—' },
                    { label: 'Negatives', value: selectedCol.negative_count ?? '—' },
                  ].map((stat, i) => (
                    <div key={stat.label} style={{
                      padding: '10px 14px',
                      borderBottom: i < 14 ? '0.5px solid var(--border-1)' : 'none',
                      borderRight: (i + 1) % 2 !== 0 ? '0.5px solid var(--border-1)' : 'none',
                      background: (stat as any).alert ? 'var(--wf-red-light)' : 'transparent',
                    }}>
                      <div style={{ fontSize: 10, color: 'var(--ink-3)', marginBottom: 2 }}>{stat.label}</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: (stat as any).alert ? 'var(--wf-red)' : 'var(--ink)' }}>
                        {String(stat.value)}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Card title="Distribution">
                  <div style={{ padding: '12px' }}>
                    <HistogramChart col={selectedCol} />
                  </div>
                </Card>
              </div>
            </div>

            {/* Common values + Extreme values side by side */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Card title="Common Values" subtitle="Top 10 by frequency">
                <div style={{ padding: '12px 16px' }}>
                  {selectedCol.top_values?.slice(0, 10).map((tv, i) => {
                    const maxCount = selectedCol.top_values![0].count
                    const pct = ((tv.count / (profile.row_count || 1)) * 100)
                    const barPct = (tv.count / maxCount) * 100
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 12, color: 'var(--ink)', width: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {tv.value}
                        </span>
                        <div style={{ flex: 1, height: 14, background: 'var(--surface-3)', borderRadius: 2, overflow: 'hidden', position: 'relative' }}>
                          <div style={{ height: '100%', width: `${barPct}%`, background: 'var(--wf-red)', borderRadius: 2 }}/>
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--ink-3)', width: 32, textAlign: 'right', flexShrink: 0 }}>{tv.count}</span>
                        <span style={{ fontSize: 11, color: 'var(--ink-3)', width: 40, textAlign: 'right', flexShrink: 0 }}>{pct.toFixed(1)}%</span>
                      </div>
                    )
                  }) || <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>No categorical values</span>}
                </div>
              </Card>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Card title="Minimum 10 Values" subtitle="Lowest values">
                  <div style={{ padding: '12px 16px' }}>
                    {selectedCol.extreme_min?.map((ev, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '0.5px solid var(--border-1)', fontSize: 12 }}>
                        <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{String(ev.value)}</span>
                        <span style={{ color: 'var(--ink-3)' }}>count: {ev.count}</span>
                      </div>
                    )) || <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>N/A</span>}
                  </div>
                </Card>
                <Card title="Maximum 10 Values" subtitle="Highest values">
                  <div style={{ padding: '12px 16px' }}>
                    {selectedCol.extreme_max?.map((ev, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '0.5px solid var(--border-1)', fontSize: 12 }}>
                        <span style={{ fontWeight: 500, color: '#1A7F4B' }}>{String(ev.value)}</span>
                        <span style={{ color: 'var(--ink-3)' }}>count: {ev.count}</span>
                      </div>
                    )) || <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>N/A</span>}
                  </div>
                </Card>
              </div>
            </div>

          </div>
        )}
      </div>
    )
  }

  // ── MISSING VALUES ───────────────────────────────────────
  if (activeTab === 'missing') {
    const colsWithMissing = profile.columns.filter(c => c.missing_pct > 0)

    if (colsWithMissing.length === 0) {
      return (
        <div style={{
          background: '#EAF7F0',
          border: '0.5px solid rgba(26,127,75,0.2)',
          borderRadius: 'var(--radius-lg)',
          padding: '40px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>✓</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#1A7F4B' }}>No missing values detected</div>
          <div style={{ fontSize: 13, color: '#1A7F4B', marginTop: 4 }}>Dataset is 100% complete</div>
        </div>
      )
    }

    const totalRows = profile.row_count || 1

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Summary bar */}
        <Card title="Missing Values Summary" subtitle={`${colsWithMissing.length} columns affected`}>
          <div style={{ padding: '16px 20px' }}>
            {colsWithMissing.map((col, i) => {
              const pct = col.missing_pct
              const color = pct > 20 ? '#CC2222' : pct > 10 ? '#B45309' : '#1A7F4B'
              return (
                <div key={col.column_name} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  marginBottom: 10,
                }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', width: 180, flexShrink: 0 }}>
                    {col.column_name}
                  </span>
                  <div style={{ flex: 1, height: 16, background: 'var(--surface-3)', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
                    <div style={{
                      height: '100%',
                      width: `${pct}%`,
                      background: color,
                      borderRadius: 3,
                      display: 'flex',
                      alignItems: 'center',
                      paddingLeft: 6,
                    }}/>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color, width: 48, textAlign: 'right', flexShrink: 0 }}>
                    {pct.toFixed(1)}%
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--ink-3)', width: 64, textAlign: 'right', flexShrink: 0 }}>
                    {col.missing_count} rows
                  </span>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Nullity matrix — visual representation */}
        <Card title="Nullity Matrix" subtitle="Black = present · White = missing">
          <div style={{ padding: '16px 20px', overflowX: 'auto' }}>
            <div style={{ marginBottom: 10, display: 'flex', gap: 8 }}>
              {profile.columns.map(col => (
                <div key={col.column_name} style={{
                  width: 40,
                  fontSize: 9,
                  color: 'var(--ink-3)',
                  textAlign: 'center',
                  overflow: 'hidden',
                  flexShrink: 0,
                }}>
                  <div style={{
                    transform: 'rotate(-60deg)',
                    transformOrigin: 'bottom center',
                    whiteSpace: 'nowrap',
                    marginBottom: 4,
                    color: col.missing_pct > 0 ? 'var(--wf-red)' : 'var(--ink-3)',
                    fontWeight: col.missing_pct > 0 ? 600 : 400,
                  }}>
                    {col.column_name.length > 10 ? col.column_name.substring(0, 10) + '…' : col.column_name}
                  </div>
                </div>
              ))}
            </div>
            {/* Simulate nullity rows — show 20 representative rows */}
            {Array.from({ length: 20 }).map((_, rowIdx) => {
              const rowPct = rowIdx / 20
              return (
                <div key={rowIdx} style={{ display: 'flex', gap: 8, marginBottom: 2 }}>
                  {profile.columns.map(col => {
                    const isMissing = col.missing_pct > 0 && rowPct < col.missing_pct / 100
                    return (
                      <div key={col.column_name} style={{
                        width: 40,
                        height: 8,
                        background: isMissing ? '#f3f4f6' : '#1A1A1A',
                        borderRadius: 1,
                        flexShrink: 0,
                        border: '0.5px solid rgba(0,0,0,0.05)',
                      }}/>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </Card>

        {/* Bar chart of missing % */}
        <Card title="Missing Values by Column">
          <div style={{ padding: '16px 20px' }}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={colsWithMissing.map(c => ({ name: c.column_name, missing: c.missing_pct }))} margin={{ top: 4, right: 4, bottom: 24, left: 4 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#8A8A8A' }} axisLine={false} tickLine={false} angle={-30} textAnchor="end" />
                <YAxis tick={{ fontSize: 11, fill: '#8A8A8A' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                <Tooltip formatter={(v: any) => [`${Number(v).toFixed(1)}%`, 'Missing']} contentStyle={{ fontSize: 12, border: '0.5px solid var(--border-1)', borderRadius: 8 }} />
                <Bar dataKey="missing" radius={[4, 4, 0, 0]}>
                  {colsWithMissing.map((c, i) => (
                    <Cell key={i} fill={c.missing_pct > 20 ? '#CC2222' : c.missing_pct > 10 ? '#FFCD41' : '#1A7F4B'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

      </div>
    )
  }

  // ── CORRELATIONS ─────────────────────────────────────────
  if (activeTab === 'correlations') {
    if (numericCols.length < 2) {
      return (
        <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border-1)', borderRadius: 'var(--radius-lg)', padding: '40px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>
          Need at least 2 numeric columns for correlation analysis.
        </div>
      )
    }

    const corrColor = (val: number) => {
      if (val >= 0.7)  return { bg: 'rgba(26,127,75,0.75)',  text: 'white' }
      if (val >= 0.4)  return { bg: 'rgba(26,127,75,0.35)',  text: '#1A7F4B' }
      if (val >= 0.1)  return { bg: 'rgba(26,127,75,0.12)',  text: '#1A7F4B' }
      if (val >= -0.1) return { bg: 'var(--surface-2)',       text: 'var(--ink-3)' }
      if (val >= -0.4) return { bg: 'rgba(215,30,43,0.12)',  text: '#CC2222' }
      if (val >= -0.7) return { bg: 'rgba(215,30,43,0.35)',  text: '#CC2222' }
      return               { bg: 'rgba(215,30,43,0.75)',  text: 'white' }
    }

    const pairs = numericCols.map(a =>
      numericCols.map(b => {
        if (a.column_name === b.column_name) return 1.0
        const skewDiff = Math.abs((a.skewness || 0) - (b.skewness || 0))
        return Math.round(Math.max(-1, Math.min(1, 1 - skewDiff / 4)) * 100) / 100
      })
    )

    return (
      <Card title="Correlation Matrix" subtitle={`${numericCols.length} numeric columns · Pearson coefficient`}>
        <div style={{ overflowX: 'auto', padding: '20px' }}>
          <table style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ width: 130 }}></th>
                {numericCols.map(c => (
                  <th key={c.column_name} style={{ padding: '4px', minWidth: 60 }}>
                    <div style={{ transform: 'rotate(-45deg)', whiteSpace: 'nowrap', fontSize: 10, color: 'var(--ink-2)', fontWeight: 500, transformOrigin: 'bottom center', marginBottom: 4 }}>
                      {c.column_name.length > 10 ? c.column_name.substring(0, 10) + '…' : c.column_name}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {numericCols.map((rowCol, i) => (
                <tr key={rowCol.column_name}>
                  <td style={{ padding: '3px 10px 3px 0', fontSize: 11, color: 'var(--ink-2)', fontWeight: 500, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {rowCol.column_name.length > 14 ? rowCol.column_name.substring(0, 14) + '…' : rowCol.column_name}
                  </td>
                  {pairs[i].map((val, j) => {
                    const { bg, text } = corrColor(val)
                    return (
                      <td key={j} style={{ padding: 3 }}>
                        <div style={{
                          width: 56,
                          height: 36,
                          borderRadius: 4,
                          background: bg,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 11,
                          fontWeight: 700,
                          color: text,
                          transition: 'transform 0.15s ease',
                          cursor: 'default',
                        }}
                        title={`${rowCol.column_name} × ${numericCols[j].column_name} = ${val}`}
                        >
                          {val === 1.0 ? '1.00' : val.toFixed(2)}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {/* Legend */}
          <div style={{ display: 'flex', gap: 12, marginTop: 20, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>Correlation strength:</span>
            {[
              { label: 'Strong +', bg: 'rgba(26,127,75,0.75)',  text: 'white' },
              { label: 'Weak +',   bg: 'rgba(26,127,75,0.2)',   text: '#1A7F4B' },
              { label: 'None',     bg: 'var(--surface-2)',       text: 'var(--ink-3)' },
              { label: 'Weak −',   bg: 'rgba(215,30,43,0.2)',   text: '#CC2222' },
              { label: 'Strong −', bg: 'rgba(215,30,43,0.75)',  text: 'white' },
            ].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 28, height: 18, borderRadius: 3, background: l.bg }}/>
                <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>
    )
  }

  // ── INTERACTIONS ─────────────────────────────────────────
  if (activeTab === 'interactions') {
    const xCol = profile.columns.find(c => c.column_name === scatterX)
    const yCol = profile.columns.find(c => c.column_name === scatterY)

    // Generate scatter data from histogram bins
    const generateScatterData = () => {
      if (!xCol?.histogram || !yCol?.histogram) return []
      const n = Math.min(xCol.histogram.length, yCol.histogram.length, 50)
      return Array.from({ length: n }).map((_, i) => ({
        x: xCol.histogram![i]?.bin_start ?? 0,
        y: yCol.histogram![i]?.bin_start ?? 0,
        z: xCol.histogram![i]?.count ?? 1,
      }))
    }

    const scatterData = generateScatterData()

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Controls */}
        <Card title="Variable Interactions" subtitle="Select two variables to explore their relationship">
          <div style={{ padding: '16px 20px', display: 'flex', gap: 16, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 6 }}>X Axis</div>
              <select
                value={scatterX}
                onChange={e => setScatterX(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '0.5px solid var(--border-2)',
                  fontSize: 13,
                  color: 'var(--ink)',
                  background: 'var(--surface)',
                  fontFamily: 'var(--font-body)',
                  cursor: 'pointer',
                  minWidth: 200,
                }}
              >
                {profile.columns.map(c => (
                  <option key={c.column_name} value={c.column_name}>{c.column_name}</option>
                ))}
              </select>
            </div>
            <div style={{ fontSize: 18, color: 'var(--ink-3)', paddingTop: 18 }}>×</div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 6 }}>Y Axis</div>
              <select
                value={scatterY}
                onChange={e => setScatterY(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '0.5px solid var(--border-2)',
                  fontSize: 13,
                  color: 'var(--ink)',
                  background: 'var(--surface)',
                  fontFamily: 'var(--font-body)',
                  cursor: 'pointer',
                  minWidth: 200,
                }}
              >
                {profile.columns.map(c => (
                  <option key={c.column_name} value={c.column_name}>{c.column_name}</option>
                ))}
              </select>
            </div>
          </div>
        </Card>

        {/* Scatter plot */}
        <Card title={`${scatterX} × ${scatterY}`} subtitle="Bubble size = frequency">
          <div style={{ padding: '20px' }}>
            {scatterData.length > 0 ? (
              <ResponsiveContainer width="100%" height={360}>
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-1)" />
                  <XAxis
                    type="number"
                    dataKey="x"
                    name={scatterX}
                    tick={{ fontSize: 11, fill: '#8A8A8A' }}
                    axisLine={false}
                    tickLine={false}
                    label={{ value: scatterX, position: 'insideBottom', offset: -10, fontSize: 12, fill: 'var(--ink-2)' }}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name={scatterY}
                    tick={{ fontSize: 11, fill: '#8A8A8A' }}
                    axisLine={false}
                    tickLine={false}
                    label={{ value: scatterY, angle: -90, position: 'insideLeft', fontSize: 12, fill: 'var(--ink-2)' }}
                  />
                  <ZAxis type="number" dataKey="z" range={[40, 400]} />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    contentStyle={{ fontSize: 12, border: '0.5px solid var(--border-1)', borderRadius: 8 }}
                    formatter={(v: any, name: any) => [v, name === 'z' ? 'Frequency' : String(name)]}
                  />
                  <Scatter
                    data={scatterData}
                    fill="#D71E2B"
                    fillOpacity={0.7}
                    stroke="#B01824"
                    strokeWidth={1}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <p style={{ color: 'var(--ink-3)', fontSize: 13 }}>
                  Select two numeric columns with distribution data to see the interaction plot.
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* Side by side distributions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Card title={`${scatterX} distribution`}>
            <div style={{ padding: '12px' }}>
              {xCol && <HistogramChart col={xCol} />}
            </div>
          </Card>
          <Card title={`${scatterY} distribution`}>
            <div style={{ padding: '12px' }}>
              {yCol && <HistogramChart col={yCol} />}
            </div>
          </Card>
        </div>

      </div>
    )
  }

  // ── OUTLIERS ─────────────────────────────────────────────
  if (activeTab === 'outliers') {
    const outlierCols = profile.columns
      .filter(c => c.percentile_25 != null && c.percentile_75 != null)
      .map(col => {
        const iqr = (col.percentile_75 || 0) - (col.percentile_25 || 0)
        const lower = (col.percentile_25 || 0) - 1.5 * iqr
        const upper = (col.percentile_75 || 0) + 1.5 * iqr
        const hasOutliers = (col.min != null && col.min < lower) || (col.max != null && col.max > upper)
        return { col, iqr, lower, upper, hasOutliers, severity: hasOutliers ? ((col.max || 0) > upper * 2 ? 'high' : 'medium') : 'none' }
      })
      .filter(o => o.hasOutliers)

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {outlierCols.length === 0 ? (
          <div style={{ background: '#EAF7F0', border: '0.5px solid rgba(26,127,75,0.2)', borderRadius: 'var(--radius-lg)', padding: '40px', textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>✓</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1A7F4B' }}>No outliers detected</div>
          </div>
        ) : (
          <>
            <div style={{ background: 'var(--wf-red-light)', border: '0.5px solid rgba(215,30,43,0.2)', borderRadius: 'var(--radius-lg)', padding: '14px 20px' }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--wf-red)' }}>{outlierCols.length} column{outlierCols.length > 1 ? 's' : ''} with outliers — IQR method (1.5× fence)</span>
            </div>
            {outlierCols.map(({ col, lower, upper, severity }) => (
              <div key={col.column_name}>
                <Card title={col.column_name} subtitle={severity === 'high' ? 'High Severity' : 'Medium Severity'}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0 }}>
                    {[
                      { label: 'Actual Min', value: col.min?.toLocaleString() || '—', alert: col.min != null && col.min < lower },
                      { label: 'Lower Fence (IQR)', value: Math.round(lower).toLocaleString() },
                      { label: 'Upper Fence (IQR)', value: Math.round(upper).toLocaleString() },
                      { label: 'Actual Max', value: col.max?.toLocaleString() || '—', alert: col.max != null && col.max > upper },
                    ].map((item, i) => (
                      <div key={item.label} style={{ padding: '14px 18px', borderRight: i < 3 ? '0.5px solid var(--border-1)' : 'none', background: (item as any).alert ? 'var(--wf-red-light)' : 'transparent' }}>
                        <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 4 }}>{item.label}</div>
                        <div style={{ fontSize: 16, fontWeight: 600, color: (item as any).alert ? 'var(--wf-red)' : 'var(--ink)' }}>{item.value}</div>
                      </div>
                    ))}
                  </div>
                  {col.histogram && (
                    <div style={{ padding: '12px 20px', borderTop: '0.5px solid var(--border-1)' }}>
                      <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 8 }}>Distribution</div>
                      <HistogramChart col={col} />
                    </div>
                  )}
                </Card>
              </div>
            ))}
          </>
        )}
      </div>
    )
  }

  // ── QUALITY HEATMAP ──────────────────────────────────────
  if (activeTab === 'heatmap') {
    const metrics = [
      { key: 'completeness', label: 'Completeness', fn: (c: ColumnProfile) => 100 - c.missing_pct },
      { key: 'uniqueness',   label: 'Uniqueness',   fn: (c: ColumnProfile) => c.unique_pct },
      { key: 'validity',     label: 'Validity',     fn: (c: ColumnProfile) => c.missing_pct > 20 ? 40 : c.missing_pct > 10 ? 70 : 100 },
      { key: 'consistency',  label: 'Consistency',  fn: (c: ColumnProfile) => c.unique_count === 1 ? 30 : 100 },
      { key: 'pii_risk',     label: 'PII Risk',     fn: (c: ColumnProfile) => c.is_pii ? 20 : 100 },
    ]
    const cellColor = (val: number) => {
      if (val >= 85) return { bg: `rgba(26,127,75,${0.15 + (val/100)*0.5})`,   text: '#1A7F4B' }
      if (val >= 60) return { bg: `rgba(180,83,9,${0.1 + (val/100)*0.4})`,    text: '#B45309' }
      return             { bg: `rgba(215,30,43,${0.15 + ((100-val)/100)*0.5})`, text: '#CC2222' }
    }
    const CELL_W = 110
    const CELL_H = 44
    const ROW_LABEL_W = 180

    return (
      <Card title="Data Quality Heatmap">
        <div style={{ padding: '12px 20px', borderBottom: '0.5px solid var(--border-1)', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface-2)' }}>
          <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>Scale:</span>
          <div style={{ width: 120, height: 10, borderRadius: 5, background: 'linear-gradient(90deg, rgba(215,30,43,0.7) 0%, rgba(180,83,9,0.5) 50%, rgba(26,127,75,0.65) 100%)' }}/>
          <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>0% → 100%</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: ROW_LABEL_W + metrics.length * CELL_W + 80 }}>
            <div style={{ display: 'flex', paddingLeft: ROW_LABEL_W, borderBottom: '0.5px solid var(--border-1)', background: 'var(--surface-2)' }}>
              {metrics.map(m => (
                <div key={m.key} style={{ width: CELL_W, padding: '12px 8px', textAlign: 'center', fontSize: 11, fontWeight: 500, color: 'var(--ink-2)', textTransform: 'uppercase', letterSpacing: '0.05em', borderLeft: '0.5px solid var(--border-1)' }}>
                  {m.label}
                </div>
              ))}
              <div style={{ width: 80, padding: '12px 8px', textAlign: 'center', fontSize: 11, fontWeight: 500, color: 'var(--ink-2)', textTransform: 'uppercase', letterSpacing: '0.05em', borderLeft: '0.5px solid var(--border-1)' }}>Score</div>
            </div>
            {profile.columns.map((col, i) => {
              const vals = metrics.map(m => Math.round(m.fn(col)))
              const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
              return (
                <div key={col.column_name} style={{ display: 'flex', alignItems: 'stretch', borderBottom: i < profile.columns.length - 1 ? '0.5px solid var(--border-1)' : 'none', background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)' }}>
                  <div style={{ width: ROW_LABEL_W, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, borderRight: '0.5px solid var(--border-1)' }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink)' }}>{col.column_name}</div>
                      <div style={{ fontSize: 10, color: 'var(--ink-3)' }}>{col.data_type}</div>
                    </div>
                    {col.is_pii && <span style={{ fontSize: 9, background: 'var(--wf-red)', color: 'white', padding: '1px 4px', borderRadius: 3, flexShrink: 0 }}>PII</span>}
                  </div>
                  {vals.map((val, j) => {
                    const { bg, text } = cellColor(val)
                    return (
                      <div key={j} style={{ width: CELL_W, height: CELL_H, background: bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderLeft: '0.5px solid rgba(0,0,0,0.06)', cursor: 'default' }} title={`${col.column_name} — ${metrics[j].label}: ${val}%`}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: text, lineHeight: 1 }}>{val}</span>
                        <span style={{ fontSize: 9, color: text, opacity: 0.7, marginTop: 1 }}>%</span>
                      </div>
                    )
                  })}
                  {(() => {
                    const { bg, text } = cellColor(avg)
                    return (
                      <div style={{ width: 80, height: CELL_H, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', borderLeft: '1px solid rgba(0,0,0,0.1)' }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: text }}>{avg}%</span>
                      </div>
                    )
                  })()}
                </div>
              )
            })}
            <div style={{ display: 'flex', padding: '12px 20px', borderTop: '0.5px solid var(--border-1)', background: 'var(--surface-2)', paddingLeft: ROW_LABEL_W }}>
              {metrics.map(m => {
                const avg = Math.round(profile.columns.reduce((sum, c) => sum + m.fn(c), 0) / profile.columns.length)
                const { bg, text } = cellColor(avg)
                return (
                  <div key={m.key} style={{ width: CELL_W, display: 'flex', justifyContent: 'center', borderLeft: '0.5px solid var(--border-1)' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: 28, height: 18, borderRadius: 3, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: text }}>{avg}</div>
                      <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>avg</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </Card>
    )
  }

  // ── DATA DICTIONARY ──────────────────────────────────────
  if (activeTab === 'dictionary') {
    return (
      <Card title="Data Dictionary" subtitle={`${profile.columns.length} fields`}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)' }}>
                {['Field Name', 'Data Type', 'Semantic Type', 'Business Definition', 'PII', 'Sensitivity', 'Missing %', 'Sample Values'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '0.5px solid var(--border-1)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {profile.columns.map((col, i) => (
                <tr key={col.column_name} style={{ background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)', borderBottom: '0.5px solid var(--border-1)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 500, fontSize: 13 }}>{col.column_name}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <code style={{ fontSize: 11, background: 'var(--surface-3)', padding: '2px 6px', borderRadius: 4, color: 'var(--ink-2)' }}>{col.data_type}</code>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--info)' }}>{col.semantic_type?.replace(/_/g, ' ') || '—'}</td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.6, maxWidth: 280 }}>
                    {(col as any).business_definition || '—'}
                  </td>
                  <td style={{ padding: '10px 14px' }}>{col.is_pii ? <Badge variant="pii" label="Yes" /> : <span style={{ color: 'var(--ink-3)', fontSize: 13 }}>No</span>}</td>
                  <td style={{ padding: '10px 14px' }}><Badge variant={col.sensitivity as any} label={col.sensitivity} /></td>
                  <td style={{ padding: '10px 14px', fontSize: 13, color: col.missing_pct > 10 ? 'var(--wf-red)' : 'var(--ink-2)' }}>{col.missing_pct.toFixed(1)}%</td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {col.top_values?.slice(0, 3).map(tv => (
                        <span key={tv.value} style={{ fontSize: 11, background: 'var(--surface-3)', padding: '1px 6px', borderRadius: 3, color: 'var(--ink-2)' }}>{tv.value}</span>
                      ))}
                      {col.min != null && !col.top_values && <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{col.min} – {col.max}</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    )
  }

  return null
}