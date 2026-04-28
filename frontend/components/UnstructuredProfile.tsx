'use client'
import { useState } from 'react'
import { ProfileContract, ExtractedFact } from '@/lib/api'
import Badge from './Badge'

interface Props {
  profile: ProfileContract
  activeTab: string
}

function CBERow({ fact }: { fact: ExtractedFact }) {
  const [expanded, setExpanded] = useState(false)
  const found = fact.value != null

  return (
    <div style={{
      borderBottom: '0.5px solid var(--border-1)',
      padding: '14px 20px',
      background: !found ? 'var(--surface-2)' : 'var(--surface)',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 16,
      }}>
        {/* Field name */}
        <div style={{ width: 180, flexShrink: 0 }}>
          <div style={{
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--ink-2)',
            textTransform: 'capitalize',
          }}>
            {fact.field_name.replace(/_/g, ' ')}
          </div>
          {fact.business_definition && (
            <div style={{
              fontSize: 11,
              color: 'var(--ink-3)',
              marginTop: 2,
              lineHeight: 1.5,
            }}>
              {fact.business_definition}
            </div>
          )}
        </div>

        {/* Value */}
        <div style={{ flex: 1 }}>
          {found ? (
            <div style={{
              fontSize: 14,
              fontWeight: 500,
              color: 'var(--ink)',
            }}>
              {fact.value}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Badge variant="warning" label="Not Found" />
              {fact.not_found_reason && (
                <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                  {fact.not_found_reason}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Provenance */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {fact.provenance?.page && (
            <span style={{
              fontSize: 11,
              fontWeight: 500,
              padding: '3px 8px',
              borderRadius: 4,
              background: 'var(--wf-gold-light)',
              color: 'var(--wf-gold-dark)',
              border: '0.5px solid rgba(201,162,39,0.3)',
            }}>
              p.{fact.provenance.page}
            </span>
          )}
          {fact.provenance?.confidence_score != null && (
            <span style={{
              fontSize: 11,
              color: fact.provenance.confidence_score > 0.85
                ? '#1A7F4B'
                : 'var(--ink-3)',
            }}>
              {(fact.provenance.confidence_score * 100).toFixed(0)}%
            </span>
          )}
          {fact.raw_text && (
            <button
              onClick={() => setExpanded(!expanded)}
              style={{
                fontSize: 11,
                color: 'var(--wf-red)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: 0,
                fontFamily: 'var(--font-body)',
              }}
            >
              {expanded ? 'hide source' : 'view source'}
            </button>
          )}
        </div>
      </div>

      {/* Expanded source */}
      {expanded && fact.raw_text && (
        <div style={{
          marginTop: 10,
          padding: '10px 14px',
          background: 'var(--surface-3)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 12,
          color: 'var(--ink-2)',
          lineHeight: 1.6,
          fontStyle: 'italic',
          borderLeft: '3px solid var(--wf-gold)',
        }}>
          "{fact.raw_text.substring(0, 300)}{fact.raw_text.length > 300 ? '...' : ''}"
        </div>
      )}
    </div>
  )
}

export default function UnstructuredProfile({ profile, activeTab }: Props) {

  // ── OVERVIEW ────────────────────────────────────────────
  if (activeTab === 'overview') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Document metadata */}
        <div style={{
          background: 'var(--surface)',
          border: '0.5px solid var(--border-1)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{
            padding: '16px 20px',
            borderBottom: '0.5px solid var(--border-1)',
            background: 'var(--surface-2)',
          }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
              Document Fingerprint
            </span>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 0,
          }}>
            {[
              { label: 'Document Type', value: profile.document_type.replace(/_/g, ' ') },
              { label: 'Classification Confidence', value: `${((profile.document_type_confidence || 0) * 100).toFixed(0)}%` },
              { label: 'Language', value: profile.detected_language?.toUpperCase() || 'English' },
              { label: 'Total Pages', value: profile.page_count?.toString() || '—' },
              { label: 'Scanned Document', value: profile.is_scanned ? 'Yes (OCR)' : 'No (Native PDF)' },
              { label: 'Contains Tables', value: profile.has_tables ? 'Yes' : 'No' },
            ].map((item, i) => (
              <div key={item.label} style={{
                padding: '16px 20px',
                borderBottom: i < 3 ? '0.5px solid var(--border-1)' : 'none',
                borderRight: (i + 1) % 3 !== 0 ? '0.5px solid var(--border-1)' : 'none',
              }}>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 4 }}>
                  {item.label}
                </div>
                <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink)' }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sections detected */}
        {profile.sections_detected && profile.sections_detected.length > 0 && (
          <div style={{
            background: 'var(--surface)',
            border: '0.5px solid var(--border-1)',
            borderRadius: 'var(--radius-lg)',
            padding: '20px 24px',
            boxShadow: 'var(--shadow-sm)',
          }}>
            <div style={{
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--ink)',
              marginBottom: 14,
            }}>
              Sections Detected
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {profile.sections_detected.map((s, i) => (
                <span key={i} style={{
                  fontSize: 12,
                  background: 'var(--surface-2)',
                  border: '0.5px solid var(--border-1)',
                  padding: '4px 10px',
                  borderRadius: 4,
                  color: 'var(--ink-2)',
                }}>
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Parties */}
        {profile.parties && profile.parties.length > 0 && (
          <div style={{
            background: 'var(--surface)',
            border: '0.5px solid var(--border-1)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-sm)',
          }}>
            <div style={{
              padding: '16px 20px',
              borderBottom: '0.5px solid var(--border-1)',
              background: 'var(--surface-2)',
            }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                Parties Identified
              </span>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 0,
            }}>
              {profile.parties.map((party, i) => (
                <div key={i} style={{
                  padding: '14px 20px',
                  borderBottom: i < profile.parties!.length - 2
                    ? '0.5px solid var(--border-1)'
                    : 'none',
                  borderRight: (i + 1) % 2 !== 0
                    ? '0.5px solid var(--border-1)'
                    : 'none',
                }}>
                  <div style={{
                    fontSize: 11,
                    color: 'var(--wf-red)',
                    fontWeight: 500,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    marginBottom: 4,
                  }}>
                    {party.field_name}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}>
                    {party.value}
                  </div>
                  {party.business_definition && (
                    <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>
                      {party.business_definition}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    )
  }

  // ── BUSINESS ELEMENTS ────────────────────────────────────
  if (activeTab === 'elements') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* CBEs */}
        <div style={{
          background: 'var(--surface)',
          border: '0.5px solid var(--border-1)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{
            padding: '16px 20px',
            borderBottom: '0.5px solid var(--border-1)',
            background: 'var(--surface-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
              Critical Business Elements
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <Badge
                variant="success"
                label={`${profile.critical_business_elements?.filter(f => f.value).length || 0} found`}
              />
              {(profile.critical_business_elements?.filter(f => !f.value).length || 0) > 0 && (
                <Badge
                  variant="warning"
                  label={`${profile.critical_business_elements?.filter(f => !f.value).length} missing`}
                />
              )}
            </div>
          </div>
          {profile.critical_business_elements?.map((fact, i) => (
            <CBERow key={i} fact={fact} />
          ))}
        </div>

        {/* Additional findings */}
        {profile.additional_findings && profile.additional_findings.length > 0 && (
          <div style={{
            background: 'var(--surface)',
            border: '0.5px solid var(--border-1)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-sm)',
          }}>
            <div style={{
              padding: '16px 20px',
              borderBottom: '0.5px solid var(--border-1)',
              background: 'var(--wf-gold-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                Additional Findings
              </span>
              <span style={{
                fontSize: 11,
                color: 'var(--wf-gold-dark)',
                fontStyle: 'italic',
              }}>
                Discovered beyond standard schema
              </span>
            </div>
            {profile.additional_findings.map((fact, i) => (
              <CBERow key={i} fact={fact} />
            ))}
          </div>
        )}

        {/* Monetary amounts */}
        {profile.monetary_amounts && profile.monetary_amounts.length > 0 && (
          <div style={{
            background: 'var(--surface)',
            border: '0.5px solid var(--border-1)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-sm)',
          }}>
            <div style={{
              padding: '16px 20px',
              borderBottom: '0.5px solid var(--border-1)',
              background: 'var(--surface-2)',
            }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                Monetary Amounts
              </span>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 0,
            }}>
              {profile.monetary_amounts.map((amt, i) => (
                <div key={i} style={{
                  padding: '14px 20px',
                  borderBottom: i < profile.monetary_amounts!.length - 3
                    ? '0.5px solid var(--border-1)'
                    : 'none',
                  borderRight: (i + 1) % 3 !== 0
                    ? '0.5px solid var(--border-1)'
                    : 'none',
                }}>
                  <div style={{
                    fontSize: 11,
                    color: 'var(--ink-3)',
                    textTransform: 'capitalize',
                    marginBottom: 4,
                  }}>
                    {amt.field_name.replace(/_/g, ' ')}
                    {amt.provenance?.page && (
                      <span style={{
                        marginLeft: 6,
                        background: 'var(--wf-gold-light)',
                        color: 'var(--wf-gold-dark)',
                        padding: '1px 5px',
                        borderRadius: 3,
                        fontSize: 10,
                      }}>
                        p.{amt.provenance.page}
                      </span>
                    )}
                  </div>
                  <div style={{
                    fontSize: 16,
                    fontWeight: 600,
                    color: 'var(--ink)',
                    fontFamily: 'var(--font-display)',
                  }}>
                    {amt.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Key dates */}
        {profile.key_dates && profile.key_dates.length > 0 && (
          <div style={{
            background: 'var(--surface)',
            border: '0.5px solid var(--border-1)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-sm)',
          }}>
            <div style={{
              padding: '16px 20px',
              borderBottom: '0.5px solid var(--border-1)',
              background: 'var(--surface-2)',
            }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                Key Dates
              </span>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 0,
            }}>
              {profile.key_dates.map((d, i) => (
                <div key={i} style={{
                  padding: '14px 20px',
                  borderBottom: i < profile.key_dates!.length - 3
                    ? '0.5px solid var(--border-1)'
                    : 'none',
                  borderRight: (i + 1) % 3 !== 0
                    ? '0.5px solid var(--border-1)'
                    : 'none',
                }}>
                  <div style={{
                    fontSize: 11,
                    color: 'var(--ink-3)',
                    textTransform: 'capitalize',
                    marginBottom: 4,
                  }}>
                    {d.field_name.replace(/_/g, ' ')}
                    {d.provenance?.page && (
                      <span style={{
                        marginLeft: 6,
                        background: 'var(--wf-gold-light)',
                        color: 'var(--wf-gold-dark)',
                        padding: '1px 5px',
                        borderRadius: 3,
                        fontSize: 10,
                      }}>
                        p.{d.provenance.page}
                      </span>
                    )}
                  </div>
                  <div style={{
                    fontSize: 15,
                    fontWeight: 500,
                    color: 'var(--ink)',
                  }}>
                    {d.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
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
              padding: '20px 24px 16px',
              borderBottom: '0.5px solid var(--border-1)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                Executive Summary
              </span>
              <Badge variant="info" label="Default View" />
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                Generated by {profile.llm_used || 'LLM'}
              </span>
            </div>
            <div style={{
              padding: '24px',
              fontSize: 14,
              color: 'var(--ink-2)',
              lineHeight: 1.8,
              whiteSpace: 'pre-wrap',
            }}>
              {profile.summary.executive}
            </div>
          </div>
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
              padding: '16px 20px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              listStyle: 'none',
              borderBottom: '0.5px solid var(--border-1)',
              background: 'var(--surface-2)',
            }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                Detailed Deal Memo
              </span>
              <Badge variant="neutral" label="Click to expand" />
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                700-900 words
              </span>
            </summary>
            <div style={{
              padding: '24px',
              fontSize: 14,
              color: 'var(--ink-2)',
              lineHeight: 1.8,
              whiteSpace: 'pre-wrap',
            }}>
              {profile.summary.detailed}
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
              padding: '16px 20px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              listStyle: 'none',
              borderBottom: '0.5px solid var(--border-1)',
              background: 'var(--surface-2)',
            }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                CRO Risk Narrative
              </span>
              <Badge variant="warning" label="Free-form analysis" />
            </summary>
            <div style={{
              padding: '24px',
              fontSize: 14,
              color: 'var(--ink-2)',
              lineHeight: 1.8,
              fontStyle: 'italic',
            }}>
              {profile.raw_llm_narrative}
            </div>
          </details>
        )}

      </div>
    )
  }

  // ── OBLIGATIONS ──────────────────────────────────────────
  if (activeTab === 'obligations') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {profile.obligations && profile.obligations.length > 0 ? (
          <div style={{
            background: 'var(--surface)',
            border: '0.5px solid var(--border-1)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-sm)',
          }}>
            <div style={{
              padding: '16px 20px',
              borderBottom: '0.5px solid var(--border-1)',
              background: 'var(--surface-2)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                Covenants & Obligations
              </span>
              <Badge variant="neutral" label={`${profile.obligations.length} found`} />
            </div>
            {profile.obligations.map((ob, i) => (
              <div key={i} style={{
                padding: '16px 20px',
                borderBottom: i < profile.obligations!.length - 1
                  ? '0.5px solid var(--border-1)'
                  : 'none',
                background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)',
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  marginBottom: ob.trigger_language ? 8 : 0,
                }}>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 500,
                    background: ob.obligation_type === 'financial_covenant'
                      ? 'var(--wf-red-light)'
                      : 'var(--surface-3)',
                    color: ob.obligation_type === 'financial_covenant'
                      ? 'var(--wf-red)'
                      : 'var(--ink-2)',
                    padding: '2px 8px',
                    borderRadius: 4,
                    textTransform: 'capitalize',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}>
                    {ob.obligation_type.replace(/_/g, ' ')}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.6 }}>
                    {ob.description}
                  </span>
                </div>
                {ob.trigger_language && (
                  <div style={{
                    fontSize: 12,
                    color: 'var(--warning)',
                    background: '#FEF9EE',
                    padding: '4px 10px',
                    borderRadius: 4,
                    display: 'inline-block',
                    marginLeft: 80,
                  }}>
                    Trigger: "{ob.trigger_language}"
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div style={{
            background: 'var(--surface)',
            border: '0.5px solid var(--border-1)',
            borderRadius: 'var(--radius-lg)',
            padding: '40px',
            textAlign: 'center',
            color: 'var(--ink-3)',
            fontSize: 14,
          }}>
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
    ].filter(f => f.value && f.business_definition)

    return (
      <div style={{
        background: 'var(--surface)',
        border: '0.5px solid var(--border-1)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <div style={{
          padding: '16px 20px',
          borderBottom: '0.5px solid var(--border-1)',
          background: 'var(--surface-2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
            Business Data Dictionary
          </span>
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
            {allFacts.length} terms defined · Auto-generated by LLM
          </span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--surface-2)' }}>
              {['Term', 'Value', 'Definition', 'Source Page', 'Confidence'].map(h => (
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
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allFacts.map((fact, i) => (
              <tr key={i} style={{
                background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)',
                borderBottom: '0.5px solid var(--border-1)',
              }}>
                <td style={{
                  padding: '12px 16px',
                  fontWeight: 500,
                  fontSize: 13,
                  color: 'var(--ink)',
                  textTransform: 'capitalize',
                  whiteSpace: 'nowrap',
                }}>
                  {fact.field_name.replace(/_/g, ' ')}
                </td>
                <td style={{
                  padding: '12px 16px',
                  fontSize: 13,
                  color: 'var(--wf-red)',
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                }}>
                  {fact.value}
                </td>
                <td style={{
                  padding: '12px 16px',
                  fontSize: 12,
                  color: 'var(--ink-2)',
                  lineHeight: 1.6,
                  maxWidth: 400,
                }}>
                  {fact.business_definition}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  {fact.provenance?.page ? (
                    <span style={{
                      fontSize: 11,
                      fontWeight: 500,
                      padding: '3px 8px',
                      borderRadius: 4,
                      background: 'var(--wf-gold-light)',
                      color: 'var(--wf-gold-dark)',
                      border: '0.5px solid rgba(201,162,39,0.3)',
                    }}>
                      p.{fact.provenance.page}
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>—</span>
                  )}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  {fact.provenance?.confidence_score != null ? (
                    <Badge
                      variant={
                        fact.provenance.confidence_score > 0.85 ? 'high' :
                        fact.provenance.confidence_score > 0.6 ? 'medium' : 'low'
                      }
                      label={`${(fact.provenance.confidence_score * 100).toFixed(0)}%`}
                    />
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  // ── Q&A ──────────────────────────────────────────────────
  if (activeTab === 'qa') {
    return (
      <div style={{
        background: 'var(--surface)',
        border: '0.5px solid var(--border-1)',
        borderRadius: 'var(--radius-lg)',
        padding: '40px',
        boxShadow: 'var(--shadow-sm)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🤖</div>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: 22,
          fontWeight: 700,
          color: 'var(--ink)',
          marginBottom: 8,
        }}>
          Document Q&A
        </div>
        <p style={{
          fontSize: 14,
          color: 'var(--ink-3)',
          maxWidth: 440,
          margin: '0 auto 20px',
          lineHeight: 1.7,
        }}>
          Ask any question about this document. Answers are cited back to specific
          pages. If the answer is not in the document, Lens will say so — never hallucinate.
        </p>
        <Badge variant="info" label="Coming in next update" />
      </div>
    )
  }

  return null
}