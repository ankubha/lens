'use client'
import { useState, useRef, useEffect } from 'react'
import { ProfileContract } from '@/lib/api'

interface Message {
  role: 'user' | 'bot'
  text: string
  loading?: boolean
}

interface Props {
  profile?: ProfileContract | null
}

export default function LensBot({ profile }: Props) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'bot',
      text: profile
        ? `Hi! I'm LensBot. I can answer questions about **${profile.filename}**. What would you like to know?`
        : `Hi! I'm LensBot. Upload a file and I'll help you understand your data.`,
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Reset greeting when profile changes
  useEffect(() => {
    if (profile) {
      setMessages([{
        role: 'bot',
        text: `Hi! I'm LensBot. I can answer questions about **${profile.filename}**. Try asking: "What is the health score?" or "Which columns have missing data?"`,
      }])
    }
  }, [profile?.profile_id])

  const buildContext = () => {
    if (!profile) return 'No document loaded yet.'

    if (profile.modality === 'structured') {
      const colSummary = profile.columns.map(c =>
        `${c.column_name} (${c.data_type}, ${c.missing_pct}% missing, semantic: ${c.semantic_type || 'unknown'}${c.is_pii ? ', PII' : ''})`
      ).join('\n')

      return `
DOCUMENT: ${profile.filename}
MODALITY: Structured dataset (CSV/XLSX)
ROWS: ${profile.row_count}
COLUMNS: ${profile.column_count}
DUPLICATES: ${profile.duplicate_row_count}
HEALTH SCORE: ${profile.health_score}/100
HEALTH BREAKDOWN: ${JSON.stringify(profile.health_breakdown)}

COLUMNS:
${colSummary}

DRIFT ALERTS: ${profile.drift_alerts?.length || 0} detected
${profile.drift_alerts?.map(d => `- ${d.column_name}: ${d.metric} changed from ${d.prior_value} to ${d.current_value}`).join('\n') || ''}
      `.trim()
    }

    if (profile.modality === 'unstructured') {
      const cbes = profile.critical_business_elements
        ?.map(f => `${f.field_name}: ${f.value || 'NOT FOUND'}`)
        .join('\n') || ''

      const findings = profile.additional_findings
        ?.map(f => `${f.field_name}: ${f.value}`)
        .join('\n') || ''

      return `
DOCUMENT: ${profile.filename}
MODALITY: Unstructured PDF
DOCUMENT TYPE: ${profile.document_type}
PAGES: ${profile.page_count}
HEALTH SCORE: ${profile.health_score}/100
COMPLETENESS: ${profile.completeness_score}%

CRITICAL BUSINESS ELEMENTS:
${cbes}

ADDITIONAL FINDINGS:
${findings}

EXECUTIVE SUMMARY:
${profile.summary?.executive?.substring(0, 1000) || 'Not available'}

OBLIGATIONS: ${profile.obligations?.length || 0} found
PARTIES: ${profile.parties?.map(p => `${p.field_name}: ${p.value}`).join(', ') || 'None'}
      `.trim()
    }

    return `Document: ${profile.filename}, Modality: ${profile.modality}`
  }

  const sendMessage = async () => {
    if (!input.trim() || loading) return
    const question = input.trim()
    setInput('')

    setMessages(prev => [...prev, { role: 'user', text: question }])
    setLoading(true)
    setMessages(prev => [...prev, { role: 'bot', text: '', loading: true }])

    try {
      const context = buildContext()

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'meta-llama/llama-4-scout-17b-16e-instruct',
          messages: [
            {
              role: 'system',
              content: `You are LensBot, an intelligent data assistant for Wells Fargo CDO.
You answer questions about documents and datasets that have been profiled by the Lens platform.

CRITICAL RULES:
1. Only answer based on the provided profile data below
2. If the answer is not in the profile data, say exactly: "This information is not available in the current profile."
3. Never hallucinate or invent data
4. Be concise and professional
5. Use banking/financial language appropriate for a CDO audience
6. When citing values, mention the source (page number, column name, etc.)

PROFILE DATA:
${context}`,
            },
            {
              role: 'user',
              content: question,
            }
          ],
          temperature: 0.1,
          max_tokens: 1024,
        }),
      })

      const data = await response.json()
      const answer = data.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.'

      setMessages(prev => [
        ...prev.filter(m => !m.loading),
        { role: 'bot', text: answer },
      ])
    } catch (e) {
      setMessages(prev => [
        ...prev.filter(m => !m.loading),
        { role: 'bot', text: 'Sorry, I encountered an error. Please try again.' },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          position: 'fixed',
          bottom: 28,
          right: 28,
          width: 60,
          height: 60,
          borderRadius: '50%',
          background: open ? 'var(--wf-red-dark)' : 'var(--wf-red)',
          border: '3px solid var(--wf-gold)',
          boxShadow: '0 4px 20px rgba(215,30,43,0.4)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          transition: 'all 0.2s ease',
          transform: open ? 'rotate(45deg)' : 'rotate(0deg)',
        }}
        title="Ask LensBot"
      >
        {open ? (
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path d="M4 4l14 14M18 4L4 18" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
        ) : (
          <span style={{ fontSize: 26, lineHeight: 1 }}>🤖</span>
        )}
      </button>

      {/* LensBot label */}
      {!open && (
        <div style={{
          position: 'fixed',
          bottom: 96,
          right: 28,
          background: 'var(--ink)',
          color: 'white',
          fontSize: 11,
          fontWeight: 500,
          padding: '4px 10px',
          borderRadius: 20,
          zIndex: 1000,
          pointerEvents: 'none',
          letterSpacing: '0.02em',
        }}>
          LensBot
        </div>
      )}

      {/* Chat panel */}
      {open && (
        <div style={{
          position: 'fixed',
          bottom: 100,
          right: 28,
          width: 380,
          height: 520,
          background: 'var(--surface)',
          border: '0.5px solid var(--border-1)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.16)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          zIndex: 999,
          animation: 'slideUp 0.25s ease',
        }}>
          <style>{`
            @keyframes slideUp {
              from { opacity: 0; transform: translateY(16px); }
              to   { opacity: 1; transform: translateY(0); }
            }
            .msg-dot { animation: blink 1.2s ease-in-out infinite; }
            .msg-dot:nth-child(2) { animation-delay: 0.2s; }
            .msg-dot:nth-child(3) { animation-delay: 0.4s; }
            @keyframes blink {
              0%, 100% { opacity: 0.3; }
              50%       { opacity: 1; }
            }
          `}</style>

          {/* Header */}
          <div style={{
            background: 'var(--wf-red)',
            borderBottom: '2px solid var(--wf-gold)',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}>
            <div style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.15)',
              border: '1.5px solid rgba(255,205,65,0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M12 2C6.48 2 2 6.02 2 11c0 2.53 1.06 4.83 2.78 6.5L4 22l4.72-1.56C9.74 20.79 10.85 21 12 21c5.52 0 10-4.02 10-9S17.52 2 12 2z" fill="white"/>
              </svg>
            </div>
            <div>
              <div style={{
                fontSize: 14,
                fontWeight: 600,
                color: 'white',
                fontFamily: 'var(--font-display)',
              }}>
                LensBot
              </div>
              <div style={{
                fontSize: 10,
                color: 'rgba(255,255,255,0.7)',
                letterSpacing: '0.04em',
              }}>
                Wells Fargo CDO Intelligence
              </div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#4ade80',
                boxShadow: '0 0 0 2px rgba(74,222,128,0.3)',
              }}/>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>Online</span>
            </div>
          </div>

          {/* Messages */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            background: 'var(--surface-2)',
          }}>
            {messages.map((msg, i) => (
              <div key={i} style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}>
                <div style={{
                  maxWidth: '80%',
                  padding: '10px 14px',
                  borderRadius: msg.role === 'user'
                    ? '16px 16px 4px 16px'
                    : '16px 16px 16px 4px',
                  background: msg.role === 'user'
                    ? 'var(--wf-red)'
                    : 'var(--surface)',
                  color: msg.role === 'user' ? 'white' : 'var(--ink)',
                  fontSize: 13,
                  lineHeight: 1.6,
                  border: msg.role === 'bot'
                    ? '0.5px solid var(--border-1)'
                    : 'none',
                  boxShadow: 'var(--shadow-sm)',
                }}>
                  {msg.loading ? (
                    <div style={{ display: 'flex', gap: 4, padding: '2px 0' }}>
                      {[0,1,2].map(j => (
                        <div key={j} className="msg-dot" style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: 'var(--ink-3)',
                        }}/>
                      ))}
                    </div>
                  ) : (
                    <span style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</span>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef}/>
          </div>

          {/* Suggested questions */}
          {messages.length === 1 && profile && (
            <div style={{
              padding: '8px 12px',
              background: 'var(--surface)',
              borderTop: '0.5px solid var(--border-1)',
              display: 'flex',
              gap: 6,
              flexWrap: 'wrap',
            }}>
              {(profile.modality === 'structured'
                ? ['What is the health score?', 'Which columns have PII?', 'Any missing data?']
                : ['Who are the parties?', 'What is the loan amount?', 'What is the maturity date?']
              ).map(q => (
                <button
                  key={q}
                  onClick={() => { setInput(q); }}
                  style={{
                    fontSize: 11,
                    padding: '4px 10px',
                    borderRadius: 12,
                    border: '0.5px solid var(--border-2)',
                    background: 'var(--surface-2)',
                    color: 'var(--ink-2)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div style={{
            padding: '12px',
            borderTop: '0.5px solid var(--border-1)',
            display: 'flex',
            gap: 8,
            background: 'var(--surface)',
          }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
              placeholder="Ask about your data..."
              style={{
                flex: 1,
                padding: '9px 14px',
                borderRadius: 20,
                border: '0.5px solid var(--border-2)',
                fontSize: 13,
                background: 'var(--surface-2)',
                color: 'var(--ink)',
                outline: 'none',
                fontFamily: 'var(--font-body)',
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                background: input.trim() ? 'var(--wf-red)' : 'var(--surface-3)',
                border: 'none',
                cursor: input.trim() ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                transition: 'background 0.15s ease',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M14 8L2 2l3 6-3 6 12-6z" fill="white"/>
              </svg>
            </button>
          </div>

        </div>
      )}
    </>
  )
}