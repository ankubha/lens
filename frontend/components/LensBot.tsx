'use client'
import { useState, useRef, useEffect } from 'react'
import { ProfileContract } from '@/lib/api'

interface Message {
  role: 'user' | 'bot'
  text: string
  loading?: boolean
  rag?: { chunks: number; sections: string[]; relevance: number }
}

interface Props {
  profile?: ProfileContract | null
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'

// ── Smart suggestions per modality ───────────────────────
function getSuggestions(profile: ProfileContract | null | undefined): string[] {
  if (!profile) return []
  if (profile.modality === 'structured') return [
    'Which columns have missing data?',
    'Which columns contain PII?',
    'What is the health score breakdown?',
    'Are there any drift alerts?',
    'What are the top values in each column?',
    'Suggest a primary key',
  ]
  if (profile.modality === 'unstructured') return [
    'Who are the parties in this document?',
    'What are the key dates?',
    'What are the main obligations?',
    'Summarise the document in 3 sentences',
    'What CDEs were not found?',
    'What is the confidence for each extracted field?',
  ]
  return [
    'What fields were detected?',
    'Which fields have low coverage?',
    'What does the cross-column intelligence say?',
    'Are there any duplicate records?',
  ]
}

// ── Section badge colour ──────────────────────────────────
function sectionColor(s: string): string {
  const map: Record<string, string> = {
    cde: '#D71E2B', obligation: '#B45309', party: '#1D4ED8',
    summary: '#1A7F4B', column: '#6366F1', overview: '#4A4A4A',
    health: '#1A7F4B', intelligence: '#7C3AED', drift: '#CC2222',
    amounts: '#B45309', dates: '#1D4ED8', finding: '#B45309',
    schema: '#4A4A4A', narrative: '#7C3AED', field: '#6366F1',
    detailed_summary: '#1A7F4B',
  }
  return map[s] || '#4A4A4A'
}

// ── Simple markdown bold renderer ────────────────────────
function BotText({ text }: { text: string }) {
  if (!text) return null
  return (
    <span style={{ whiteSpace: 'pre-wrap' }}>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <strong key={i} style={{ fontWeight: 600 }}>{part.slice(2, -2)}</strong>
        ) : <span key={i}>{part}</span>
      )}
    </span>
  )
}

export default function LensBot({ profile }: Props) {
  const [open, setOpen]           = useState(false)
  const [input, setInput]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [showSrc, setShowSrc]     = useState<number | null>(null)
  const [messages, setMessages]   = useState<Message[]>([{
    role: 'bot',
    text: profile
      ? `Hi! I'm LensBot.\n\nI can answer questions about **${profile.filename}**.\n\nI use semantic search over the full profile — every column, CDE, obligation, party, and summary is indexed. I never guess: if something isn't in the profile, I'll say so.\n\nWhat would you like to know?`
      : `Hi! I'm LensBot.\n\nUpload a file and I'll help you explore your data.`,
  }])
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (profile) {
      setMessages([{
        role: 'bot',
        text: `Hi! I'm LensBot.\n\nI can answer questions about **${profile.filename}**.\n\nI use semantic search over the full profile — every field, CDE, party, obligation, and summary is indexed. I never guess.\n\nWhat would you like to know?`,
      }])
      setShowSrc(null)
    }
  }, [profile?.profile_id])

  const history = () =>
    messages
      .filter(m => !m.loading && m.text)
      .slice(-6)
      .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }))

  const send = async () => {
    if (!input.trim() || loading || !profile) return
    const q = input.trim()
    setInput('')
    const prev = [...messages, { role: 'user' as const, text: q }]
    setMessages([...prev, { role: 'bot' as const, text: '', loading: true }])
    setLoading(true)

    try {
      const res  = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, profile_id: profile.profile_id, history: history() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Request failed')

      const ragInfo = data.tool_results?.[0]?.result
      setMessages([...prev, {
        role: 'bot',
        text: data.answer || 'This information is not available in the current profile.',
        rag: ragInfo ? {
          chunks:    ragInfo.chunks_retrieved ?? 0,
          sections:  ragInfo.sections ?? [],
          relevance: ragInfo.top_relevance_pct ?? 0,
        } : undefined,
      }])
    } catch (e: any) {
      setMessages([...prev, { role: 'bot', text: `Sorry, I ran into an error: ${e.message}` }])
    } finally {
      setLoading(false)
    }
  }

  const suggestions = getSuggestions(profile)

  return (
    <>
      <style>{`
        @keyframes slideUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        @keyframes blink   { 0%,100%{opacity:0.25} 50%{opacity:1} }
        .dot1{animation:blink 1.2s ease-in-out infinite}
        .dot2{animation:blink 1.2s ease-in-out 0.2s infinite}
        .dot3{animation:blink 1.2s ease-in-out 0.4s infinite}
        .lb-sugg:hover{background:var(--surface-3)!important;border-color:var(--wf-red)!important;color:var(--wf-red)!important}
      `}</style>

      {/* ── Floating button ── */}
      <button onClick={() => setOpen(!open)} title="Ask LensBot" style={{
        position: 'fixed', bottom: 28, right: 28,
        width: 58, height: 58, borderRadius: '50%',
        background: open ? '#AA1520' : 'var(--wf-red)',
        border: '2.5px solid var(--wf-gold)',
        boxShadow: '0 4px 20px rgba(215,30,43,0.38)',
        cursor: 'pointer', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.2s ease',
        transform: open ? 'rotate(45deg)' : 'none',
      }}>
        {open
          ? <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 3l14 14M17 3L3 17" stroke="white" strokeWidth="2.4" strokeLinecap="round"/></svg>
          : <span style={{ fontSize: 24, lineHeight: 1 }}>🤖</span>
        }
      </button>

      {/* ── Label ── */}
      {!open && (
        <div style={{
          position: 'fixed', bottom: 94, right: 28, zIndex: 1000, pointerEvents: 'none',
          background: 'var(--ink)', color: 'white',
          fontSize: 10.5, fontWeight: 500, padding: '3px 10px', borderRadius: 20,
        }}>
          LensBot
        </div>
      )}

      {/* ── Chat panel ── */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 98, right: 28,
          width: 410, height: 570,
          background: 'var(--surface)',
          border: '0.5px solid var(--border-1)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.18)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          zIndex: 999, animation: 'slideUp 0.22s ease',
        }}>

          {/* Header */}
          <div style={{
            background: 'var(--wf-red)',
            borderBottom: '2px solid var(--wf-gold)',
            padding: '12px 16px',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', fontSize: 17,
              background: 'rgba(255,255,255,0.14)',
              border: '1.5px solid rgba(255,205,65,0.55)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>🤖</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'white', fontFamily: 'var(--font-display)' }}>
                LensBot
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)', letterSpacing: '0.03em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {profile
                  ? `${profile.filename.substring(0, 30)}${profile.filename.length > 30 ? '…' : ''}`
                  : 'Wells Fargo CDO Intelligence'}
              </div>
            </div>
            {/* RAG status indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 0 2px rgba(74,222,128,0.3)' }}/>
              <span style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.04em' }}>
                Semantic RAG
              </span>
            </div>
          </div>

          {/* Messages */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: '14px 14px 8px',
            display: 'flex', flexDirection: 'column', gap: 10,
            background: 'var(--surface-2)',
          }}>
            {messages.map((msg, i) => (
              <div key={i} style={{
                display: 'flex', flexDirection: 'column',
                alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                gap: 4,
              }}>
                <div style={{
                  maxWidth: '87%', padding: '10px 13px', fontSize: 13, lineHeight: 1.6,
                  borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  background: msg.role === 'user' ? 'var(--wf-red)' : 'var(--surface)',
                  color: msg.role === 'user' ? 'white' : 'var(--ink)',
                  border: msg.role === 'bot' ? '0.5px solid var(--border-1)' : 'none',
                  boxShadow: 'var(--shadow-sm)',
                }}>
                  {msg.loading ? (
                    <div style={{ display: 'flex', gap: 4, padding: '3px 0' }}>
                      <div className="dot1" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ink-3)' }}/>
                      <div className="dot2" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ink-3)' }}/>
                      <div className="dot3" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ink-3)' }}/>
                    </div>
                  ) : (
                    <BotText text={msg.text || '(no response received)'} />
                  )}
                </div>

                {/* RAG source pill */}
                {msg.role === 'bot' && msg.rag && msg.rag.chunks > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => setShowSrc(showSrc === i ? null : i)}
                      style={{
                        fontSize: 10, padding: '2px 9px', borderRadius: 10,
                        border: '0.5px solid var(--border-2)',
                        background: showSrc === i ? 'var(--surface-3)' : 'var(--surface)',
                        color: 'var(--ink-3)', cursor: 'pointer',
                        fontFamily: 'var(--font-body)',
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      <span style={{ color: '#1A7F4B', fontWeight: 600 }}>↗</span>
                      {msg.rag.chunks} sources · {msg.rag.relevance}% match
                      {showSrc === i ? ' ▲' : ' ▼'}
                    </button>
                  </div>
                )}

                {/* Expanded source info */}
                {showSrc === i && msg.rag && (
                  <div style={{
                    maxWidth: '87%', background: 'var(--surface)',
                    border: '0.5px solid var(--border-1)', borderRadius: 8,
                    padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 5,
                  }}>
                    <div style={{ fontSize: 10, color: 'var(--ink-3)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 2 }}>
                      Sections searched
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {msg.rag.sections.map(s => (
                        <span key={s} style={{
                          fontSize: 10, fontWeight: 600,
                          padding: '2px 7px', borderRadius: 6,
                          background: `${sectionColor(s)}15`,
                          color: sectionColor(s),
                          border: `0.5px solid ${sectionColor(s)}40`,
                        }}>
                          {s}
                        </span>
                      ))}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 2 }}>
                      {msg.rag.chunks} chunks retrieved · top match {msg.rag.relevance}% similarity
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div ref={bottomRef}/>
          </div>

          {/* Suggestions (only before first user message) */}
          {messages.filter(m => m.role === 'user').length === 0 && profile && (
            <div style={{
              padding: '8px 10px', background: 'var(--surface)',
              borderTop: '0.5px solid var(--border-1)',
              display: 'flex', gap: 5, flexWrap: 'wrap',
            }}>
              {suggestions.slice(0, 4).map(q => (
                <button key={q} className="lb-sugg" onClick={() => setInput(q)} style={{
                  fontSize: 10.5, padding: '4px 10px', borderRadius: 12,
                  border: '0.5px solid var(--border-2)',
                  background: 'var(--surface-2)', color: 'var(--ink-2)',
                  cursor: 'pointer', fontFamily: 'var(--font-body)',
                  transition: 'all 0.15s ease',
                }}>
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div style={{
            padding: '10px 12px', borderTop: '0.5px solid var(--border-1)',
            display: 'flex', gap: 8, background: 'var(--surface)',
          }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
              placeholder={profile ? 'Ask about your data...' : 'Upload a file first...'}
              disabled={!profile || loading}
              style={{
                flex: 1, padding: '8px 13px', borderRadius: 20,
                border: '0.5px solid var(--border-2)', fontSize: 13,
                background: profile ? 'var(--surface-2)' : 'var(--surface-3)',
                color: 'var(--ink)', outline: 'none',
                fontFamily: 'var(--font-body)',
              }}
            />
            <button
              onClick={send}
              disabled={!input.trim() || loading || !profile}
              style={{
                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                background: input.trim() && profile ? 'var(--wf-red)' : 'var(--surface-3)',
                border: 'none', cursor: input.trim() && profile ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.15s ease',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path d="M14 8L2 2l3 6-3 6 12-6z" fill="white"/>
              </svg>
            </button>
          </div>

        </div>
      )}
    </>
  )
}
