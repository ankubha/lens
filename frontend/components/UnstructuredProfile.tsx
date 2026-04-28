'use client'
import { useState } from 'react'
import { ProfileContract, ExtractedFact } from '@/lib/api'
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
        // Also treat lines that are purely **text** (bold heading pattern from LLM)
        const isBoldHeading = /^\*\*[^*]+\*\*\s*$/.test(line.trim()) ||
                              /^\*\*[^*]+:?\s*$/.test(line.trim())

        const clean = line
          .replace(/^###\s*/, '')
          .replace(/^##\s*/, '')
          .replace(/^\*\*/,  '')
          .replace(/\*\*$/,  '')
          .replace(/\*\*/g,  '')
          .trim()

        if (isH2 || isH3 || isBoldHeading) {
          return (
            <div key={i} style={{
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--wf-red)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginTop: i === 0 ? 0 : 18,
              marginBottom: 6,
              paddingBottom: 4,
              borderBottom: '1px solid var(--wf-gold-light)',
            }}>
              {clean}
            </div>
          )
        }

        // Bullet points
        const isBullet = line.trim().startsWith('*') && !line.trim().startsWith('**')
        const bulletClean = isBullet ? line.trim().replace(/^\*\s*/, '') : clean

        return (
          <p key={i} style={{
            fontSize,
            color: 'var(--ink-2)',
            lineHeight: 1.8,
            margin: isBullet ? '0 0 4px 16px' : '0 0 6px 0',
            display: 'flex',
            gap: isBullet ? 8 : 0,
          }}>
            {isBullet && (
              <span style={{ color: 'var(--wf-red)', flexShrink: 0, marginTop: 2 }}>•</span>
            )}
            <span>
              {(isBullet ? bulletClean : clean).split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, j) => {
                if (part.startsWith('**') && part.endsWith('**')) {
                  return <strong key={j} style={{ fontWeight: 600, color: 'var(--ink)' }}>{part.slice(2,-2)}</strong>
                }
                if (part.startsWith('`') && part.endsWith('`')) {
                  return (
                    <code key={j} style={{
                      fontSize: fontSize - 1,
                      fontWeight: 600,
                      color: 'var(--wf-red)',
                      background: 'var(--wf-red-light)',
                      padding: '1px 5px',
                      borderRadius: 3,
                      fontFamily: 'monospace',
                    }}>
                      {part.slice(1,-1)}
                    </code>
                  )
                }
                return <span key={j}>{part}</span>
              })}
            </span>
          </p>
        )
      })}
    </div>
  )
}

// ── CBE Row ───────────────────────────────────────────────
function CBERow({ fact }: { fact: ExtractedFact }) {
  const [expanded, setExpanded] = useState(false)
  const found = fact.value != null

  return (
    <div style={{
      borderBottom: '0.5px solid var(--border-1)',
      padding: '14px 20px',
      background: !found ? 'var(--surface-2)' : 'var(--surface)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        {/* Field name + definition */}
        <div style={{ width: 200, flexShrink: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-2)', textTransform: 'capitalize' }}>
            {fact.field_name.replace(/_/g, ' ')}
          </div>
          {fact.business_definition && (
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 3, lineHeight: 1.5 }}>
              {fact.business_definition}
            </div>
          )}
        </div>

        {/* Value */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {found ? (
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', wordBreak: 'break-word' }}>
              {fact.value}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Badge variant="warning" label="Not Found" />
              {fact.not_found_reason && (
                <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{fact.not_found_reason}</span>
              )}
            </div>
          )}
        </div>

        {/* Provenance */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {fact.provenance?.page && (
            <span style={{
              fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 4,
              background: 'var(--wf-gold-light)', color: 'var(--wf-gold-dark)',
              border: '0.5px solid rgba(201,162,39,0.3)',
            }}>
              p.{fact.provenance.page}
            </span>
          )}
          {fact.provenance?.confidence_score != null && (
            <span style={{ fontSize: 11, color: fact.provenance.confidence_score > 0.85 ? '#1A7F4B' : 'var(--ink-3)' }}>
              {(fact.provenance.confidence_score * 100).toFixed(0)}%
            </span>
          )}
          {fact.raw_text && (
            <button onClick={() => setExpanded(!expanded)} style={{
              fontSize: 11, color: 'var(--wf-red)', background: 'none', border: 'none',
              cursor: 'pointer', textDecoration: 'underline', padding: 0, fontFamily: 'var(--font-body)',
            }}>
              {expanded ? 'hide source' : 'view source'}
            </button>
          )}
        </div>
      </div>

      {expanded && fact.raw_text && (
        <div style={{
          marginTop: 10, padding: '10px 14px', background: 'var(--surface-3)',
          borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--ink-2)',
          lineHeight: 1.6, fontStyle: 'italic', borderLeft: '3px solid var(--wf-gold)',
        }}>
          "{fact.raw_text.substring(0, 300)}{fact.raw_text.length > 300 ? '...' : ''}"
        </div>
      )}
    </div>
  )
}

export default function UnstructuredProfile({ profile, activeTab }: Props) {
  const [wantsPageSummary, setWantsPageSummary] = useState<boolean | null>(null)
  const [selectedPage, setSelectedPage] = useState<number>(1)
  const [pageSummaries, setPageSummaries] = useState<{page: number; summary: string; key_entities: string[]}[]>([])
  const [loadingPages, setLoadingPages] = useState(false)

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'

  const fetchPageSummaries = async () => {
    setLoadingPages(true)
    try {
      const res = await fetch(`${API_BASE}/api/profiles/${profile.profile_id}/page-summaries`)
      const data = await res.json()
      if (data.page_summaries) {
        setPageSummaries(data.page_summaries)
      }
    } catch (e) {
      console.error('Failed to fetch page summaries:', e)
    } finally {
      setLoadingPages(false)
    }
  }

  // Key CBEs to show in overview
  const keyFacts = ['loan_amount', 'borrower', 'lender', 'maturity_date',
                    'effective_date', 'interest_rate', 'governing_law', 'guarantor']
  const overviewCBEs = profile.critical_business_elements?.filter(f =>
    keyFacts.includes(f.field_name) && f.value
  ) || []

  // ── OVERVIEW ────────────────────────────────────────────
  if (activeTab === 'overview') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Key extracted values — loan amount prominent */}
        {overviewCBEs.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {overviewCBEs.slice(0, 8).map((fact, i) => {
              const isLoanAmount = fact.field_name === 'loan_amount'
              return (
                <div key={i} style={{
                  background: isLoanAmount ? 'var(--wf-red)' : 'var(--surface)',
                  border: `0.5px solid ${isLoanAmount ? 'var(--wf-red)' : 'var(--border-1)'}`,
                  borderRadius: 'var(--radius-lg)',
                  padding: '16px 20px',
                  boxShadow: isLoanAmount ? '0 4px 16px rgba(215,30,43,0.25)' : 'var(--shadow-sm)',
                  borderTop: isLoanAmount ? 'none' : `3px solid var(--wf-gold)`,
                  position: 'relative',
                  overflow: 'hidden',
                }}>
                  {isLoanAmount && (
                    <div style={{
                      position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                      background: 'var(--wf-gold)',
                    }}/>
                  )}
                  <div style={{
                    fontSize: 11,
                    color: isLoanAmount ? 'rgba(255,255,255,0.7)' : 'var(--ink-3)',
                    textTransform: 'capitalize',
                    marginBottom: 6,
                    letterSpacing: '0.03em',
                  }}>
                    {fact.field_name.replace(/_/g, ' ')}
                  </div>
                  <div style={{
                    fontSize: isLoanAmount ? 22 : 15,
                    fontWeight: 700,
                    color: isLoanAmount ? 'white' : 'var(--ink)',
                    fontFamily: 'var(--font-display)',
                    lineHeight: 1.2,
                    wordBreak: 'break-word',
                  }}>
                    {fact.value}
                  </div>
                  {fact.provenance?.page && (
                    <div style={{
                      fontSize: 10,
                      color: isLoanAmount ? 'rgba(255,205,65,0.9)' : 'var(--ink-3)',
                      marginTop: 4,
                    }}>
                      p.{fact.provenance.page}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Document fingerprint */}
        <Card title="Document Fingerprint">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0 }}>
            {[
              { label: 'Document Type', value: profile.document_type.replace(/_/g, ' ') },
              { label: 'Classification Confidence', value: `${((profile.document_type_confidence || 0) * 100).toFixed(0)}%` },
              { label: 'Language', value: profile.detected_language?.toUpperCase() || 'English' },
              { label: 'Total Pages', value: profile.page_count?.toString() || '—' },
              { label: 'Scanned Document', value: profile.is_scanned ? 'Yes (OCR applied)' : 'No (Native PDF)' },
              { label: 'Contains Tables', value: profile.has_tables ? 'Yes' : 'No' },
            ].map((item, i) => (
              <div key={item.label} style={{
                padding: '16px 20px',
                borderBottom: i < 3 ? '0.5px solid var(--border-1)' : 'none',
                borderRight: (i + 1) % 3 !== 0 ? '0.5px solid var(--border-1)' : 'none',
              }}>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink)' }}>{item.value}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* Sections detected */}
        {profile.sections_detected && profile.sections_detected.length > 0 && (
          <Card title="Sections Detected">
            <div style={{ padding: '16px 20px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {profile.sections_detected.map((s, i) => (
                <span key={i} style={{
                  fontSize: 12, background: 'var(--surface-2)', border: '0.5px solid var(--border-1)',
                  padding: '4px 10px', borderRadius: 4, color: 'var(--ink-2)',
                }}>
                  {s}
                </span>
              ))}
            </div>
          </Card>
        )}

        {/* Parties */}
        {profile.parties && profile.parties.length > 0 && (
          <Card title="Parties Identified">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 0 }}>
              {profile.parties.map((party, i) => (
                <div key={i} style={{
                  padding: '14px 20px',
                  borderBottom: i < profile.parties!.length - 2 ? '0.5px solid var(--border-1)' : 'none',
                  borderRight: (i + 1) % 2 !== 0 ? '0.5px solid var(--border-1)' : 'none',
                }}>
                  <div style={{ fontSize: 11, color: 'var(--wf-red)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                    {party.field_name}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}>{party.value}</div>
                  {party.business_definition && (
                    <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>{party.business_definition}</div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

      </div>
    )
  }

  // ── BUSINESS ELEMENTS ────────────────────────────────────
  if (activeTab === 'elements') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        <Card title="Critical Business Elements" subtitle={`${profile.critical_business_elements?.filter(f => f.value).length || 0} found · ${profile.critical_business_elements?.filter(f => !f.value).length || 0} missing`}>
          {profile.critical_business_elements?.map((fact, i) => (
            <CBERow key={i} fact={fact} />
          ))}
        </Card>

        {profile.additional_findings && profile.additional_findings.length > 0 && (
          <Card title="Additional Findings" subtitle="Discovered beyond standard schema" goldTop>
            {profile.additional_findings.map((fact, i) => (
              <CBERow key={i} fact={fact} />
            ))}
          </Card>
        )}

        {/* Monetary amounts */}
        {profile.monetary_amounts && profile.monetary_amounts.length > 0 && (
          <Card title="Monetary Amounts">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0 }}>
              {profile.monetary_amounts.map((amt, i) => (
                <div key={i} style={{
                  padding: '14px 20px',
                  borderBottom: i < profile.monetary_amounts!.length - 3 ? '0.5px solid var(--border-1)' : 'none',
                  borderRight: (i + 1) % 3 !== 0 ? '0.5px solid var(--border-1)' : 'none',
                }}>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', textTransform: 'capitalize', marginBottom: 4 }}>
                    {amt.field_name.replace(/_/g, ' ')}
                    {amt.provenance?.page && (
                      <span style={{ marginLeft: 6, background: 'var(--wf-gold-light)', color: 'var(--wf-gold-dark)', padding: '1px 5px', borderRadius: 3, fontSize: 10 }}>
                        p.{amt.provenance.page}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--font-display)' }}>
                    {amt.value}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Key dates */}
        {profile.key_dates && profile.key_dates.length > 0 && (
          <Card title="Key Dates">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0 }}>
              {profile.key_dates.map((d, i) => (
                <div key={i} style={{
                  padding: '14px 20px',
                  borderBottom: i < profile.key_dates!.length - 3 ? '0.5px solid var(--border-1)' : 'none',
                  borderRight: (i + 1) % 3 !== 0 ? '0.5px solid var(--border-1)' : 'none',
                }}>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', textTransform: 'capitalize', marginBottom: 4 }}>
                    {d.field_name.replace(/_/g, ' ')}
                    {d.provenance?.page && (
                      <span style={{ marginLeft: 6, background: 'var(--wf-gold-light)', color: 'var(--wf-gold-dark)', padding: '1px 5px', borderRadius: 3, fontSize: 10 }}>
                        p.{d.provenance.page}
                      </span>
                    )}
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

  // ── SUMMARY ──────────────────────────────────────────────
  if (activeTab === 'summary') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Executive summary */}
        {profile.summary?.executive && (
          <Card title="Executive Summary" subtitle={`Generated by ${profile.llm_used || 'LLM'}`} goldTop>
            <div style={{ padding: '24px' }}>
              <MarkdownText text={profile.summary.executive} fontSize={14} />
            </div>
          </Card>
        )}

        {/* Detailed summary */}
        {profile.summary?.detailed && (
          <details style={{
            background: 'var(--surface)',
            border: '0.5px solid var(--border-1)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-sm)',
          }}>
            <summary style={{
              padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center',
              gap: 10, listStyle: 'none', borderBottom: '0.5px solid var(--border-1)', background: 'var(--surface-2)',
            }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Detailed Deal Memo</span>
              <Badge variant="neutral" label="Click to expand" />
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>700-900 words</span>
            </summary>
            <div style={{ padding: '24px' }}>
              <MarkdownText text={profile.summary.detailed} fontSize={14} />
            </div>
          </details>
        )}

        {/* CRO narrative */}
        {profile.raw_llm_narrative && (
          <details style={{
            background: 'var(--surface)',
            border: '0.5px solid var(--border-1)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-sm)',
          }}>
            <summary style={{
              padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center',
              gap: 10, listStyle: 'none', borderBottom: '0.5px solid var(--border-1)', background: 'var(--surface-2)',
            }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>CRO Risk Narrative</span>
              <Badge variant="warning" label="Free-form analysis" />
            </summary>
            <div style={{ padding: '24px' }}>
              <MarkdownText text={profile.raw_llm_narrative} fontSize={14} />
            </div>
          </details>
        )}

        {/* Page-by-page summary */}
        <Card title="Page-by-Page Summary" subtitle="On demand · Lazy loaded">
          <div style={{ padding: '20px 24px' }}>
            {wantsPageSummary === null && (
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 14, color: 'var(--ink-2)', marginBottom: 16, lineHeight: 1.7 }}>
                  Generate a 2-3 sentence summary for each page of the document.
                  This makes {profile.page_count} LLM calls and takes about {Math.ceil((profile.page_count || 15) * 3 / 60)} minutes.
                </p>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                  <button
                    onClick={() => { setWantsPageSummary(true); fetchPageSummaries() }}
                    style={{
                      padding: '10px 24px', borderRadius: 'var(--radius-md)',
                      background: 'var(--wf-red)', color: 'white', border: 'none',
                      fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-body)',
                    }}
                  >
                    Yes, generate page summaries
                  </button>
                  <button
                    onClick={() => setWantsPageSummary(false)}
                    style={{
                      padding: '10px 24px', borderRadius: 'var(--radius-md)',
                      background: 'transparent', color: 'var(--ink-2)',
                      border: '0.5px solid var(--border-2)',
                      fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)',
                    }}
                  >
                    No thanks
                  </button>
                </div>
              </div>
            )}

            {wantsPageSummary === false && (
              <p style={{ fontSize: 13, color: 'var(--ink-3)', textAlign: 'center' }}>
                Page summaries skipped.
                <button
                  onClick={() => setWantsPageSummary(null)}
                  style={{ marginLeft: 8, color: 'var(--wf-red)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, textDecoration: 'underline' }}
                >
                  Change mind?
                </button>
              </p>
            )}

            {wantsPageSummary === true && loadingPages && (
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <div style={{
                  width: 36, height: 36,
                  border: '3px solid var(--surface-tertiary)',
                  borderTop: '3px solid var(--wf-red)',
                  borderRadius: '50%',
                  margin: '0 auto 12px',
                  animation: 'spin 1s linear infinite',
                }}/>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>Generating page summaries...</p>
              </div>
            )}

            {wantsPageSummary === true && !loadingPages && pageSummaries.length === 0 && (
              <div style={{ textAlign: 'center', padding: '16px' }}>
                <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>
                  Page summaries are generated server-side. This feature requires file storage (coming soon).
                </p>
                <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 8 }}>
                  For now, use the Executive Summary and Detailed Summary above.
                </p>
              </div>
            )}

            {wantsPageSummary === true && !loadingPages && pageSummaries.length > 0 && (
              <div>
                {/* Page selector */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
                  padding: '12px 16px', background: 'var(--surface-2)',
                  borderRadius: 'var(--radius-md)', border: '0.5px solid var(--border-1)',
                }}>
                  <span style={{ fontSize: 13, color: 'var(--ink-2)', fontWeight: 500 }}>Select page:</span>
                  <select
                    value={selectedPage}
                    onChange={e => setSelectedPage(Number(e.target.value))}
                    style={{
                      padding: '6px 12px', borderRadius: 'var(--radius-md)',
                      border: '0.5px solid var(--border-2)', fontSize: 13,
                      color: 'var(--ink)', background: 'var(--surface)',
                      fontFamily: 'var(--font-body)', cursor: 'pointer',
                    }}
                  >
                    {pageSummaries.map(ps => (
                      <option key={ps.page} value={ps.page}>Page {ps.page}</option>
                    ))}
                  </select>
                  <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                    of {profile.page_count} pages
                  </span>
                </div>

                {/* Selected page summary */}
                {pageSummaries.filter(ps => ps.page === selectedPage).map(ps => (
                  <div key={ps.page}>
                    <div style={{
                      fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.8,
                      marginBottom: 12,
                    }}>
                      {ps.summary}
                    </div>
                    {ps.key_entities.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {ps.key_entities.map((e, i) => (
                          <span key={i} style={{
                            fontSize: 11, background: 'var(--wf-gold-light)',
                            color: 'var(--wf-gold-dark)', padding: '2px 8px',
                            borderRadius: 4, border: '0.5px solid rgba(201,162,39,0.3)',
                          }}>
                            {e}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

      </div>
    )
  }

  // ── OBLIGATIONS ──────────────────────────────────────────
  if (activeTab === 'obligations') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {profile.obligations && profile.obligations.length > 0 ? (
          <Card title="Covenants & Obligations" subtitle={`${profile.obligations.length} found`}>
            {profile.obligations.map((ob, i) => (
              <div key={i} style={{
                padding: '16px 20px',
                borderBottom: i < profile.obligations!.length - 1 ? '0.5px solid var(--border-1)' : 'none',
                background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: ob.trigger_language ? 8 : 0 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 500, flexShrink: 0,
                    background: ob.obligation_type === 'financial_covenant' ? 'var(--wf-red-light)' : 'var(--surface-3)',
                    color: ob.obligation_type === 'financial_covenant' ? 'var(--wf-red)' : 'var(--ink-2)',
                    padding: '2px 8px', borderRadius: 4, textTransform: 'capitalize', whiteSpace: 'nowrap',
                  }}>
                    {ob.obligation_type.replace(/_/g, ' ')}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.6 }}>
                    {ob.description}
                  </span>
                </div>
                {ob.trigger_language && (
                  <div style={{
                    fontSize: 12, color: 'var(--warning)', background: '#FEF9EE',
                    padding: '4px 10px', borderRadius: 4, display: 'inline-block', marginLeft: 80,
                  }}>
                    Trigger: "{ob.trigger_language}"
                  </div>
                )}
              </div>
            ))}
          </Card>
        ) : (
          <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border-1)', borderRadius: 'var(--radius-lg)', padding: '40px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}>
            No obligations extracted for this document.
          </div>
        )}
      </div>
    )
  }

  // ── DATA DICTIONARY ──────────────────────────────────────
  if (activeTab === 'dictionary') {
    const allFacts = [
      ...(profile.critical_business_elements || []),
      ...(profile.additional_findings || []),
    ].filter(f => f.value)

    return (
      <Card title="Business Data Dictionary" subtitle={`${allFacts.length} terms · Auto-generated by LLM`}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)' }}>
                {['Term', 'Value', 'Business Definition', 'Source Page', 'Confidence', 'Sensitivity'].map(h => (
                  <th key={h} style={{
                    padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 500,
                    color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em',
                    borderBottom: '0.5px solid var(--border-1)', whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allFacts.map((fact, i) => (
                <tr key={i} style={{
                  background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)',
                  borderBottom: '0.5px solid var(--border-1)',
                }}>
                  <td style={{ padding: '12px 16px', fontWeight: 500, fontSize: 13, color: 'var(--ink)', textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
                    {fact.field_name.replace(/_/g, ' ')}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--wf-red)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                    {fact.value}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.6, minWidth: 200, maxWidth: 360 }}>
                    {fact.business_definition || '—'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {fact.provenance?.page ? (
                      <span style={{
                        fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 4,
                        background: 'var(--wf-gold-light)', color: 'var(--wf-gold-dark)',
                        border: '0.5px solid rgba(201,162,39,0.3)',
                      }}>
                        p.{fact.provenance.page}
                      </span>
                    ) : <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>—</span>}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {fact.provenance?.confidence_score != null ? (
                      <Badge
                        variant={fact.provenance.confidence_score > 0.85 ? 'high' : fact.provenance.confidence_score > 0.6 ? 'medium' : 'low'}
                        label={`${(fact.provenance.confidence_score * 100).toFixed(0)}%`}
                      />
                    ) : <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>—</span>}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <Badge variant={fact.sensitivity as any} label={fact.sensitivity || 'internal'} />
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