'use client'
import { ProfileContract } from '@/lib/api'
import Badge from './Badge'
import StructuredProfile from './StructuredProfile'

interface Props {
  profile: ProfileContract
  activeTab: string
}

export default function SemiStructuredProfile({ profile, activeTab }: Props) {

  // ── OVERVIEW ────────────────────────────────────────────
  if (activeTab === 'overview') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Stats bar */}
        <div style={{
          background: 'var(--surface)',
          border: '0.5px solid var(--border-1)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-sm)',
          position: 'relative',
        }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 3,
            background: 'linear-gradient(90deg, var(--wf-gold) 0%, var(--wf-gold-dark) 100%)',
          }}/>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 0,
            paddingTop: 3,
          }}>
            {[
              { label: 'Format',           value: profile.document_type.toUpperCase() },
              { label: 'Total Records',    value: profile.row_count?.toLocaleString() || '—' },
              { label: 'Fields Detected',  value: profile.column_count?.toString() || '—' },
              { label: 'Duplicate Records',value: profile.duplicate_row_count?.toString() || '0',
                alert: (profile.duplicate_row_count || 0) > 0 },
              { label: 'Health Score',     value: `${profile.health_score?.toFixed(0) ?? '—'}/100` },
            ].map((item: any, i) => (
              <div key={item.label} style={{
                padding: '20px 24px',
                borderRight: i < 4 ? '0.5px solid var(--border-1)' : 'none',
                background: item.alert ? 'var(--wf-red-light)' : 'transparent',
              }}>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 4 }}>{item.label}</div>
                <div style={{
                  fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-display)',
                  color: item.alert ? 'var(--wf-red)' : 'var(--ink)',
                }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Cross-column intelligence */}
        {profile.raw_llm_narrative && (
          <div style={{
            background: 'var(--surface)',
            border: '0.5px solid var(--border-1)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-sm)',
          }}>
            <div style={{
              padding: '14px 20px',
              borderBottom: '0.5px solid var(--border-1)',
              background: 'var(--surface-2)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Cross-Column Intelligence</span>
              <Badge variant="info" label="AI Generated" />
            </div>
            <div style={{
              padding: '20px 24px',
              fontSize: 14,
              color: 'var(--ink-2)',
              lineHeight: 1.8,
              whiteSpace: 'pre-wrap' as const,
            }}>
              {profile.raw_llm_narrative}
            </div>
          </div>
        )}

      </div>
    )
  }

  // ── SCHEMA ANALYSIS ──────────────────────────────────────
  if (activeTab === 'schema') {
    const facts = profile.critical_data_elements || []

    return (
      <div style={{
        background: 'var(--surface)',
        border: '0.5px solid var(--border-1)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <div style={{
          padding: '14px 20px',
          borderBottom: '0.5px solid var(--border-1)',
          background: 'var(--surface-2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Schema Analysis</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <Badge variant="success" label={`${facts.filter(f => f.provenance?.confidence_score && f.provenance.confidence_score === 1).length} required`} />
            <Badge variant="warning" label={`${facts.filter(f => f.provenance?.confidence_score && f.provenance.confidence_score < 1).length} optional`} />
          </div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--surface-2)' }}>
              {['Field Path', 'Coverage', 'Status', 'Business Definition', 'Sample Values'].map(h => (
                <th key={h} style={{
                  padding: '10px 16px',
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
            {facts.map((fact, i) => {
              const coverage = fact.provenance?.confidence_score
                ? fact.provenance.confidence_score * 100
                : 0
              const isRequired = coverage === 100
              const colData = profile.columns.find(c => c.column_name === fact.field_name)

              return (
                <tr key={i} style={{
                  background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)',
                  borderBottom: '0.5px solid var(--border-1)',
                }}>
                  <td style={{ padding: '10px 16px' }}>
                    <code style={{
                      fontSize: 12,
                      background: 'var(--surface-3)',
                      padding: '2px 8px',
                      borderRadius: 4,
                      color: 'var(--wf-red)',
                      fontWeight: 500,
                    }}>
                      {fact.field_name}
                    </code>
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 80,
                        height: 6,
                        background: 'var(--surface-3)',
                        borderRadius: 3,
                        overflow: 'hidden',
                      }}>
                        <div style={{
                          height: '100%',
                          width: `${coverage}%`,
                          background: coverage === 100 ? '#1A7F4B' :
                                      coverage > 50  ? '#FFCD41' : '#CC2222',
                          borderRadius: 3,
                        }}/>
                      </div>
                      <span style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: coverage === 100 ? '#1A7F4B' :
                               coverage > 50  ? '#B45309' : '#CC2222',
                      }}>
                        {coverage.toFixed(0)}%
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    <Badge
                      variant={isRequired ? 'success' : 'warning'}
                      label={isRequired ? 'Required' : 'Optional'}
                    />
                  </td>
                  <td style={{
                    padding: '10px 16px',
                    fontSize: 12,
                    color: 'var(--ink-2)',
                    lineHeight: 1.6,
                    maxWidth: 280,
                  }}>
                    {fact.business_definition || colData?.business_definition || '—'}
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {colData?.top_values?.slice(0, 2).map((tv, j) => (
                        <span key={j} style={{
                          fontSize: 11,
                          background: 'var(--surface-3)',
                          padding: '1px 6px',
                          borderRadius: 3,
                          color: 'var(--ink-2)',
                        }}>
                          {tv.value}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  // ── All other tabs reuse StructuredProfile ──────────────
  // Semi-structured flattens to tabular — same profiling applies
  return (
    <StructuredProfile
      profile={profile}
      activeTab={activeTab}
    />
  )
}