'use client'
import { use, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { getProfile, ProfileContract } from '@/lib/api'
import HealthGauge from '@/components/HealthGauge'
import Badge from '@/components/Badge'
import LensBot from '@/components/LensBot'

const StructuredProfile    = dynamic(() => import('@/components/StructuredProfile'),    { ssr: false })
const UnstructuredProfile  = dynamic(() => import('@/components/UnstructuredProfile'),  { ssr: false })
const SemiStructuredProfile = dynamic(() => import('@/components/SemiStructuredProfile'), { ssr: false })
const DQChecks             = dynamic(() => import('@/components/DQChecks'),             { ssr: false })

export default function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [profile, setProfile]   = useState<ProfileContract | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    getProfile(id)
      .then(data => { setProfile(data); setLoading(false) })
      .catch(e  => { setError(e.message); setLoading(false) })
  }, [id])

  // ── Loading ───────────────────────────────────────────
  if (loading) return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '60vh', flexDirection: 'column', gap: 16,
    }}>
      <div style={{
        width: 48, height: 48,
        border: '3px solid var(--surface-tertiary)',
        borderTop: '3px solid var(--wf-red)',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
      }}/>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Loading profile...</p>
    </div>
  )

  // ── Error ─────────────────────────────────────────────
  if (error) return (
    <div style={{
      maxWidth: 600, margin: '60px auto', padding: '24px',
      background: '#FEF2F2', border: '0.5px solid rgba(204,34,34,0.3)',
      borderRadius: 'var(--radius-lg)', color: '#CC2222', textAlign: 'center',
    }}>
      <p style={{ fontSize: 16, fontWeight: 500 }}>Failed to load profile</p>
      <p style={{ fontSize: 13, marginTop: 8 }}>{error}</p>
    </div>
  )

  if (!profile) return null

  const isStructured    = profile.modality === 'structured'
  const isUnstructured  = profile.modality === 'unstructured'
  const isSemiStructured = profile.modality === 'semi_structured'

  // ── Tabs per modality ────────────────────────────────
  const tabs = isStructured
    ? ['overview', 'sample', 'dictionary', 'variables', 'missing', 'correlations', 'interactions', 'duplicates', 'intelligence', 'dq_checks']
    : isSemiStructured
    ? ['overview', 'sample', 'schema', 'variables', 'missing', 'heatmap', 'dictionary']
    : ['overview', 'elements', 'summary', 'obligations', 'dictionary', 'regulatory']

  const tabLabels: Record<string, string> = {
    overview:     'Overview',
    sample:       'Sample',
    variables:    'Variables',
    missing:      'Missing Values',
    correlations: 'Correlations',
    interactions: 'Interactions',
    outliers:     'Outliers',
    heatmap:      'Quality Heatmap',
    dictionary:   'Data Dictionary',
    duplicates:   'Duplicate Rows',
    intelligence: 'AI Intelligence',
    dq_checks:    'DQ Checks',
    schema:       'Schema Analysis',
    elements:     'Business Elements',
    summary:      'Summary',
    obligations:  'Obligations',
    regulatory:   'Regulatory Validation',
  }

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px' }}>

      {/* ── Profile header ─────────────────────────────── */}
      <div style={{
        background: 'var(--surface)',
        border: '0.5px solid var(--border-1)',
        borderRadius: 'var(--radius-xl)',
        padding: '28px 32px',
        marginBottom: 24,
        boxShadow: 'var(--shadow-md)',
        position: 'relative', overflow: 'hidden',
      }}
      className="animate-fade-up"
      >
        {/* Gold top bar */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: 'linear-gradient(90deg, var(--wf-gold) 0%, var(--wf-gold-dark) 100%)',
        }}/>

        <div style={{
          display: 'flex', alignItems: 'flex-start',
          justifyContent: 'space-between', gap: 24, flexWrap: 'wrap',
        }}>

          {/* Left — file info */}
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <Badge
                variant={isStructured ? 'structured' : isUnstructured ? 'unstructured' : 'semi'}
                label={isStructured ? 'Structured' : isUnstructured ? 'Unstructured' : 'Semi-structured'}
                dot
              />
              <Badge variant="neutral" label={profile.document_type.replace(/_/g, ' ')} />
              {profile.sensitivity_classification && (
                <Badge variant={profile.sensitivity_classification as any} label={profile.sensitivity_classification} />
              )}
            </div>

            <h1 style={{
              fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700,
              color: 'var(--ink)', letterSpacing: '-0.01em', marginBottom: 6,
              wordBreak: 'break-all',
            }}>
              {profile.filename}
            </h1>

            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 12 }}>
              {[
                { label: 'Profiled',   value: new Date(profile.created_at).toLocaleString() },
                { label: 'File Size',  value: `${(profile.file_size_bytes / 1024).toFixed(1)} KB` },
                isStructured && profile.row_count    != null && { label: 'Rows',     value: profile.row_count.toLocaleString() },
                isStructured && profile.column_count != null && { label: 'Columns',  value: profile.column_count.toString() },
                isUnstructured && profile.page_count != null && { label: 'Pages',    value: profile.page_count.toString() },
                isUnstructured && { label: 'Language', value: profile.detected_language?.toUpperCase() || 'EN' },
                profile.llm_used && { label: 'Model', value: profile.llm_used },
              ].filter(Boolean).map((item: any) => (
                <div key={item.label}>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 2 }}>{item.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right — health gauge */}
          {profile.health_score != null && (
            <div style={{
              background: 'var(--surface-2)', border: '0.5px solid var(--border-1)',
              borderRadius: 'var(--radius-lg)', padding: '20px 24px', minWidth: 320,
            }}>
              <div style={{
                fontSize: 11, fontWeight: 500, color: 'var(--ink-3)',
                textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14,
              }}>
                Dataset Health Score
              </div>
              <HealthGauge
                score={profile.health_score}
                breakdown={profile.health_breakdown}
                size="lg"
              />
            </div>
          )}
        </div>

        {/* Stats row */}
        <div style={{
          display: 'flex', gap: 12, marginTop: 20, paddingTop: 20,
          borderTop: '0.5px solid var(--border-1)', flexWrap: 'wrap',
        }}>
          {isStructured && [
            { label: 'Total Rows',       value: profile.row_count?.toLocaleString() || '—',   sub: 'records' },
            { label: 'Total Columns',    value: profile.column_count?.toString() || '—',       sub: 'fields' },
            { label: 'Duplicate Rows',   value: profile.duplicate_row_count?.toString() || '0', sub: 'exact duplicates', alert: (profile.duplicate_row_count || 0) > 0 },
            { label: 'PII Columns',      value: profile.columns.filter(c => c.pii_classification === 'PII' || (!c.pii_classification && c.is_pii)).length.toString(), sub: 'flagged', alert: profile.columns.some(c => c.pii_classification === 'PII' || (!c.pii_classification && c.is_pii)) },
            { label: 'Missing Data',     value: profile.columns.filter(c => c.missing_pct > 0).length.toString(), sub: 'columns affected', alert: profile.columns.some(c => c.missing_pct > 10) },
          ].map((stat: any) => (
            <div key={stat.label} style={{
              background: stat.alert ? 'var(--wf-red-light)' : 'var(--surface-2)',
              border: `0.5px solid ${stat.alert ? 'rgba(215,30,43,0.2)' : 'var(--border-1)'}`,
              borderRadius: 'var(--radius-md)', padding: '12px 16px', flex: 1, minWidth: 120,
            }}>
              <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{stat.label}</div>
              <div style={{ fontSize: 24, fontWeight: 600, color: stat.alert ? 'var(--wf-red)' : 'var(--ink)', lineHeight: 1.2, fontFamily: 'var(--font-display)' }}>
                {stat.value}
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{stat.sub}</div>
            </div>
          ))}

          {isUnstructured && [
            { label: 'Pages',             value: profile.page_count?.toString() || '—',                            sub: 'total pages' },
            { label: 'Fields Extracted',  value: `${profile.found_fields_count || 0}/${profile.expected_fields_count || 0}`, sub: 'critical elements' },
            { label: 'Completeness',      value: `${profile.completeness_score?.toFixed(0) || 0}%`,                sub: 'schema coverage', alert: (profile.completeness_score || 0) < 70 },
            { label: 'Doc Type Confidence', value: profile.document_type_confidence ? `${(profile.document_type_confidence * 100).toFixed(0)}%` : '—', sub: 'confidence' },
            { label: 'Additional Findings', value: profile.additional_findings?.length.toString() || '0',          sub: 'extra facts' },
          ].map((stat: any) => (
            <div key={stat.label} style={{
              background: stat.alert ? 'var(--wf-red-light)' : 'var(--surface-2)',
              border: `0.5px solid ${stat.alert ? 'rgba(215,30,43,0.2)' : 'var(--border-1)'}`,
              borderRadius: 'var(--radius-md)', padding: '12px 16px', flex: 1, minWidth: 120,
            }}>
              <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{stat.label}</div>
              <div style={{ fontSize: 24, fontWeight: 600, color: stat.alert ? 'var(--wf-red)' : 'var(--ink)', lineHeight: 1.2, fontFamily: 'var(--font-display)' }}>
                {stat.value}
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{stat.sub}</div>
            </div>
          ))}

          {isSemiStructured && [
            { label: 'Records',           value: profile.row_count?.toLocaleString() || '—',  sub: 'flattened rows' },
            { label: 'Fields',            value: profile.column_count?.toString() || '—',      sub: 'detected paths' },
            { label: 'Duplicate Records', value: profile.duplicate_row_count?.toString() || '0', sub: 'exact matches', alert: (profile.duplicate_row_count || 0) > 0 },
            { label: 'Health Score',      value: `${profile.health_score?.toFixed(0) || 0}/100`, sub: 'overall quality' },
            { label: 'Schema Fields',     value: profile.critical_data_elements?.length.toString() || '0', sub: 'paths analysed' },
          ].map((stat: any) => (
            <div key={stat.label} style={{
              background: stat.alert ? 'var(--wf-red-light)' : 'var(--surface-2)',
              border: `0.5px solid ${stat.alert ? 'rgba(215,30,43,0.2)' : 'var(--border-1)'}`,
              borderRadius: 'var(--radius-md)', padding: '12px 16px', flex: 1, minWidth: 120,
            }}>
              <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{stat.label}</div>
              <div style={{ fontSize: 24, fontWeight: 600, color: stat.alert ? 'var(--wf-red)' : 'var(--ink)', lineHeight: 1.2, fontFamily: 'var(--font-display)' }}>
                {stat.value}
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{stat.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tabs ──────────────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 2, marginBottom: 20,
        background: 'var(--surface)', border: '0.5px solid var(--border-1)',
        borderRadius: 'var(--radius-lg)', padding: 4,
        boxShadow: 'var(--shadow-sm)', overflowX: 'auto',
      }}>
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1, padding: '9px 12px',
              borderRadius: 'var(--radius-md)', border: 'none',
              background: activeTab === tab ? 'var(--wf-red)' : 'transparent',
              color: activeTab === tab ? 'white' : 'var(--ink-2)',
              fontSize: 13, fontWeight: activeTab === tab ? 500 : 400,
              cursor: 'pointer', fontFamily: 'var(--font-body)',
              transition: 'all 0.15s ease', whiteSpace: 'nowrap',
            }}
          >
            {tabLabels[tab]}
          </button>
        ))}
      </div>

      {/* ── Tab content ───────────────────────────────────── */}
      <div className="animate-fade-in">
        {isStructured && activeTab === 'dq_checks' && (
          <DQChecks profileId={profile.profile_id} />
        )}
        {isStructured && activeTab !== 'dq_checks' && (
          <StructuredProfile profile={profile} activeTab={activeTab} />
        )}
        {isSemiStructured && (
          <SemiStructuredProfile profile={profile} activeTab={activeTab} />
        )}
        {isUnstructured && (
          <UnstructuredProfile profile={profile} activeTab={activeTab} />
        )}
      </div>

      <LensBot profile={profile} />
    </div>
  )
}