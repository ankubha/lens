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

function getSuggestions(profile: ProfileContract | null | undefined): string[] {
  if (!profile) return []
  if (profile.modality === 'structured') return [
    'Which columns have missing data?',
    'Which columns contain PII?',
    'What is the health score breakdown?',
    'Are there any drift alerts?',
    'Suggest a primary key',
  ]
  if (profile.modality === 'unstructured') return [
    'Who are the parties in this document?',
    'What are the key dates?',
    'What are the main obligations?',
    'Summarise in 3 sentences',
    'What CDEs were not found?',
  ]
  return [
    'What fields were detected?',
    'Which fields have low coverage?',
    'What does the AI intelligence say?',
    'Are there duplicate records?',
  ]
}

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

function BotText({ text }: { text: string }) {
  if (!text) return null
  return (
    <span style={{ whiteSpace: 'pre-wrap' }}>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith('**') && part.endsWith('**')
          ? <strong key={i} style={{ fontWeight: 600 }}>{part.slice(2, -2)}</strong>
          : <span key={i}>{part}</span>
      )}
    </span>
  )
}

// LensBot robot avatar
function BotAvatar({ size = 28 }: { size?: number }) {
  const s = size
  return (
    <div style={{
      width: s, height: s, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg, #D4202D 0%, #8B0014 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 2px 8px rgba(215,30,43,0.4)',
    }}>
      <svg width={s * 0.68} height={s * 0.68} viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Antenna */}
        <line x1="14" y1="5" x2="14" y2="2" stroke="white" strokeWidth="1.6" strokeLinecap="round"/>
        <circle cx="14" cy="1.4" r="1.4" fill="white"/>
        {/* Head */}
        <rect x="4" y="6" width="20" height="14" rx="4" fill="white" fillOpacity="0.95"/>
        {/* Eyes */}
        <circle cx="10" cy="12" r="2.8" fill="#D4202D"/>
        <circle cx="18" cy="12" r="2.8" fill="#D4202D"/>
        <circle cx="10.8" cy="11.2" r="0.9" fill="white"/>
        <circle cx="18.8" cy="11.2" r="0.9" fill="white"/>
        {/* Mouth */}
        <rect x="9" y="16" width="10" height="1.8" rx="0.9" fill="#D4202D" fillOpacity="0.5"/>
        {/* Ears */}
        <rect x="1.5" y="10" width="2.5" height="5" rx="1.25" fill="white" fillOpacity="0.8"/>
        <rect x="24" y="10" width="2.5" height="5" rx="1.25" fill="white" fillOpacity="0.8"/>
      </svg>
    </div>
  )
}

export default function LensBot({ profile }: Props) {
  const [open, setOpen]         = useState(false)
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [showSrc, setShowSrc]   = useState<number | null>(null)
  const [messages, setMessages] = useState<Message[]>([{
    role: 'bot',
    text: profile
      ? `Hi! I'm **LensBot**.\n\nI can answer questions about **${profile.filename}**.\n\nEvery column, CDE, obligation, party, and summary is indexed. I never guess — if it's not in the profile, I'll say so.\n\nWhat would you like to know?`
      : `Hi! I'm **LensBot**.\n\nUpload a file and I'll help you explore your data intelligently.`,
  }])
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (profile) {
      setMessages([{
        role: 'bot',
        text: `Hi! I'm **LensBot**.\n\nI can answer questions about **${profile.filename}**.\n\nEvery field, CDE, party, obligation, and summary is indexed. I never guess.\n\nWhat would you like to know?`,
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
        @keyframes slideUp   { from{opacity:0;transform:translateY(16px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes blink     { 0%,100%{opacity:0.2} 50%{opacity:1} }
        @keyframes pulse-ring { 0%{transform:scale(1);opacity:0.6} 70%{transform:scale(1.55);opacity:0} 100%{transform:scale(1.55);opacity:0} }
        .dot1{animation:blink 1.3s ease-in-out infinite}
        .dot2{animation:blink 1.3s ease-in-out 0.22s infinite}
        .dot3{animation:blink 1.3s ease-in-out 0.44s infinite}
        .lb-sugg:hover{background:rgba(215,30,43,0.07)!important;border-color:rgba(215,30,43,0.4)!important;color:var(--wf-red)!important}
        .lb-fab:hover{transform:scale(1.07)!important;box-shadow:0 6px 28px rgba(215,30,43,0.5)!important}
        .lb-send:hover:not(:disabled){background:#A8141F!important}
        .lb-msg-input:focus{border-color:rgba(215,30,43,0.5)!important;box-shadow:0 0 0 3px rgba(215,30,43,0.08)!important}
      `}</style>

      {/* ── FAB button ── */}
      <button
        onClick={() => setOpen(!open)}
        className="lb-fab"
        title="Ask LensBot"
        style={{
          position: 'fixed', bottom: 28, right: 28,
          width: 50, height: 50, borderRadius: '50%',
          background: 'linear-gradient(135deg, #D4202D 0%, #A8141F 100%)',
          border: 'none',
          boxShadow: '0 4px 20px rgba(215,30,43,0.4)',
          cursor: 'pointer', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        }}
      >
        {/* Pulse ring (only when closed) */}
        {!open && (
          <span style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            border: '2px solid rgba(215,30,43,0.5)',
            animation: 'pulse-ring 2.2s ease-out infinite',
            pointerEvents: 'none',
          }}/>
        )}
        {open ? (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M2 2l14 14M16 2L2 16" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
          </svg>
        ) : (
          <svg width="32" height="32" viewBox="0 0 28 28" fill="none">
            <line x1="14" y1="5" x2="14" y2="2" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
            <circle cx="14" cy="1.4" r="1.5" fill="white"/>
            <rect x="4" y="6" width="20" height="14" rx="4" fill="white" fillOpacity="0.95"/>
            <circle cx="10" cy="12" r="2.8" fill="#D4202D"/>
            <circle cx="18" cy="12" r="2.8" fill="#D4202D"/>
            <circle cx="10.8" cy="11.2" r="0.9" fill="white"/>
            <circle cx="18.8" cy="11.2" r="0.9" fill="white"/>
            <rect x="9" y="16" width="10" height="1.8" rx="0.9" fill="#D4202D" fillOpacity="0.5"/>
            <rect x="1.5" y="10" width="2.5" height="5" rx="1.25" fill="white" fillOpacity="0.8"/>
            <rect x="24" y="10" width="2.5" height="5" rx="1.25" fill="white" fillOpacity="0.8"/>
          </svg>
        )}
      </button>

      {/* ── Label ── */}
      {!open && (
        <div style={{
          position: 'fixed', bottom: 84, right: 28, zIndex: 1000,
          background: 'rgba(15,15,20,0.82)',
          backdropFilter: 'blur(8px)',
          color: 'white', fontSize: 11, fontWeight: 500,
          padding: '4px 12px', borderRadius: 20,
          pointerEvents: 'none',
          letterSpacing: '0.02em',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        }}>
          LensBot
        </div>
      )}

      {/* ── Chat panel ── */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 100, right: 28,
          width: 430, height: 600,
          background: '#FAFAFA',
          borderRadius: 20,
          boxShadow: '0 24px 64px rgba(0,0,0,0.2), 0 4px 16px rgba(0,0,0,0.1)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          zIndex: 999, animation: 'slideUp 0.22s cubic-bezier(0.4,0,0.2,1)',
          border: '1px solid rgba(0,0,0,0.08)',
        }}>

          {/* ── Header ── */}
          <div style={{
            background: 'linear-gradient(135deg, #D4202D 0%, #A8141F 100%)',
            padding: '16px 18px',
            display: 'flex', alignItems: 'center', gap: 12,
            flexShrink: 0,
          }}>
            <BotAvatar size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 15, fontWeight: 700, color: 'white',
                fontFamily: 'var(--font-display)', letterSpacing: '-0.01em',
                lineHeight: 1,
              }}>
                LensBot
              </div>
              <div style={{
                fontSize: 11, color: 'rgba(255,255,255,0.7)',
                marginTop: 3, overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {profile
                  ? profile.filename.length > 34 ? profile.filename.substring(0, 34) + '…' : profile.filename
                  : 'Wells Fargo · CDO Intelligence'}
              </div>
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'rgba(0,0,0,0.18)', borderRadius: 20,
              padding: '4px 10px',
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: '#4ade80',
                boxShadow: '0 0 6px rgba(74,222,128,0.8)',
                display: 'block', flexShrink: 0,
              }}/>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)', fontWeight: 500 }}>
                Semantic RAG
              </span>
            </div>
          </div>

          {/* Gold accent line under header */}
          <div style={{
            height: 3,
            background: 'linear-gradient(90deg, var(--wf-gold-dark), var(--wf-gold), var(--wf-gold-dark))',
            flexShrink: 0,
          }}/>

          {/* ── Messages ── */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: '16px 14px 10px',
            display: 'flex', flexDirection: 'column', gap: 12,
            background: '#F5F5F7',
          }}>
            {messages.map((msg, i) => (
              <div key={i} style={{
                display: 'flex', flexDirection: 'column',
                alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                gap: 4,
              }}>
                {/* Avatar row */}
                <div style={{
                  display: 'flex',
                  flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                  alignItems: 'flex-end', gap: 8, maxWidth: '90%',
                }}>
                  {msg.role === 'bot' && <BotAvatar size={24} />}
                  {msg.role === 'user' && (
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                      background: 'linear-gradient(135deg, #4B5563, #1F2937)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9, fontWeight: 700, color: 'white',
                    }}>
                      AB
                    </div>
                  )}

                  <div style={{
                    padding: '10px 14px', fontSize: 13, lineHeight: 1.65,
                    borderRadius: msg.role === 'user'
                      ? '18px 18px 4px 18px'
                      : '18px 18px 18px 4px',
                    background: msg.role === 'user'
                      ? 'linear-gradient(135deg, #D4202D, #A8141F)'
                      : 'white',
                    color: msg.role === 'user' ? 'white' : '#1A1A2E',
                    boxShadow: msg.role === 'user'
                      ? '0 2px 10px rgba(215,30,43,0.3)'
                      : '0 1px 4px rgba(0,0,0,0.08)',
                    border: msg.role === 'bot' ? '1px solid rgba(0,0,0,0.06)' : 'none',
                  }}>
                    {msg.loading ? (
                      <div style={{ display: 'flex', gap: 5, padding: '2px 0', alignItems: 'center' }}>
                        <div className="dot1" style={{ width: 7, height: 7, borderRadius: '50%', background: '#C0C0C8' }}/>
                        <div className="dot2" style={{ width: 7, height: 7, borderRadius: '50%', background: '#C0C0C8' }}/>
                        <div className="dot3" style={{ width: 7, height: 7, borderRadius: '50%', background: '#C0C0C8' }}/>
                      </div>
                    ) : (
                      <BotText text={msg.text || '(no response received)'} />
                    )}
                  </div>
                </div>

                {/* RAG source pill */}
                {msg.role === 'bot' && msg.rag && msg.rag.chunks > 0 && (
                  <div style={{ paddingLeft: 32, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => setShowSrc(showSrc === i ? null : i)}
                      style={{
                        fontSize: 10, padding: '3px 10px', borderRadius: 10,
                        border: '1px solid rgba(0,0,0,0.1)',
                        background: showSrc === i ? '#F0FDF4' : 'white',
                        color: '#4A4A5A', cursor: 'pointer',
                        fontFamily: 'var(--font-body)',
                        display: 'flex', alignItems: 'center', gap: 4,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                      }}
                    >
                      <span style={{ color: '#1A7F4B', fontWeight: 700 }}>↗</span>
                      {msg.rag.chunks} sources · {msg.rag.relevance}% match
                      <span style={{ fontSize: 8 }}>{showSrc === i ? '▲' : '▼'}</span>
                    </button>
                  </div>
                )}

                {/* Expanded source info */}
                {showSrc === i && msg.rag && (
                  <div style={{
                    marginLeft: 32, background: 'white',
                    border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10,
                    padding: '10px 13px', display: 'flex', flexDirection: 'column', gap: 6,
                    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                  }}>
                    <div style={{ fontSize: 10, color: '#8888A0', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                      Sections searched
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {msg.rag.sections.map(s => (
                        <span key={s} style={{
                          fontSize: 10, fontWeight: 600,
                          padding: '2px 8px', borderRadius: 6,
                          background: `${sectionColor(s)}12`,
                          color: sectionColor(s),
                          border: `1px solid ${sectionColor(s)}30`,
                        }}>
                          {s}
                        </span>
                      ))}
                    </div>
                    <div style={{ fontSize: 10, color: '#9090A8', marginTop: 2 }}>
                      {msg.rag.chunks} chunks · top match {msg.rag.relevance}% similarity
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div ref={bottomRef}/>
          </div>

          {/* ── Suggestions ── */}
          {messages.filter(m => m.role === 'user').length === 0 && profile && (
            <div style={{
              padding: '10px 12px 8px',
              background: 'white',
              borderTop: '1px solid rgba(0,0,0,0.06)',
              display: 'flex', gap: 6, flexWrap: 'wrap',
            }}>
              <div style={{ fontSize: 10, color: '#9090A8', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', width: '100%', marginBottom: 2 }}>
                Suggested
              </div>
              {suggestions.slice(0, 4).map(q => (
                <button
                  key={q}
                  className="lb-sugg"
                  onClick={() => setInput(q)}
                  style={{
                    fontSize: 11, padding: '5px 11px', borderRadius: 20,
                    border: '1px solid rgba(0,0,0,0.1)',
                    background: '#F5F5F7', color: '#4A4A5A',
                    cursor: 'pointer', fontFamily: 'var(--font-body)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* ── Input ── */}
          <div style={{
            padding: '10px 12px 12px',
            background: 'white',
            borderTop: '1px solid rgba(0,0,0,0.06)',
            display: 'flex', gap: 8, alignItems: 'center',
          }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
              placeholder={profile ? 'Ask about your data...' : 'Upload a file first...'}
              disabled={!profile || loading}
              className="lb-msg-input"
              style={{
                flex: 1, padding: '10px 16px', borderRadius: 24,
                border: '1.5px solid rgba(0,0,0,0.1)',
                fontSize: 13, background: '#F5F5F7',
                color: '#1A1A2E', outline: 'none',
                fontFamily: 'var(--font-body)',
                transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
              }}
            />
            <button
              onClick={send}
              disabled={!input.trim() || loading || !profile}
              className="lb-send"
              style={{
                width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                background: input.trim() && profile
                  ? 'linear-gradient(135deg, #D4202D, #A8141F)'
                  : '#E8E8EC',
                border: 'none',
                cursor: input.trim() && profile ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: input.trim() && profile ? '0 2px 8px rgba(215,30,43,0.35)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M14 8L2 2l3 6-3 6 12-6z" fill={input.trim() && profile ? 'white' : '#A0A0B0'}/>
              </svg>
            </button>
          </div>

        </div>
      )}
    </>
  )
}
