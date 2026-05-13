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

// ── VAR TYPE COLOR ────────────────────────────────────────
function varTypeColor(vt: string | undefined) {
  switch (vt) {
    case 'Numeric':     return { bg: 'rgba(26,127,75,0.12)',  text: '#1A7F4B' }
    case 'Text':        return { bg: 'rgba(59,130,246,0.12)', text: '#2563EB' }
    case 'Categorical': return { bg: 'rgba(245,158,11,0.12)', text: '#B45309' }
    case 'DateTime':    return { bg: 'rgba(139,92,246,0.12)', text: '#7C3AED' }
    case 'Unsupported': return { bg: 'rgba(220,38,38,0.10)',  text: '#DC2626' }
    default:            return { bg: 'var(--surface-3)',       text: 'var(--ink-3)' }
  }
}

// ── INLINE BAR ROW ────────────────────────────────────────
function FreqRow({ label, count, total, barColor = 'var(--wf-red)' }: {
  label: string; count: number; total: number; barColor?: string
}) {
  const pct = total > 0 ? (count / total) * 100 : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '0.5px solid var(--border-1)' }}>
      <span style={{ fontSize: 12, color: 'var(--ink)', width: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 12, background: 'var(--surface-3)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: barColor, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--ink-3)', width: 36, textAlign: 'right', flexShrink: 0 }}>{count.toLocaleString()}</span>
      <span style={{ fontSize: 11, color: 'var(--ink-3)', width: 60, textAlign: 'right', flexShrink: 0, paddingLeft: 16 }}>{pct.toFixed(1)}%</span>
    </div>
  )
}

// ── METRIC TABLE ROW ──────────────────────────────────────
function MRow({ label, value, alert }: { label: string; value: string | number; alert?: boolean }) {
  return (
    <tr style={{ borderBottom: '0.5px solid var(--border-1)', background: alert ? 'var(--wf-red-light)' : 'transparent' }}>
      <td style={{ padding: '8px 14px', fontSize: 12, color: 'var(--ink-3)', width: '55%' }}>{label}</td>
      <td style={{ padding: '8px 14px', fontSize: 13, fontWeight: 600, color: alert ? 'var(--wf-red)' : 'var(--ink)' }}>{String(value ?? '—')}</td>
    </tr>
  )
}

// ── WORD CLOUD ────────────────────────────────────────────
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'

// Image-based word cloud — generated by Python wordcloud library on the backend
function WordCloud({ profileId, columnName }: { profileId: string; columnName: string }) {
  const [failed, setFailed] = useState(false)
  const src = `${API_BASE}/api/profiles/${profileId}/wordcloud/${encodeURIComponent(columnName)}`

  if (failed) return (
    <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-3)', fontSize: 12 }}>
      Word cloud unavailable for this column
    </div>
  )

  return (
    <div style={{ padding: 8, background: '#fff', borderRadius: 'var(--radius-md)' }}>
      <img
        src={src}
        alt={`Word cloud — ${columnName}`}
        style={{ maxWidth: 380, width: '100%', height: 'auto', borderRadius: 6, display: 'block', margin: '0 auto' }}
        onError={() => setFailed(true)}
      />
    </div>
  )
}

// ── LARGE HISTOGRAM CHART ─────────────────────────────────
function LargeHistogram({ col }: { col: ColumnProfile }) {
  if (!col.histogram || col.histogram.length === 0) return (
    <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>No distribution data</span>
    </div>
  )
  const isNumeric = !col.histogram[0].label
  const data = col.histogram.map((b, i) => ({
    name: b.label || `${b.bin_start}`,
    count: b.count,
    index: i,
  }))
  return (
    <div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 28, left: 40 }}>
          <XAxis
            dataKey="name"
            tick={{ fontSize: 9, fill: '#8A8A8A' }}
            axisLine={false}
            tickLine={false}
            interval={isNumeric ? Math.floor(data.length / 8) : 0}
            angle={isNumeric ? 0 : -35}
            textAnchor={isNumeric ? 'middle' : 'end'}
          />
          <YAxis tick={{ fontSize: 9, fill: '#8A8A8A' }} axisLine={false} tickLine={false} label={{ value: 'Frequency', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#8A8A8A', offset: -10 }} />
          <Tooltip
            contentStyle={{ fontSize: 11, border: '0.5px solid var(--border-1)', borderRadius: 6 }}
            formatter={(v: any) => [v, 'Count']}
          />
          <Bar dataKey="count" radius={[2, 2, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={i % 2 === 0 ? '#D71E2B' : '#B01824'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--ink-3)', paddingBottom: 8 }}>
        Histogram with fixed size bins (bins={isNumeric ? col.histogram.length : col.histogram.length})
      </div>
    </div>
  )
}

// ── LENGTH HISTOGRAM ──────────────────────────────────────
function LengthHistogram({ data }: { data: { length: number; count: number }[] }) {
  if (!data || data.length === 0) return null
  return (
    <div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 24, left: 32 }}>
          <XAxis dataKey="length" tick={{ fontSize: 9, fill: '#8A8A8A' }} axisLine={false} tickLine={false} label={{ value: 'Length', position: 'insideBottom', offset: -12, fontSize: 10, fill: '#8A8A8A' }} />
          <YAxis tick={{ fontSize: 9, fill: '#8A8A8A' }} axisLine={false} tickLine={false} label={{ value: 'Frequency', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#8A8A8A', offset: -8 }} />
          <Tooltip contentStyle={{ fontSize: 11, border: '0.5px solid var(--border-1)', borderRadius: 6 }} formatter={(v: any) => [v, 'Count']} />
          <Bar dataKey="count" fill="#FFCD41" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--ink-3)', paddingBottom: 4 }}>Histogram of lengths of the category</div>
    </div>
  )
}

// ── STACKED BAR CHART (for Common Values Plot) ────────────
function CategoricalStackedBar({ col, total }: { col: ColumnProfile; total: number }) {
  if (!col.top_values || col.top_values.length === 0) return null
  const topN = col.top_values.slice(0, 10)
  const topSum = topN.reduce((s, t) => s + t.count, 0)
  const other = total - topSum - (col.missing_count || 0)
  const palette = ['#D71E2B','#B01824','#FFCD41','#E6A800','#1A7F4B','#156039','#2563EB','#1D4ED8','#7C3AED','#6D28D9','#B45309','#92400E']
  const segments = [
    ...topN.map((tv, i) => ({ label: tv.value, count: tv.count, color: palette[i % palette.length] })),
    ...(other > 0 ? [{ label: 'Other values', count: other, color: '#D1D5DB' }] : []),
    ...(col.missing_count > 0 ? [{ label: '(Missing)', count: col.missing_count, color: '#F3F4F6' }] : []),
  ]
  return (
    <div>
      <div style={{ display: 'flex', height: 32, borderRadius: 4, overflow: 'hidden', marginBottom: 10 }}>
        {segments.map(seg => (
          <div
            key={seg.label}
            title={`${seg.label}: ${seg.count} (${((seg.count / total) * 100).toFixed(1)}%)`}
            style={{ width: `${(seg.count / total) * 100}%`, background: seg.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'white', fontWeight: 700, overflow: 'hidden', flexShrink: 0 }}
          >
            {(seg.count / total) * 100 > 5 ? `${((seg.count / total) * 100).toFixed(0)}%` : ''}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
        {segments.map(seg => (
          <div key={seg.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: seg.color, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: 'var(--ink-2)' }}>{seg.label.length > 20 ? seg.label.slice(0, 20) + '…' : seg.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── OVERVIEW TABLE (all var types) ────────────────────────
function OverviewTable({ col, total }: { col: ColumnProfile; total: number }) {
  const fmt = (n: number | undefined, decimals = 2) => n != null ? n.toFixed(decimals) : '—'
  const fmtBytes = (b: number | undefined) => {
    if (b == null) return '—'
    if (b < 1024) return `${b} B`
    if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`
    return `${(b / 1048576).toFixed(2)} MB`
  }
  const minVal = col.var_type === 'DateTime'
    ? (col.min_date ? new Date(col.min_date).toLocaleDateString() : '—')
    : fmt(col.min)
  const maxVal = col.var_type === 'DateTime'
    ? (col.max_date ? new Date(col.max_date).toLocaleDateString() : '—')
    : fmt(col.max)

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <tbody>
        <MRow label="Distinct count" value={col.unique_count.toLocaleString()} />
        <MRow label="Distinct (%)" value={`${fmt(col.unique_pct)}%`} />
        <MRow label="Missing count" value={col.missing_count.toLocaleString()} alert={col.missing_pct > 10} />
        <MRow label="Missing (%)" value={`${fmt(col.missing_pct)}%`} alert={col.missing_pct > 10} />
        <MRow label="Infinite count" value={(col.infinite_count ?? 0).toLocaleString()} alert={(col.infinite_count ?? 0) > 0} />
        <MRow label="Infinite (%)" value={`${fmt(col.infinite_pct)}%`} />
        <MRow label="Mean" value={col.var_type === 'Numeric' ? fmt(col.mean, 4) : '—'} />
        <MRow label="Minimum" value={minVal} />
        <MRow label="Maximum" value={maxVal} />
        <MRow label="Zeros count" value={col.var_type === 'Numeric' ? (col.zeros_count ?? 0).toLocaleString() : '—'} />
        <MRow label="Zeros (%)" value={col.var_type === 'Numeric' ? `${fmt(col.zeros_pct)}%` : '—'} />
        <MRow label="Negative count" value={col.var_type === 'Numeric' ? (col.negative_count ?? 0).toLocaleString() : '—'} />
        <MRow label="Negative (%)" value={col.var_type === 'Numeric' ? `${fmt(col.negative_pct)}%` : '—'} />
        <MRow label="Memory size" value={fmtBytes(col.memory_size)} />
      </tbody>
    </table>
  )
}

// ── STATISTICS TABLE (Numeric only) ──────────────────────
function StatisticsTable({ col }: { col: ColumnProfile }) {
  const fmt = (n: number | undefined, d = 4) => n != null ? n.toFixed(d) : '—'
  const iqr = col.percentile_75 != null && col.percentile_25 != null ? col.percentile_75 - col.percentile_25 : null
  const range = col.max != null && col.min != null ? col.max - col.min : null

  const quantileRows = [
    ['Minimum',                    fmt(col.min)],
    ['5-th percentile',            fmt(col.percentile_5)],
    ['Q1',                         fmt(col.percentile_25)],
    ['Median',                     fmt(col.median)],
    ['Q3',                         fmt(col.percentile_75)],
    ['95-th percentile',           fmt(col.percentile_95)],
    ['Maximum',                    fmt(col.max)],
    ['Range',                      range != null ? range.toFixed(4) : '—'],
    ['Interquartile range (IQR)',   iqr != null ? iqr.toFixed(4) : '—'],
  ]
  const descriptiveRows = [
    ['Standard deviation',                         fmt(col.std_dev)],
    ['Coefficient of variation (CV)',              col.cv != null ? col.cv.toFixed(4) : '—'],
    ['Kurtosis',                                   fmt(col.kurtosis)],
    ['Mean',                                       fmt(col.mean)],
    ['Median Absolute Deviation (MAD)',            fmt(col.mad)],
    ['Skewness',                                   fmt(col.skewness)],
    ['Sum',                                        col.sum_val != null ? col.sum_val.toLocaleString() : '—'],
    ['Variance',                                   col.variance != null ? col.variance.toFixed(4) : '—'],
    ['Monotonicity',                               col.monotonicity ?? '—'],
  ]

  const tdStyle = { padding: '7px 12px', fontSize: 12, borderBottom: '0.5px solid var(--border-1)' } as const

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
      {/* Quantile */}
      <div style={{ borderRight: '0.5px solid var(--border-1)' }}>
        <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--surface-2)', borderBottom: '0.5px solid var(--border-1)' }}>
          Quantile Statistics
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {quantileRows.map(([label, value]) => (
              <tr key={label} style={{ borderBottom: '0.5px solid var(--border-1)' }}>
                <td style={{ ...tdStyle, color: 'var(--ink-3)', width: '60%' }}>{label}</td>
                <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--ink)' }}>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Descriptive */}
      <div>
        <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--surface-2)', borderBottom: '0.5px solid var(--border-1)' }}>
          Descriptive Statistics
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {descriptiveRows.map(([label, value]) => (
              <tr key={label} style={{ borderBottom: '0.5px solid var(--border-1)' }}>
                <td style={{ ...tdStyle, color: 'var(--ink-3)', width: '60%' }}>{label}</td>
                <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--ink)' }}>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── COMMON VALUES TABLE ───────────────────────────────────
function CommonValuesTable({ col, total }: { col: ColumnProfile; total: number }) {
  const tvs = col.top_values ?? []
  const topSum = tvs.reduce((s, t) => s + t.count, 0)
  const other = Math.max(0, total - topSum - (col.missing_count || 0))
  const maxCount = tvs[0]?.count || 1

  const rows = [
    ...tvs.slice(0, 10),
    ...(other > 0 ? [{ value: 'Other values', count: other }] : []),
    ...(col.missing_count > 0 ? [{ value: '(Missing)', count: col.missing_count }] : []),
  ]

  return (
    <div>
      {/* Header row — flex so columns align with data rows */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderBottom: '0.5px solid var(--border-1)', background: 'var(--surface-2)' }}>
        <span style={{ flex: 1, fontSize: 10, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Value</span>
        <div style={{ width: 80, flexShrink: 0 }} />
        <span style={{ width: 40, textAlign: 'right', fontSize: 10, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>Count</span>
        <span style={{ width: 64, textAlign: 'right', fontSize: 10, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0, paddingLeft: 16 }}>Freq (%)</span>
      </div>
      {rows.map((tv, i) => {
        const pct = total > 0 ? (tv.count / total) * 100 : 0
        const barPct = (tv.count / maxCount) * 100
        const isOther = tv.value === 'Other values' || tv.value === '(Missing)'
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderBottom: '0.5px solid var(--border-1)', background: isOther ? 'var(--surface-2)' : 'transparent' }}>
            <span style={{ flex: 1, fontSize: 12, color: isOther ? 'var(--ink-3)' : 'var(--ink)', fontStyle: isOther ? 'italic' : 'normal', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {tv.value}
            </span>
            <div style={{ width: 80, height: 10, background: 'var(--surface-3)', borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
              <div style={{ height: '100%', width: `${barPct}%`, background: isOther ? '#9CA3AF' : 'var(--wf-red)', borderRadius: 2 }} />
            </div>
            <span style={{ fontSize: 11, color: 'var(--ink-3)', width: 40, textAlign: 'right', flexShrink: 0 }}>{tv.count.toLocaleString()}</span>
            <span style={{ fontSize: 11, color: 'var(--ink-3)', width: 64, textAlign: 'right', flexShrink: 0, paddingLeft: 16 }}>{pct.toFixed(1)}%</span>
          </div>
        )
      })}
    </div>
  )
}

// ── EXTREME VALUES TABLE ──────────────────────────────────
function ExtremeValuesTable({ values, total, color }: { values: { value: string | number; count: number }[]; total: number; color: string }) {
  const maxCount = values[0]?.count || 1
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderBottom: '0.5px solid var(--border-1)', background: 'var(--surface-2)' }}>
        <span style={{ flex: 1, fontSize: 10, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Value</span>
        <div style={{ width: 80, flexShrink: 0 }} />
        <span style={{ width: 40, textAlign: 'right', fontSize: 10, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>Count</span>
        <span style={{ width: 64, textAlign: 'right', fontSize: 10, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0, paddingLeft: 16 }}>Freq (%)</span>
      </div>
      {values.map((ev, i) => {
        const pct = total > 0 ? (ev.count / total) * 100 : 0
        const barPct = (ev.count / maxCount) * 100
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderBottom: '0.5px solid var(--border-1)' }}>
            <span style={{ flex: 1, fontSize: 12, color, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {String(ev.value)}
            </span>
            <div style={{ width: 80, height: 10, background: 'var(--surface-3)', borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
              <div style={{ height: '100%', width: `${barPct}%`, background: color, borderRadius: 2 }} />
            </div>
            <span style={{ fontSize: 11, color: 'var(--ink-3)', width: 40, textAlign: 'right', flexShrink: 0 }}>{ev.count.toLocaleString()}</span>
            <span style={{ fontSize: 11, color: 'var(--ink-3)', width: 64, textAlign: 'right', flexShrink: 0, paddingLeft: 16 }}>{pct.toFixed(1)}%</span>
          </div>
        )
      })}
    </div>
  )
}

// ── TEXT / CATEGORICAL OVERVIEW ───────────────────────────
function TextCatOverview({ col, total }: { col: ColumnProfile; total: number }) {
  const fmt = (n: number | undefined, d = 2) => n != null ? n.toFixed(d) : '—'
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><th colSpan={2} style={{ padding: '7px 12px', fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--surface-2)', borderBottom: '0.5px solid var(--border-1)', textAlign: 'left' }}>Length</th></tr></thead>
        <tbody>
          {[
            ['Max length',    col.max_length],
            ['Median length', col.median_length != null ? Number(col.median_length).toFixed(1) : '—'],
            ['Mean length',   col.mean_length != null ? Number(col.mean_length).toFixed(1) : '—'],
            ['Min length',    col.min_length],
          ].map(([l, v]) => (
            <tr key={l as string} style={{ borderBottom: '0.5px solid var(--border-1)' }}>
              <td style={{ padding: '7px 12px', fontSize: 12, color: 'var(--ink-3)', width: '55%' }}>{l}</td>
              <td style={{ padding: '7px 12px', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{String(v ?? '—')}</td>
            </tr>
          ))}
        </tbody>
        <thead><tr><th colSpan={2} style={{ padding: '7px 12px', fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--surface-2)', borderBottom: '0.5px solid var(--border-1)', textAlign: 'left' }}>Unique</th></tr></thead>
        <tbody>
          {[
            ['Unique count', col.unique_exact_count],
            ['Unique (%)',   col.unique_exact_pct != null ? `${Number(col.unique_exact_pct).toFixed(1)}%` : '—'],
          ].map(([l, v]) => (
            <tr key={l as string} style={{ borderBottom: '0.5px solid var(--border-1)' }}>
              <td style={{ padding: '7px 12px', fontSize: 12, color: 'var(--ink-3)', width: '55%' }}>{l}</td>
              <td style={{ padding: '7px 12px', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{String(v ?? '—')}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
          <thead><tr><th colSpan={2} style={{ padding: '7px 12px', fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--surface-2)', borderBottom: '0.5px solid var(--border-1)', textAlign: 'left' }}>Unicode</th></tr></thead>
          <tbody>
            {[
              ['Total characters',    col.total_chars?.toLocaleString()],
              ['Distinct characters', col.distinct_chars],
              ['Distinct categories', col.distinct_categories],
              ['Distinct scripts',    col.distinct_scripts],
              ['Distinct blocks',     col.distinct_blocks],
            ].map(([l, v]) => (
              <tr key={l as string} style={{ borderBottom: '0.5px solid var(--border-1)' }}>
                <td style={{ padding: '7px 12px', fontSize: 12, color: 'var(--ink-3)', width: '60%' }}>{l}</td>
                <td style={{ padding: '7px 12px', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{String(v ?? '—')}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {col.sample_values && col.sample_values.length > 0 && (
          <div style={{ background: 'var(--surface-2)', border: '0.5px solid var(--border-1)', borderRadius: 'var(--radius-md)', padding: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Sample</div>
            {col.sample_values.map((v, i) => (
              <div key={i} style={{ fontSize: 12, color: 'var(--ink-2)', padding: '3px 0', borderBottom: i < col.sample_values!.length - 1 ? '0.5px solid var(--border-1)' : 'none' }}>
                <span style={{ color: 'var(--ink-3)', marginRight: 6 }}>Row {i + 1}</span>{v}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── WORDS TAB ─────────────────────────────────────────────
function WordsTab({ col, total, profileId, columnName }: { col: ColumnProfile; total: number; profileId: string; columnName: string }) {
  const words = col.word_frequencies ?? []
  const maxCount = words[0]?.count || 1
  const topSum = words.slice(0, 15).reduce((s, w) => s + w.count, 0)
  const allSum = words.reduce((s, w) => s + w.count, 0)
  const other = Math.max(0, allSum - topSum)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', background: 'var(--surface-2)', borderBottom: '0.5px solid var(--border-1)' }}>
          <span style={{ flex: 1, fontSize: 10, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Word</span>
          <div style={{ width: 60, flexShrink: 0 }} />
          <span style={{ width: 36, textAlign: 'right', fontSize: 10, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>Count</span>
          <span style={{ width: 60, textAlign: 'right', fontSize: 10, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0, paddingLeft: 16 }}>Freq (%)</span>
        </div>
        {words.slice(0, 15).map(({ word, count }) => {
          const pct = allSum > 0 ? (count / allSum) * 100 : 0
          const barPct = (count / maxCount) * 100
          return (
            <div key={word} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderBottom: '0.5px solid var(--border-1)' }}>
              <span style={{ flex: 1, fontSize: 12, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{word}</span>
              <div style={{ width: 60, height: 10, background: 'var(--surface-3)', borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
                <div style={{ height: '100%', width: `${barPct}%`, background: 'var(--wf-red)', borderRadius: 2 }} />
              </div>
              <span style={{ fontSize: 11, color: 'var(--ink-3)', width: 36, textAlign: 'right', flexShrink: 0 }}>{count}</span>
              <span style={{ fontSize: 11, color: 'var(--ink-3)', width: 60, textAlign: 'right', flexShrink: 0, paddingLeft: 16 }}>{pct.toFixed(1)}%</span>
            </div>
          )
        })}
        {other > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px', background: 'var(--surface-2)', fontStyle: 'italic' }}>
            <span style={{ flex: 1, fontSize: 12, color: 'var(--ink-3)' }}>Other values</span>
            <div style={{ width: 60, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: 'var(--ink-3)', width: 36, textAlign: 'right', flexShrink: 0 }}>{other}</span>
            <span style={{ fontSize: 11, color: 'var(--ink-3)', width: 60, textAlign: 'right', flexShrink: 0, paddingLeft: 16 }}>{allSum > 0 ? ((other / allSum) * 100).toFixed(1) : 0}%</span>
          </div>
        )}
      </div>
      <div>
        <div style={{ padding: '8px 12px', fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'var(--surface-2)', borderBottom: '0.5px solid var(--border-1)' }}>Word Cloud</div>
        <WordCloud profileId={profileId} columnName={columnName} />
      </div>
    </div>
  )
}

// ── CHARACTERS TAB ────────────────────────────────────────
function CharactersTab({ col }: { col: ColumnProfile }) {
  const chars = col.char_frequencies ?? []
  const maxCount = chars[0]?.count || 1
  const topSum = chars.reduce((s, c) => s + c.count, 0)

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 10 }}>Most occurring characters</div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', background: 'var(--surface-2)', borderBottom: '0.5px solid var(--border-1)' }}>
        <span style={{ flex: 1, fontSize: 10, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Character</span>
        <div style={{ width: 60, flexShrink: 0 }} />
        <span style={{ width: 40, textAlign: 'right', fontSize: 10, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>Count</span>
        <span style={{ width: 60, textAlign: 'right', fontSize: 10, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0, paddingLeft: 16 }}>Freq (%)</span>
      </div>
      {chars.slice(0, 20).map(({ char, count }) => {
        const pct = topSum > 0 ? (count / topSum) * 100 : 0
        const barPct = (count / maxCount) * 100
        return (
          <div key={char} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderBottom: '0.5px solid var(--border-1)' }}>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--ink)', fontFamily: 'monospace' }}>
              {char === ' ' ? <span style={{ color: 'var(--ink-3)', fontStyle: 'italic', fontSize: 12 }}>space</span> : char}
            </span>
            <div style={{ width: 60, height: 10, background: 'var(--surface-3)', borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
              <div style={{ height: '100%', width: `${barPct}%`, background: 'var(--wf-red)', borderRadius: 2 }} />
            </div>
            <span style={{ fontSize: 11, color: 'var(--ink-3)', width: 40, textAlign: 'right', flexShrink: 0 }}>{count.toLocaleString()}</span>
            <span style={{ fontSize: 11, color: 'var(--ink-3)', width: 60, textAlign: 'right', flexShrink: 0, paddingLeft: 16 }}>{pct.toFixed(1)}%</span>
          </div>
        )
      })}
      {chars.length > 20 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px', background: 'var(--surface-2)', fontStyle: 'italic' }}>
          <span style={{ flex: 1, fontSize: 12, color: 'var(--ink-3)' }}>Other values</span>
          <div style={{ width: 60, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: 'var(--ink-3)', width: 40, textAlign: 'right', flexShrink: 0 }}>{chars.slice(20).reduce((s, c) => s + c.count, 0).toLocaleString()}</span>
          <span style={{ width: 60, flexShrink: 0 }} />
        </div>
      )}
    </div>
  )
}

// ── FULL VARIABLES TAB ────────────────────────────────────
function VariablesTab({ profile, selectedCol, setSelectedCol }: {
  profile: ProfileContract
  selectedCol: ColumnProfile | null
  setSelectedCol: (c: ColumnProfile | null) => void
}) {
  const [innerTab, setInnerTab] = useState<string>('overview')
  const [extremeTab, setExtremeTab] = useState<'min' | 'max'>('min')
  const [dateChart, setDateChart] = useState<'timeline' | 'year' | 'month' | 'dow' | 'hour'>('timeline')
  const total = profile.row_count || 1
  const vt = selectedCol?.var_type

  const textCatInnerTabs =
    vt === 'Categorical'
      ? ['overview', 'categories', 'words', 'characters']
      : vt === 'Text'
      ? ['overview', 'words', 'characters']
      : []

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16, alignItems: 'start' }}>
      {/* ── Sidebar ── */}
      <Card title="Columns">
        <div>
          {profile.columns.map(col => {
            const { bg, text } = varTypeColor(col.var_type)
            const isSelected = selectedCol?.column_name === col.column_name
            return (
              <div
                key={col.column_name}
                onClick={() => { setSelectedCol(col); setInnerTab('overview'); setExtremeTab('min') }}
                style={{
                  padding: '10px 14px',
                  cursor: 'pointer',
                  background: isSelected ? 'var(--wf-red-light)' : 'transparent',
                  borderLeft: `3px solid ${isSelected ? 'var(--wf-red)' : 'transparent'}`,
                  borderBottom: '0.5px solid var(--border-1)',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: isSelected ? 500 : 400, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {col.column_name}
                  {(col.pii_classification === 'PII' || (!col.pii_classification && col.is_pii)) && <span style={{ fontSize: 9, background: 'var(--wf-red)', color: 'white', padding: '1px 4px', borderRadius: 3 }}>PII</span>}
                </div>
                <span style={{ display: 'inline-block', marginTop: 3, fontSize: 10, fontWeight: 500, padding: '1px 6px', borderRadius: 3, background: bg, color: text }}>
                  {col.var_type ?? col.data_type}
                </span>
              </div>
            )
          })}
        </div>
      </Card>

      {/* ── Detail panel ── */}
      {selectedCol && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Header */}
          <Card>
            <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: 'var(--surface-2)' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>{selectedCol.column_name}</span>
              {(() => { const { bg, text } = varTypeColor(selectedCol.var_type); return <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 10px', borderRadius: 20, background: bg, color: text }}>{selectedCol.var_type ?? selectedCol.data_type}</span> })()}
              {selectedCol.semantic_type && <Badge variant="info" label={selectedCol.semantic_type.replace(/_/g, ' ')} />}
              {(selectedCol.pii_classification === 'PII' || (!selectedCol.pii_classification && selectedCol.is_pii)) && <Badge variant="pii" label="PII" />}
              <Badge variant={selectedCol.sensitivity as any} label={selectedCol.sensitivity} />
            </div>
          </Card>

          {/* ══ NUMERIC ══════════════════════════════════════ */}
          {vt === 'Numeric' && (
            <>
              {/* Overview table */}
              <Card title="Overview">
                <OverviewTable col={selectedCol} total={total} />
              </Card>

              {/* Statistics table */}
              <Card title="Statistics">
                <StatisticsTable col={selectedCol} />
              </Card>

              {/* Histogram */}
              <Card title="Histogram">
                <div style={{ padding: '12px 16px 4px' }}>
                  <LargeHistogram col={selectedCol} />
                </div>
              </Card>

              {/* Common Values */}
              <Card title="Common Values">
                <CommonValuesTable col={selectedCol} total={total} />
              </Card>

              {/* Extreme Values */}
              <Card title="Extreme Values">
                <div style={{ padding: '12px 16px 4px', display: 'flex', gap: 6, marginBottom: 8 }}>
                  {(['min', 'max'] as const).map(t => (
                    <button key={t} onClick={() => setExtremeTab(t)} style={{ padding: '4px 14px', borderRadius: 'var(--radius-sm)', border: '0.5px solid var(--border-2)', background: extremeTab === t ? 'var(--wf-red)' : 'transparent', color: extremeTab === t ? 'white' : 'var(--ink-2)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                      {t === 'min' ? 'Minimum 10 values' : 'Maximum 10 values'}
                    </button>
                  ))}
                </div>
                {extremeTab === 'min'
                  ? <ExtremeValuesTable values={selectedCol.extreme_min ?? []} total={total} color="#1A7F4B" />
                  : <ExtremeValuesTable values={selectedCol.extreme_max ?? []} total={total} color="#D71E2B" />
                }
              </Card>
            </>
          )}

          {/* ══ TEXT ═════════════════════════════════════════ */}
          {vt === 'Text' && (
            <>
              {/* Summary row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Card title="Overview">
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      <MRow label="Distinct count" value={selectedCol.unique_count.toLocaleString()} />
                      <MRow label="Distinct (%)" value={`${selectedCol.unique_pct.toFixed(2)}%`} />
                      <MRow label="Missing count" value={selectedCol.missing_count.toLocaleString()} alert={selectedCol.missing_pct > 10} />
                      <MRow label="Missing (%)" value={`${selectedCol.missing_pct.toFixed(2)}%`} alert={selectedCol.missing_pct > 10} />
                      <MRow label="Memory size" value={selectedCol.memory_size != null ? (selectedCol.memory_size < 1048576 ? `${(selectedCol.memory_size / 1024).toFixed(1)} KB` : `${(selectedCol.memory_size / 1048576).toFixed(2)} MB`) : '—'} />
                    </tbody>
                  </table>
                </Card>
                <Card title="Word Cloud">
                  <WordCloud profileId={profile.profile_id} columnName={selectedCol.column_name} />
                </Card>
              </div>

              {/* Inner tabs */}
              <div style={{ display: 'flex', gap: 2, background: 'var(--surface)', border: '0.5px solid var(--border-1)', borderRadius: 'var(--radius-md)', padding: 3, width: 'fit-content' }}>
                {textCatInnerTabs.map(t => (
                  <button key={t} onClick={() => setInnerTab(t)} style={{ padding: '6px 16px', borderRadius: 'var(--radius-sm)', border: 'none', background: innerTab === t ? 'var(--wf-red)' : 'transparent', color: innerTab === t ? 'white' : 'var(--ink-2)', fontSize: 12, fontWeight: innerTab === t ? 500 : 400, cursor: 'pointer', fontFamily: 'var(--font-body)', textTransform: 'capitalize' }}>
                    {t}
                  </button>
                ))}
              </div>

              {innerTab === 'overview' && (
                <Card title="Overview">
                  <div style={{ padding: '16px' }}>
                    <TextCatOverview col={selectedCol} total={total} />
                  </div>
                </Card>
              )}
              {innerTab === 'words' && (
                <Card title="Words">
                  <div style={{ padding: '12px 0' }}>
                    <WordsTab col={selectedCol} total={total} profileId={profile.profile_id} columnName={selectedCol.column_name} />
                  </div>
                </Card>
              )}
              {innerTab === 'characters' && (
                <Card title="Characters">
                  <div style={{ padding: '12px' }}>
                    <CharactersTab col={selectedCol} />
                  </div>
                </Card>
              )}
            </>
          )}

          {/* ══ CATEGORICAL ══════════════════════════════════ */}
          {vt === 'Categorical' && (
            <>
              {/* Summary row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Card title="Overview">
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      <MRow label="Distinct count" value={selectedCol.unique_count.toLocaleString()} />
                      <MRow label="Distinct (%)" value={`${selectedCol.unique_pct.toFixed(2)}%`} />
                      <MRow label="Missing count" value={selectedCol.missing_count.toLocaleString()} alert={selectedCol.missing_pct > 10} />
                      <MRow label="Missing (%)" value={`${selectedCol.missing_pct.toFixed(2)}%`} alert={selectedCol.missing_pct > 10} />
                      <MRow label="Memory size" value={selectedCol.memory_size != null ? (selectedCol.memory_size < 1048576 ? `${(selectedCol.memory_size / 1024).toFixed(1)} KB` : `${(selectedCol.memory_size / 1048576).toFixed(2)} MB`) : '—'} />
                    </tbody>
                  </table>
                </Card>
                <Card title="Category Distribution">
                  <div style={{ padding: '16px' }}>
                    <CategoricalStackedBar col={selectedCol} total={total} />
                  </div>
                </Card>
              </div>

              {/* Inner tabs */}
              <div style={{ display: 'flex', gap: 2, background: 'var(--surface)', border: '0.5px solid var(--border-1)', borderRadius: 'var(--radius-md)', padding: 3, width: 'fit-content' }}>
                {textCatInnerTabs.map(t => (
                  <button key={t} onClick={() => setInnerTab(t)} style={{ padding: '6px 16px', borderRadius: 'var(--radius-sm)', border: 'none', background: innerTab === t ? 'var(--wf-red)' : 'transparent', color: innerTab === t ? 'white' : 'var(--ink-2)', fontSize: 12, fontWeight: innerTab === t ? 500 : 400, cursor: 'pointer', fontFamily: 'var(--font-body)', textTransform: 'capitalize' }}>
                    {t}
                  </button>
                ))}
              </div>

              {innerTab === 'overview' && (
                <Card title="Overview">
                  <div style={{ padding: '16px' }}>
                    <TextCatOverview col={selectedCol} total={total} />
                  </div>
                </Card>
              )}
              {innerTab === 'categories' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <Card title="Common Values">
                    <CommonValuesTable col={selectedCol} total={total} />
                  </Card>
                  <Card title="Length">
                    <div style={{ padding: '12px 16px' }}>
                      {selectedCol.length_histogram && <LengthHistogram data={selectedCol.length_histogram} />}
                    </div>
                  </Card>
                  <Card title="Common Values (Plot)">
                    <div style={{ padding: '16px' }}>
                      <CategoricalStackedBar col={selectedCol} total={total} />
                    </div>
                  </Card>
                </div>
              )}
              {innerTab === 'words' && (
                <Card title="Words">
                  <div style={{ padding: '12px 0' }}>
                    <WordsTab col={selectedCol} total={total} profileId={profile.profile_id} columnName={selectedCol.column_name} />
                  </div>
                </Card>
              )}
              {innerTab === 'characters' && (
                <Card title="Characters">
                  <div style={{ padding: '12px' }}>
                    <CharactersTab col={selectedCol} />
                  </div>
                </Card>
              )}
            </>
          )}

          {/* ══ DATETIME ═════════════════════════════════════ */}
          {/* ══ DATETIME ═════════════════════════════════════ */}
          {vt === 'DateTime' && (() => {
            const col = selectedCol
            const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'
            const chartBins: { key: typeof dateChart; label: string; disabled?: boolean }[] = [
              { key: 'timeline', label: 'Timeline'      },
              { key: 'year',     label: 'By Year'       },
              { key: 'month',    label: 'By Month'      },
              { key: 'dow',      label: 'By Day of Week'},
              { key: 'hour',     label: 'By Hour',      disabled: !col.has_time_component },
            ]
            const chartSrc = `${API_BASE}/api/profiles/${profile.profile_id}/datetime_chart/${encodeURIComponent(col.column_name)}?bin=${dateChart}`

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                {/* Stats grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Card title="Date Statistics">
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <tbody>
                        {[
                          ['Earliest date',   fmtDate(col.min_date)],
                          ['Latest date',     fmtDate(col.max_date)],
                          ['Time span',       col.time_span_str ?? '—'],
                          ['Missing count',   col.missing_count.toLocaleString()],
                          ['Missing (%)',     `${col.missing_pct.toFixed(2)}%`],
                          ['Distinct count',  col.unique_count.toLocaleString()],
                          ['Distinct (%)',    `${col.unique_pct.toFixed(2)}%`],
                          ['Has time part',   col.has_time_component ? 'Yes' : 'No'],
                        ].map(([l, v]) => (
                          <tr key={l as string} style={{ borderBottom: '0.5px solid var(--border-1)' }}>
                            <td style={{ padding: '9px 16px', fontSize: 12, color: 'var(--ink-3)', width: '55%' }}>{l}</td>
                            <td style={{ padding: '9px 16px', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{v}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Card>

                  <Card title="Weekday vs Weekend">
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <tbody>
                        {[
                          ['Weekday count', col.weekday_count?.toLocaleString() ?? '—'],
                          ['Weekday (%)',   col.weekday_pct != null ? `${col.weekday_pct.toFixed(1)}%` : '—'],
                          ['Weekend count', col.weekend_count?.toLocaleString() ?? '—'],
                          ['Weekend (%)',   col.weekend_pct != null ? `${col.weekend_pct.toFixed(1)}%` : '—'],
                        ].map(([l, v]) => (
                          <tr key={l as string} style={{ borderBottom: '0.5px solid var(--border-1)' }}>
                            <td style={{ padding: '9px 16px', fontSize: 12, color: 'var(--ink-3)', width: '55%' }}>{l}</td>
                            <td style={{ padding: '9px 16px', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{v}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {/* Weekday / weekend bar */}
                    {col.weekday_pct != null && (
                      <div style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', height: 20, borderRadius: 4, overflow: 'hidden', gap: 2 }}>
                          <div style={{ width: `${col.weekday_pct}%`, background: '#D71E2B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {col.weekday_pct > 12 && <span style={{ fontSize: 10, color: '#fff', fontWeight: 700 }}>{col.weekday_pct.toFixed(0)}%</span>}
                          </div>
                          <div style={{ flex: 1, background: '#FFCD41', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {(col.weekend_pct ?? 0) > 12 && <span style={{ fontSize: 10, color: '#7C4D00', fontWeight: 700 }}>{col.weekend_pct!.toFixed(0)}%</span>}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                          {[{ label: 'Weekday', color: '#D71E2B' }, { label: 'Weekend', color: '#FFCD41' }].map(l => (
                            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <div style={{ width: 10, height: 10, borderRadius: 2, background: l.color }} />
                              <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{l.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </Card>
                </div>

                {/* Chart section */}
                <Card title="Distribution Chart">
                  {/* Granularity selector */}
                  <div style={{ padding: '10px 16px', borderBottom: '0.5px solid var(--border-1)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {chartBins.map(b => (
                      <button
                        key={b.key}
                        onClick={() => !b.disabled && setDateChart(b.key)}
                        disabled={b.disabled}
                        style={{
                          padding: '5px 14px', borderRadius: 'var(--radius-sm)',
                          border: '0.5px solid var(--border-2)',
                          background: dateChart === b.key ? 'var(--wf-red)' : 'transparent',
                          color: b.disabled ? 'var(--ink-3)' : dateChart === b.key ? 'white' : 'var(--ink-2)',
                          fontSize: 12, cursor: b.disabled ? 'not-allowed' : 'pointer',
                          fontFamily: 'var(--font-body)', opacity: b.disabled ? 0.45 : 1,
                        }}
                      >
                        {b.label}
                        {b.disabled && <span style={{ fontSize: 10, marginLeft: 4 }}>(no time data)</span>}
                      </button>
                    ))}
                  </div>
                  <div style={{ padding: 8, background: '#fff' }}>
                    <img
                      key={chartSrc}
                      src={chartSrc}
                      alt={`DateTime chart — ${col.column_name}`}
                      style={{ maxWidth: 480, width: '100%', height: 'auto', display: 'block', borderRadius: 4, margin: '0 auto' }}
                    />
                  </div>
                </Card>

                {/* Most common years and months side by side */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {col.yearly_distribution && col.yearly_distribution.length > 0 && (
                    <Card title="Most Common Years">
                      {[...col.yearly_distribution].sort((a, b) => b.count - a.count).slice(0, 10).map(({ year, count }) => {
                        const pct = total > 0 ? (count / total) * 100 : 0
                        const maxC = Math.max(...col.yearly_distribution!.map(d => d.count))
                        return (
                          <div key={year} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderBottom: '0.5px solid var(--border-1)' }}>
                            <span style={{ width: 44, fontSize: 12, fontWeight: 600, color: 'var(--ink)', flexShrink: 0 }}>{year}</span>
                            <div style={{ flex: 1, height: 10, background: 'var(--surface-3)', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${(count / maxC) * 100}%`, background: '#D71E2B', borderRadius: 2 }} />
                            </div>
                            <span style={{ fontSize: 11, color: 'var(--ink-3)', width: 36, textAlign: 'right', flexShrink: 0 }}>{count.toLocaleString()}</span>
                            <span style={{ fontSize: 11, color: 'var(--ink-3)', width: 44, textAlign: 'right', flexShrink: 0, paddingLeft: 8 }}>{pct.toFixed(1)}%</span>
                          </div>
                        )
                      })}
                    </Card>
                  )}
                  {col.monthly_distribution && col.monthly_distribution.length > 0 && (
                    <Card title="Most Common Months">
                      {[...col.monthly_distribution].sort((a, b) => b.count - a.count).slice(0, 12).map(({ month_name, month_num, count }) => {
                        const pct = total > 0 ? (count / total) * 100 : 0
                        const maxC = Math.max(...col.monthly_distribution!.map(d => d.count))
                        return (
                          <div key={month_num} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderBottom: '0.5px solid var(--border-1)' }}>
                            <span style={{ width: 36, fontSize: 12, fontWeight: 600, color: 'var(--ink)', flexShrink: 0 }}>{month_name}</span>
                            <div style={{ flex: 1, height: 10, background: 'var(--surface-3)', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${(count / maxC) * 100}%`, background: '#FFCD41', borderRadius: 2 }} />
                            </div>
                            <span style={{ fontSize: 11, color: 'var(--ink-3)', width: 36, textAlign: 'right', flexShrink: 0 }}>{count.toLocaleString()}</span>
                            <span style={{ fontSize: 11, color: 'var(--ink-3)', width: 44, textAlign: 'right', flexShrink: 0, paddingLeft: 8 }}>{pct.toFixed(1)}%</span>
                          </div>
                        )
                      })}
                    </Card>
                  )}
                </div>

              </div>
            )
          })()}

          {/* ══ UNSUPPORTED ══════════════════════════════════ */}
          {vt === 'Unsupported' && (
            <>
              <div style={{
                padding: '14px 20px',
                background: 'rgba(220,38,38,0.06)',
                border: '0.5px solid rgba(220,38,38,0.25)',
                borderRadius: 'var(--radius-lg)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
              }}>
                <span style={{ fontSize: 18, lineHeight: 1, marginTop: 1 }}>⚠</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#DC2626', marginBottom: 3 }}>Unsupported — Mixed / Dirty Data</div>
                  <div style={{ fontSize: 12, color: '#7F1D1D', lineHeight: 1.6 }}>
                    This column contains a mix of data types (e.g. numeric values alongside text strings).
                    Statistical profiling is not available. Clean the column before analysis.
                  </div>
                </div>
              </div>
              <Card title="Overview">
                <OverviewTable col={selectedCol} total={total} />
              </Card>
            </>
          )}

          {/* ══ FALLBACK (unknown var_type) ══════════════════ */}
          {!vt && (
            <Card title="Overview">
              <OverviewTable col={selectedCol} total={total} />
            </Card>
          )}

        </div>
      )}
    </div>
  )
}

export default function StructuredProfile({ profile, activeTab }: Props) {
  const [selectedCol, setSelectedCol] = useState<ColumnProfile | null>(profile.columns[0] || null)
  const [scatterX, setScatterX] = useState<string>(profile.columns.find(c => c.mean != null)?.column_name || '')
  const [scatterY, setScatterY] = useState<string>(profile.columns.filter(c => c.mean != null)[1]?.column_name || '')
  const [hmTooltip, setHmTooltip]   = useState<{ col: string; metric: string; score: number; x: number; y: number } | null>(null)
  const [corrView, setCorrView]     = useState<'heatmap' | 'table'>('heatmap')
  const [missingView, setMissingView] = useState<'count' | 'matrix' | 'heatmap'>('count')

  const numericCols = profile.columns.filter(c => c.mean != null)

  // ── OVERVIEW ────────────────────────────────────────────
  if (activeTab === 'overview') {
    const totalRows    = profile.row_count    ?? 0
    const totalCols    = profile.column_count ?? profile.columns.length
    const dupRows      = profile.duplicate_row_count ?? 0
    const dupPct       = totalRows > 0 ? (dupRows / totalRows) * 100 : 0

    // Aggregate missing cells across all columns
    const missingCells    = profile.columns.reduce((s, c) => s + c.missing_count, 0)
    const totalCells      = totalRows * totalCols
    const missingCellsPct = totalCells > 0 ? (missingCells / totalCells) * 100 : 0

    // Total memory = sum of per-column memory_size (bytes)
    const totalMemBytes = profile.columns.reduce((s, c) => s + (c.memory_size ?? 0), 0)
    const avgRecordBytes = totalRows > 0 ? totalMemBytes / totalRows : 0

    const fmtBytes = (b: number) => {
      if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MiB`
      if (b >= 1024)        return `${(b / 1024).toFixed(1)} KiB`
      return `${b.toFixed(0)} B`
    }

    // Variable type counts
    const vtCounts: Record<string, number> = {}
    for (const col of profile.columns) {
      const vt = col.var_type ?? 'Unknown'
      vtCounts[vt] = (vtCounts[vt] ?? 0) + 1
    }
    const VT_ORDER = ['Numeric', 'Text', 'Categorical', 'DateTime', 'Unsupported', 'Unknown']

    const statRows = [
      { label: 'Number of variables',          value: totalCols.toLocaleString() },
      { label: 'Number of observations',       value: totalRows.toLocaleString() },
      { label: 'Missing cells',                value: missingCells.toLocaleString(),         alert: missingCells > 0 },
      { label: 'Missing cells (%)',            value: `${missingCellsPct.toFixed(1)}%`,      alert: missingCellsPct > 5 },
      { label: 'Duplicate rows',               value: dupRows.toLocaleString(),               alert: dupRows > 0 },
      { label: 'Duplicate rows (%)',           value: `${dupPct.toFixed(1)}%`,               alert: dupPct > 0 },
      { label: 'Total size in memory',         value: fmtBytes(totalMemBytes) },
      { label: 'Average record size in memory',value: fmtBytes(avgRecordBytes) },
    ]

    const tdL = { padding: '11px 20px', fontSize: 13, color: 'var(--ink-2)', borderBottom: '0.5px solid var(--border-1)', width: '60%' } as const
    const tdR = (alert?: boolean) => ({
      padding: '11px 20px', fontSize: 13, fontWeight: 600,
      color: alert ? 'var(--wf-red)' : 'var(--ink)',
      borderBottom: '0.5px solid var(--border-1)',
      textAlign: 'right',
    } as const)

    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>

        {/* Dataset Statistics */}
        <Card title="Dataset Statistics">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {statRows.map(({ label, value, alert }) => (
                <tr key={label} style={{ background: alert ? 'var(--wf-red-light)' : 'transparent' }}>
                  <td style={tdL}>{label}</td>
                  <td style={tdR(alert)}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {/* Variable Types */}
        <Card title="Variable Types">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {VT_ORDER.filter(vt => vtCounts[vt] > 0).map(vt => {
                const { bg, text } = varTypeColor(vt)
                return (
                  <tr key={vt} style={{ borderBottom: '0.5px solid var(--border-1)' }}>
                    <td style={{ padding: '11px 20px', width: '60%' }}>
                      <span style={{ display: 'inline-block', fontSize: 12, fontWeight: 600, padding: '2px 10px', borderRadius: 20, background: bg, color: text }}>
                        {vt}
                      </span>
                    </td>
                    <td style={{ padding: '11px 20px', fontSize: 15, fontWeight: 700, color: 'var(--ink)', textAlign: 'right' }}>
                      {vtCounts[vt]}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>

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
    return <VariablesTab profile={profile} selectedCol={selectedCol} setSelectedCol={setSelectedCol} />
  }

  // ── MISSING VALUES ───────────────────────────────────────
  if (activeTab === 'missing') {
    const totalRows = profile.row_count || 1
    const allCols   = profile.columns

    if (allCols.every(c => c.missing_pct === 0)) {
      return (
        <div style={{ background: '#EAF7F0', border: '0.5px solid rgba(26,127,75,0.2)', borderRadius: 'var(--radius-lg)', padding: '40px', textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>✓</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#1A7F4B' }}>No missing values detected</div>
          <div style={{ fontSize: 13, color: '#1A7F4B', marginTop: 4 }}>Dataset is 100% complete</div>
        </div>
      )
    }

    const viewBtns = (['count', 'matrix', 'heatmap'] as const)

    // Count view data — non-null counts + completion ratio 0-1
    const countData = allCols.map(c => ({
      name: c.column_name,
      nonNull: totalRows - c.missing_count,
      completion: totalRows > 0 ? (totalRows - c.missing_count) / totalRows : 1,
    }))

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* View toggle */}
        <div style={{ display: 'flex', gap: 4 }}>
          {viewBtns.map(v => (
            <button key={v} onClick={() => setMissingView(v)} style={{ padding: '7px 18px', borderRadius: 'var(--radius-md)', border: '0.5px solid var(--border-2)', background: missingView === v ? 'var(--wf-red)' : 'var(--surface)', color: missingView === v ? 'white' : 'var(--ink-2)', fontSize: 13, fontWeight: missingView === v ? 500 : 400, cursor: 'pointer', fontFamily: 'var(--font-body)', textTransform: 'capitalize' }}>
              {v}
            </button>
          ))}
        </div>

        {/* ── Count view ─────────────────────────── */}
        {missingView === 'count' && (
          <Card title="Non-Null Counts" subtitle="Completion scale 0.0 → 1.0 · count printed above each bar">
            <div style={{ padding: '16px 20px' }}>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={countData} margin={{ top: 28, right: 16, bottom: 60, left: 50 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#8A8A8A' }} axisLine={false} tickLine={false} angle={-35} textAnchor="end" interval={0} />
                  <YAxis domain={[0, 1]} tick={{ fontSize: 10, fill: '#8A8A8A' }} axisLine={false} tickLine={false} tickFormatter={v => v.toFixed(1)} label={{ value: 'Completion (0–1)', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#8A8A8A', offset: -10 }} />
                  <Tooltip formatter={(v: any, _: any, props: any) => [`${props.payload.nonNull.toLocaleString()} non-null (${(Number(v) * 100).toFixed(1)}%)`, 'Completion']} contentStyle={{ fontSize: 12, border: '0.5px solid var(--border-1)', borderRadius: 8 }} />
                  <Bar dataKey="completion" radius={[3, 3, 0, 0]} label={{ position: 'top', formatter: (v: any) => v != null ? (Number(v) * 100).toFixed(0) + '%' : '', fontSize: 9, fill: '#6B7280' }}>
                    {countData.map((d, i) => (
                      <Cell key={i} fill={d.completion < 0.8 ? '#DC2626' : d.completion < 0.95 ? '#CA8A04' : '#16A34A'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        {/* ── Matrix view ────────────────────────── */}
        {missingView === 'matrix' && (
          <Card title="Nullity Matrix" subtitle="Variables on X-axis · row indices on Y-axis · Black = present · White = missing">
            <div style={{ padding: '16px 20px', overflowX: 'auto' }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 36, paddingLeft: 40 }}>
                {allCols.map(col => (
                  <div key={col.column_name} style={{ width: 36, flexShrink: 0, textAlign: 'center' }}>
                    <div style={{ transform: 'rotate(-65deg)', transformOrigin: 'bottom center', whiteSpace: 'nowrap', fontSize: 9, color: col.missing_pct > 0 ? '#DC2626' : 'var(--ink-3)', fontWeight: col.missing_pct > 0 ? 600 : 400 }}>
                      {col.column_name.length > 12 ? col.column_name.slice(0, 12) + '…' : col.column_name}
                    </div>
                  </div>
                ))}
              </div>
              {/* 40 representative row strips */}
              {Array.from({ length: 40 }).map((_, rowIdx) => {
                const rowFrac = rowIdx / 40
                return (
                  <div key={rowIdx} style={{ display: 'flex', gap: 6, marginBottom: 1, alignItems: 'center' }}>
                    {rowIdx % 8 === 0 && <span style={{ fontSize: 8, color: 'var(--ink-3)', width: 36, textAlign: 'right', flexShrink: 0 }}>{Math.round(rowFrac * totalRows)}</span>}
                    {rowIdx % 8 !== 0 && <div style={{ width: 36, flexShrink: 0 }} />}
                    {allCols.map(col => {
                      const isMissing = col.missing_pct > 0 && rowFrac < col.missing_pct / 100
                      return (
                        <div key={col.column_name} title={`${col.column_name}: ${isMissing ? 'missing' : 'present'}`} style={{ width: 36, height: 6, background: isMissing ? '#F9FAFB' : '#111827', borderRadius: 1, flexShrink: 0, border: '0.5px solid rgba(0,0,0,0.04)' }} />
                      )
                    })}
                  </div>
                )
              })}
              <div style={{ display: 'flex', gap: 12, marginTop: 12, paddingLeft: 40 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><div style={{ width: 16, height: 8, background: '#111827', borderRadius: 2 }} /><span style={{ fontSize: 10, color: 'var(--ink-3)' }}>Present</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><div style={{ width: 16, height: 8, background: '#F9FAFB', border: '0.5px solid #D1D5DB', borderRadius: 2 }} /><span style={{ fontSize: 10, color: 'var(--ink-3)' }}>Missing</span></div>
              </div>
            </div>
          </Card>
        )}

        {/* ── Heatmap view ────────────────────────── */}
        {missingView === 'heatmap' && (
          <Card title="Missing Value Correlation Heatmap" subtitle="Pearson correlation of missingness indicators across all columns">
            <div style={{ padding: 8, background: '#fff' }}>
              <img
                src={`${API_BASE}/api/profiles/${profile.profile_id}/missing_heatmap`}
                alt="Missing value correlation heatmap"
                style={{ maxWidth: 520, width: '100%', height: 'auto', display: 'block', borderRadius: 4, margin: '0 auto' }}
              />
            </div>
          </Card>
        )}
      </div>
    )
  }

  // ── CORRELATIONS ─────────────────────────────────────────
  if (activeTab === 'correlations') {
    const corrCols = profile.columns.filter(c => c.var_type === 'Numeric')

    if (corrCols.length < 2) {
      return (
        <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border-1)', borderRadius: 'var(--radius-lg)', padding: '40px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>
          Need at least 2 Numeric columns for correlation analysis.
        </div>
      )
    }

    const corrMatrix = profile.correlation_matrix
    const getCorr = (a: string, b: string): number | null =>
      a === b ? 1.0 : (corrMatrix?.[a]?.[b] ?? corrMatrix?.[b]?.[a] ?? null)

    const corrBg = (v: number | null): { bg: string; text: string } => {
      if (v === null) return { bg: 'var(--surface-2)', text: 'var(--ink-3)' }
      if (v >= 0.7)  return { bg: '#16a34a', text: '#fff' }
      if (v >= 0.4)  return { bg: 'rgba(22,163,74,0.45)', text: '#14532d' }
      if (v >= 0.1)  return { bg: 'rgba(22,163,74,0.18)', text: '#15803d' }
      if (v > -0.1)  return { bg: 'var(--surface-2)', text: 'var(--ink-3)' }
      if (v > -0.4)  return { bg: 'rgba(220,38,38,0.18)', text: '#991b1b' }
      if (v > -0.7)  return { bg: 'rgba(220,38,38,0.45)', text: '#991b1b' }
      return               { bg: '#dc2626', text: '#fff' }
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Toggle */}
        <div style={{ display: 'flex', gap: 4 }}>
          {(['heatmap', 'table'] as const).map(v => (
            <button key={v} onClick={() => setCorrView(v)} style={{ padding: '7px 20px', borderRadius: 'var(--radius-md)', border: '0.5px solid var(--border-2)', background: corrView === v ? 'var(--wf-red)' : 'var(--surface)', color: corrView === v ? 'white' : 'var(--ink-2)', fontSize: 13, fontWeight: corrView === v ? 500 : 400, cursor: 'pointer', fontFamily: 'var(--font-body)', textTransform: 'capitalize' }}>
              {v}
            </button>
          ))}
        </div>

        {/* Heatmap view */}
        {corrView === 'heatmap' && (
          <Card title="Pearson Correlation Matrix" subtitle={`${corrCols.length} numeric variables · RdBu_r colour scale`}>
            <div style={{ padding: 8, background: '#fff' }}>
              <img
                src={`${API_BASE}/api/profiles/${profile.profile_id}/correlation_heatmap`}
                alt="Pearson correlation heatmap"
                style={{ maxWidth: 520, width: '100%', height: 'auto', display: 'block', borderRadius: 4, margin: '0 auto' }}
              />
            </div>
          </Card>
        )}

        {/* Table view */}
        {corrView === 'table' && (
          <Card title="Correlation Table" subtitle="Exact Pearson coefficients">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-2)' }}>
                    <th style={{ padding: '10px 14px', fontSize: 11, color: 'var(--ink-3)', textAlign: 'left', borderBottom: '0.5px solid var(--border-1)', fontWeight: 600 }}>Variable</th>
                    {corrCols.map(c => (
                      <th key={c.column_name} style={{ padding: '10px 10px', fontSize: 10, color: 'var(--ink-3)', textAlign: 'center', borderBottom: '0.5px solid var(--border-1)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {c.column_name.length > 12 ? c.column_name.slice(0, 12) + '…' : c.column_name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {corrCols.map((rowCol, i) => (
                    <tr key={rowCol.column_name} style={{ background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)', borderBottom: '0.5px solid var(--border-1)' }}>
                      <td style={{ padding: '9px 14px', fontSize: 12, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{rowCol.column_name}</td>
                      {corrCols.map(colCol => {
                        const v = getCorr(rowCol.column_name, colCol.column_name)
                        const isStrong = v !== null && Math.abs(v) >= 0.7 && rowCol.column_name !== colCol.column_name
                        return (
                          <td key={colCol.column_name} style={{ padding: '9px 10px', fontSize: 12, fontWeight: isStrong ? 700 : rowCol.column_name === colCol.column_name ? 700 : 400, color: v === null ? 'var(--ink-3)' : v >= 0.7 ? '#16a34a' : v <= -0.7 ? '#dc2626' : rowCol.column_name === colCol.column_name ? 'var(--ink-3)' : 'var(--ink)', textAlign: 'center', background: rowCol.column_name === colCol.column_name ? 'var(--surface-3)' : 'transparent' }}>
                            {v === null ? '—' : v.toFixed(4)}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    )
  }

  // ── INTERACTIONS ─────────────────────────────────────────
  if (activeTab === 'interactions') {
    const numOnly = profile.columns.filter(c => c.var_type === 'Numeric')

    if (numOnly.length < 2) {
      return (
        <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border-1)', borderRadius: 'var(--radius-lg)', padding: '40px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>
          Need at least 2 Numeric columns for interaction analysis.
        </div>
      )
    }

    const xName = numOnly.find(c => c.column_name === scatterX)?.column_name ?? numOnly[0].column_name
    const yName = numOnly.find(c => c.column_name === scatterY)?.column_name ?? numOnly[1].column_name
    const hexbinSrc = `${API_BASE}/api/profiles/${profile.profile_id}/hexbin/${encodeURIComponent(xName)}/${encodeURIComponent(yName)}`

    const AxisToggle = ({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (v: string) => void }) => (
      <div>
        <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {options.map(opt => (
            <button key={opt} onClick={() => onChange(opt)} style={{ padding: '5px 14px', borderRadius: 'var(--radius-sm)', border: '0.5px solid var(--border-2)', background: value === opt ? 'var(--wf-red)' : 'var(--surface)', color: value === opt ? 'white' : 'var(--ink-2)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: value === opt ? 500 : 400, transition: 'all 0.1s ease' }}>
              {opt}
            </button>
          ))}
        </div>
      </div>
    )

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card title="Variable Interactions" subtitle="Numeric columns only · hexbin density plot">
          <div style={{ padding: '16px 20px', display: 'flex', gap: 40, flexWrap: 'wrap' }}>
            <AxisToggle label="X Axis" options={numOnly.map(c => c.column_name)} value={xName} onChange={setScatterX} />
            <AxisToggle label="Y Axis" options={numOnly.map(c => c.column_name)} value={yName} onChange={setScatterY} />
          </div>
        </Card>

        <Card title={`${xName} × ${yName}`} subtitle="Hexbin density — darker blue = more observations">
          <div style={{ padding: 8, background: '#fff' }}>
            <img
              key={hexbinSrc}
              src={hexbinSrc}
              alt={`Hexbin: ${xName} × ${yName}`}
              style={{ maxWidth: 480, width: '100%', height: 'auto', display: 'block', borderRadius: 4, margin: '0 auto' }}
            />
          </div>
        </Card>
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
    const PILLARS = [
      { key: 'completeness_score', label: 'Completeness',
        description: '(Non-Null / Total Rows) × 100' },
      { key: 'uniqueness_score',   label: 'Uniqueness',
        description: '(Distinct / Non-Null) × 100' },
    ] as const

    const cellColor = (val: number) => {
      if (val >= 90) return { bg: '#16a34a', text: '#fff' }          // green — healthy
      if (val >= 80) return { bg: '#65a30d', text: '#fff' }          // lime green
      if (val >= 70) return { bg: '#ca8a04', text: '#fff' }          // amber — warning
      if (val >= 50) return { bg: '#ea580c', text: '#fff' }          // orange — concerning
      return               { bg: '#dc2626', text: '#fff' }            // red — critical
    }

    const getScore = (col: ColumnProfile, key: string): number =>
      Math.round((col as any)[key] ?? 0)

    const CELL_W = 130
    const CELL_H = 46
    const ROW_LABEL_W = 200

    return (
      <>
        {/* Fixed-position hover tooltip */}
        {hmTooltip && (
          <div style={{
            position: 'fixed',
            left: hmTooltip.x + 14,
            top: hmTooltip.y - 52,
            background: '#111827',
            color: '#fff',
            padding: '8px 12px',
            borderRadius: 8,
            fontSize: 12,
            zIndex: 9999,
            pointerEvents: 'none',
            boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
            whiteSpace: 'nowrap',
            lineHeight: 1.6,
          }}>
            <div style={{ fontSize: 10, color: '#9CA3AF', marginBottom: 2 }}>{hmTooltip.col}</div>
            <div>{hmTooltip.metric}: <strong style={{ color: hmTooltip.score >= 90 ? '#4ade80' : hmTooltip.score >= 70 ? '#fbbf24' : '#f87171' }}>{hmTooltip.score.toFixed(1)}%</strong></div>
          </div>
        )}

        <Card title="Data Quality Heatmap" subtitle="Per-column Completeness and Uniqueness scores">
          {/* Legend */}
          <div style={{ padding: '10px 20px', borderBottom: '0.5px solid var(--border-1)', display: 'flex', alignItems: 'center', gap: 16, background: 'var(--surface-2)', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 500 }}>Scale:</span>
            {[
              { label: '90–100 Healthy',  bg: '#16a34a' },
              { label: '80–89 Good',      bg: '#65a30d' },
              { label: '70–79 Warning',   bg: '#ca8a04' },
              { label: '50–69 Concerning',bg: '#ea580c' },
              { label: '0–49 Critical',   bg: '#dc2626' },
            ].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 12, height: 12, borderRadius: 3, background: l.bg }} />
                <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>{l.label}</span>
              </div>
            ))}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: ROW_LABEL_W + PILLARS.length * CELL_W + 90 }}>

              {/* Column headers */}
              <div style={{ display: 'flex', paddingLeft: ROW_LABEL_W, borderBottom: '0.5px solid var(--border-1)', background: 'var(--surface-2)' }}>
                {PILLARS.map(p => (
                  <div key={p.key} title={p.description} style={{ width: CELL_W, padding: '10px 8px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', textTransform: 'uppercase', letterSpacing: '0.05em', borderLeft: '0.5px solid var(--border-1)', cursor: 'help' }}>
                    {p.label}
                    <div style={{ fontSize: 9, fontWeight: 400, color: 'var(--ink-3)', marginTop: 2, textTransform: 'none', letterSpacing: 0 }}>{p.description}</div>
                  </div>
                ))}
                <div style={{ width: 90, padding: '10px 8px', textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', textTransform: 'uppercase', letterSpacing: '0.05em', borderLeft: '1px solid rgba(0,0,0,0.12)' }}>Avg</div>
              </div>

              {/* Data rows */}
              {profile.columns.map((col, i) => {
                const scores = PILLARS.map(p => getScore(col, p.key))
                const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
                const { bg: avgBg, text: avgText } = cellColor(avg)
                return (
                  <div key={col.column_name} style={{ display: 'flex', alignItems: 'stretch', borderBottom: '0.5px solid var(--border-1)', background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)' }}>
                    {/* Row label */}
                    <div style={{ width: ROW_LABEL_W, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, borderRight: '0.5px solid var(--border-1)', minHeight: CELL_H }}>
                      <div style={{ overflow: 'hidden' }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{col.column_name}</div>
                        {(() => { const { bg, text } = varTypeColor(col.var_type); return <span style={{ fontSize: 9, fontWeight: 600, padding: '0 5px', borderRadius: 3, background: bg, color: text }}>{col.var_type ?? col.data_type}</span> })()}
                      </div>
                      {(col.pii_classification === 'PII' || (!col.pii_classification && col.is_pii)) && <span style={{ fontSize: 9, background: 'var(--wf-red)', color: 'white', padding: '1px 4px', borderRadius: 3, flexShrink: 0 }}>PII</span>}
                    </div>

                    {/* Score cells */}
                    {scores.map((val, j) => {
                      const { bg, text } = cellColor(val)
                      return (
                        <div
                          key={j}
                          style={{ width: CELL_W, height: CELL_H, background: bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderLeft: '0.5px solid rgba(255,255,255,0.15)', cursor: 'default', transition: 'filter 0.1s ease' }}
                          onMouseEnter={e => setHmTooltip({ col: col.column_name, metric: PILLARS[j].label, score: val, x: e.clientX, y: e.clientY })}
                          onMouseMove={e => setHmTooltip(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)}
                          onMouseLeave={() => setHmTooltip(null)}
                        >
                          <span style={{ fontSize: 15, fontWeight: 700, color: text, lineHeight: 1 }}>{val}</span>
                          <span style={{ fontSize: 9, color: text, opacity: 0.8, marginTop: 1 }}>%</span>
                        </div>
                      )
                    })}

                    {/* Row average */}
                    <div style={{ width: 90, height: CELL_H, background: avgBg, display: 'flex', alignItems: 'center', justifyContent: 'center', borderLeft: '1px solid rgba(0,0,0,0.15)' }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: avgText }}>{avg}%</span>
                    </div>
                  </div>
                )
              })}

              {/* Column averages footer */}
              <div style={{ display: 'flex', borderTop: '1px solid rgba(0,0,0,0.12)', background: '#f9fafb' }}>
                <div style={{ width: ROW_LABEL_W, padding: '10px 16px', fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0, borderRight: '0.5px solid var(--border-1)' }}>
                  Dataset Average
                </div>
                {PILLARS.map(p => {
                  const avg = Math.round(profile.columns.reduce((sum, c) => sum + getScore(c, p.key), 0) / Math.max(profile.columns.length, 1))
                  const { bg, text } = cellColor(avg)
                  return (
                    <div key={p.key} style={{ width: CELL_W, padding: '10px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderLeft: '0.5px solid var(--border-1)' }}>
                      <div style={{ width: 42, height: 24, borderRadius: 5, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: text }}>{avg}%</div>
                    </div>
                  )
                })}
                {(() => {
                  const overallAvg = Math.round(PILLARS.reduce((sum, p) => sum + Math.round(profile.columns.reduce((s, c) => s + getScore(c, p.key), 0) / Math.max(profile.columns.length, 1)), 0) / PILLARS.length)
                  const { bg, text } = cellColor(overallAvg)
                  return (
                    <div style={{ width: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', borderLeft: '1px solid rgba(0,0,0,0.12)' }}>
                      <div style={{ width: 48, height: 24, borderRadius: 5, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: text }}>{overallAvg}%</div>
                    </div>
                  )
                })()}
              </div>

            </div>
          </div>
        </Card>
      </>
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
                {['Field Name', 'Data Type', 'Semantic Type', 'Business Definition', 'CDE', 'Info Class', 'PII Class', 'Sensitivity', 'Missing %', 'Sample Values'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '0.5px solid var(--border-1)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {profile.columns.map((col, i) => (
                <tr key={col.column_name} style={{ background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)', borderBottom: '0.5px solid var(--border-1)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap' }}>{col.column_name}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <code style={{ fontSize: 11, background: 'var(--surface-3)', padding: '2px 6px', borderRadius: 4, color: 'var(--ink-2)' }}>{col.data_type}</code>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--info)' }}>{col.semantic_type?.replace(/_/g, ' ') || '—'}</td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.6, maxWidth: 260 }}>
                    {col.business_definition || '—'}
                  </td>
                  {/* CDE */}
                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                    {col.is_cde
                      ? <span style={{ fontSize: 10, fontWeight: 700, background: '#D71E2B', color: 'white', padding: '2px 7px', borderRadius: 4 }}>CDE</span>
                      : <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>—</span>}
                  </td>
                  {/* Info Classification */}
                  <td style={{ padding: '10px 14px' }}>
                    {(() => {
                      const ic = col.info_classification
                      const colors: Record<string, string> = { Public: '#1A7F4B', Internal: '#1D4ED8', Confidential: '#B45309', Restricted: '#D71E2B' }
                      const bg: Record<string, string>     = { Public: '#EAF7F0', Internal: '#EFF6FF', Confidential: '#FFF7ED', Restricted: '#FEF2F2' }
                      return ic
                        ? <span style={{ fontSize: 10, fontWeight: 600, color: colors[ic] || '#4A4A4A', background: bg[ic] || '#F5F5F5', padding: '2px 7px', borderRadius: 4, border: `0.5px solid ${colors[ic] || '#ccc'}40` }}>{ic}</span>
                        : <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>—</span>
                    })()}
                  </td>
                  {/* PII Classification */}
                  <td style={{ padding: '10px 14px' }}>
                    {(() => {
                      const pc = col.pii_classification
                      const colors: Record<string, string> = { PII: '#D71E2B', Sensitive: '#B45309', 'Non-PII': '#4A4A4A' }
                      const bg: Record<string, string>     = { PII: '#FEF2F2', Sensitive: '#FFF7ED', 'Non-PII': '#F5F5F5' }
                      return pc && pc !== 'Non-PII'
                        ? <span style={{ fontSize: 10, fontWeight: 600, color: colors[pc], background: bg[pc], padding: '2px 7px', borderRadius: 4, border: `0.5px solid ${colors[pc]}40` }}>{pc}</span>
                        : <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Non-PII</span>
                    })()}
                  </td>
                  <td style={{ padding: '10px 14px' }}><Badge variant={col.sensitivity as any} label={col.sensitivity} /></td>
                  <td style={{ padding: '10px 14px', fontSize: 13, color: col.missing_pct > 10 ? 'var(--wf-red)' : 'var(--ink-2)' }}>{col.missing_pct.toFixed(1)}%</td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {col.top_values?.slice(0, 3).map(tv => (
                        <span key={tv.value} style={{ fontSize: 11, background: 'var(--surface-3)', padding: '1px 6px', borderRadius: 3, color: 'var(--ink-2)' }}>{String(tv.value)}</span>
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

  // ── DUPLICATE ROWS ───────────────────────────────────────
  if (activeTab === 'duplicates') {
    const groups = profile.duplicate_row_groups ?? []
    const cols   = profile.columns.map(c => c.column_name)

    if (groups.length === 0) {
      return (
        <div style={{ background: '#EAF7F0', border: '0.5px solid rgba(26,127,75,0.2)', borderRadius: 'var(--radius-lg)', padding: '40px', textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>✓</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#1A7F4B' }}>No duplicate rows detected</div>
          <div style={{ fontSize: 13, color: '#1A7F4B', marginTop: 4 }}>Every row in this dataset is unique</div>
        </div>
      )
    }

    return (
      <Card title="Most Frequently Occurring Duplicate Rows" subtitle={`${profile.duplicate_row_count?.toLocaleString() ?? 0} duplicate rows · ${groups.length} distinct groups`}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)' }}>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: 'var(--wf-red)', borderBottom: '0.5px solid var(--border-1)', whiteSpace: 'nowrap', minWidth: 100 }}>
                  # Duplicates
                </th>
                {cols.map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '0.5px solid var(--border-1)', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((row, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)', borderBottom: '0.5px solid var(--border-1)' }}>
                  <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, fontSize: 14, color: 'var(--wf-red)' }}>
                    {Number(row['__count__']).toLocaleString()}
                  </td>
                  {cols.map(col => (
                    <td key={col} style={{ padding: '9px 14px', fontSize: 12, color: row[col] == null || row[col] === 'None' ? 'var(--ink-3)' : 'var(--ink)', fontStyle: row[col] == null || row[col] === 'None' ? 'italic' : 'normal', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row[col] == null || row[col] === 'None' ? 'null' : String(row[col]).substring(0, 60)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    )
  }

  // ── AI INTELLIGENCE ──────────────────────────────────────
  if (activeTab === 'intelligence') {
    if (!profile.raw_llm_narrative) {
      return (
        <div style={{
          background: 'var(--surface)',
          border: '0.5px solid var(--border-1)',
          borderRadius: 'var(--radius-lg)',
          padding: '48px',
          textAlign: 'center',
          color: 'var(--ink-3)',
          fontSize: 14,
        }}>
          No AI intelligence available for this profile.
        </div>
      )
    }

    return (
      <div style={{
        background: 'var(--surface)',
        border: '0.5px solid var(--border-1)',
        borderRadius: 'var(--radius-xl)',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-md)',
        position: 'relative',
      }}>
        {/* Gold accent bar */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: 'linear-gradient(90deg, var(--wf-gold) 0%, var(--wf-gold-dark) 100%)',
        }} />

        {/* Header */}
        <div style={{
          padding: '20px 28px 18px',
          borderBottom: '0.5px solid var(--border-1)',
          background: 'var(--surface-2)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, var(--wf-gold) 0%, var(--wf-gold-dark) 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, flexShrink: 0,
          }}>✦</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--font-display)' }}>
              Cross-column Intelligence
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 1 }}>
              AI-generated · Llama 4 Scout · Based on full column profile
            </div>
          </div>
        </div>

        {/* Narrative body */}
        <div style={{ padding: '28px 32px' }}>
          {profile.raw_llm_narrative
            .split(/\n+/)
            .filter(line => line.trim())
            .map((line, i) => {
              const isBoldHeading = line.startsWith('**') && line.includes('**')
              const isHashHeading = line.startsWith('#')

              const clean = line
                .replace(/^#{1,3}\s*/, '')
                .replace(/^\*\*/, '')
                .replace(/\*\*$/, '')
                .replace(/\*\*/g, '')
                .trim()

              if (isHashHeading || isBoldHeading) {
                return (
                  <div key={i} style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--wf-red)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    marginTop: i === 0 ? 0 : 28,
                    marginBottom: 10,
                    paddingBottom: 6,
                    borderBottom: '1px solid var(--wf-gold-light)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}>
                    <span style={{ width: 3, height: 14, background: 'var(--wf-red)', borderRadius: 2, flexShrink: 0, display: 'inline-block' }} />
                    {clean}
                  </div>
                )
              }

              return (
                <p key={i} style={{
                  fontSize: 14,
                  color: 'var(--ink-2)',
                  lineHeight: 1.85,
                  margin: '0 0 8px 0',
                }}>
                  {clean.split(/(`[^`]+`)/g).map((part, j) =>
                    part.startsWith('`') && part.endsWith('`') ? (
                      <code key={j} style={{
                        fontSize: 12,
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
            })}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 28px',
          borderTop: '0.5px solid var(--border-1)',
          background: 'var(--surface-2)',
          fontSize: 11,
          color: 'var(--ink-3)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <span>⚠</span>
          <span>AI-generated analysis. Verify findings against source data before taking action.</span>
        </div>
      </div>
    )
  }

  return null
}