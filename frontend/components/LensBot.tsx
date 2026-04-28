'use client'
import { useState, useRef, useEffect } from 'react'
import { ProfileContract } from '@/lib/api'

interface Message {
  role: 'user' | 'bot'
  text: string
  loading?: boolean
  tool_results?: any[]
}

interface Props {
  profile?: ProfileContract | null
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'

export default function LensBot({ profile }: Props) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([{
    role: 'bot',
    text: profile
      ? `Hi! I'm LensBot 🤖\n\nI can answer questions about **${profile.filename}**.\n\nI only answer from the actual profile data — I never guess or hallucinate. If something isn't in the profile, I'll tell you.\n\nWhat would you like to know?`
      : `Hi! I'm LensBot 🤖\n\nUpload a file and I'll help you understand your data.`,
  }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [showTools, setShowTools] = useState<number | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (profile) {
      setMessages([{
        role: 'bot',
        text: `Hi! I'm LensBot 🤖\n\nI can answer questions about **${profile.filename}**.\n\nI only answer from the actual profile data — I never guess or hallucinate.\n\nWhat would you like to know?`,
      }])
    }
  }, [profile?.profile_id])

  const getHistory = () => messages
    .filter(m => !m.loading && m.text)
    .slice(-6)
    .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }))

  const sendMessage = async () => {
    if (!input.trim() || loading || !profile) return
    const question = input.trim()
    setInput('')

    const newMessages = [...messages, { role: 'user' as const, text: question }]
    setMessages([...newMessages, { role: 'bot' as const, text: '', loading: true }])
    setLoading(true)

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          profile_id: profile.profile_id,
          history: getHistory(),
        }),
      })

      const data = await res.json()

      if (!res.ok) throw new Error(data.detail || 'Request failed')

      setMessages([
        ...newMessages,
        {
          role: 'bot',
          text: data.answer,
          tool_results: data.tool_results,
        },
      ])
    } catch (e: any) {
      setMessages([
        ...newMessages,
        { role: 'bot', text: `Sorry, I encountered an error: ${e.message}` },
      ])
    } finally {
      setLoading(false)
    }
  }

  const suggestions = profile?.modality === 'structured'
    ? ['What is the health score?', 'Which columns have PII?', 'Any missing data?', 'Suggest a primary key']
    : profile?.modality === 'unstructured'
    ? ['Who are the parties?', 'What is the loan amount?', 'When does it mature?', 'Any covenants?']
    : ['What fields were detected?', 'What is the schema?']

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

      {/* Label */}
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
          width: 400,
          height: 560,
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
            @keyframes blink { 0%,100%{opacity:0.3;} 50%{opacity:1;} }
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
              width: 34, height: 34,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.15)',
              border: '1.5px solid rgba(255,205,65,0.6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18,
            }}>🤖</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'white', fontFamily: 'var(--font-display)' }}>
                LensBot
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.04em' }}>
                {profile ? `Analysing: ${profile.filename.substring(0, 28)}${profile.filename.length > 28 ? '…' : ''}` : 'Wells Fargo CDO Intelligence'}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 0 2px rgba(74,222,128,0.3)' }}/>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>LangGraph</span>
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
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 4 }}>
                <div style={{
                  maxWidth: '85%',
                  padding: '10px 14px',
                  borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  background: msg.role === 'user' ? 'var(--wf-red)' : 'var(--surface)',
                  color: msg.role === 'user' ? 'white' : 'var(--ink)',
                  fontSize: 13,
                  lineHeight: 1.6,
                  border: msg.role === 'bot' ? '0.5px solid var(--border-1)' : 'none',
                  boxShadow: 'var(--shadow-sm)',
                }}>
                  {msg.loading ? (
                    <div style={{ display: 'flex', gap: 4, padding: '2px 0' }}>
                      {[0,1,2].map(j => (
                        <div key={j} className="msg-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ink-3)' }}/>
                      ))}
                    </div>
                  ) : (
                    <span style={{ whiteSpace: 'pre-wrap' }}>
                      {msg.text.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
                        part.startsWith('**') && part.endsWith('**') ? (
                          <strong key={j} style={{ fontWeight: 600, color: 'inherit' }}>
                            {part.slice(2, -2)}
                          </strong>
                        ) : (
                          <span key={j}>{part}</span>
                        )
                      )}
                    </span>
                  )}
                </div>

                {/* Tool results toggle */}
                {msg.tool_results && msg.tool_results.length > 0 && (
                  <button
                    onClick={() => setShowTools(showTools === i ? null : i)}
                    style={{
                      fontSize: 10,
                      color: 'var(--ink-3)',
                      background: 'none',
                      border: '0.5px solid var(--border-1)',
                      borderRadius: 8,
                      padding: '2px 8px',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-body)',
                    }}
                  >
                    {showTools === i ? '▲ hide sources' : `▼ view sources (${msg.tool_results.length} tool${msg.tool_results.length > 1 ? 's' : ''})`}
                  </button>
                )}

                {/* Tool results expanded */}
                {showTools === i && msg.tool_results && (
                  <div style={{
                    maxWidth: '85%',
                    background: 'var(--surface-3)',
                    border: '0.5px solid var(--border-1)',
                    borderRadius: 8,
                    padding: '8px 12px',
                    fontSize: 11,
                    color: 'var(--ink-3)',
                    fontFamily: 'monospace',
                    maxHeight: 160,
                    overflowY: 'auto',
                    lineHeight: 1.5,
                  }}>
                    {msg.tool_results.map((tr, j) => (
                      <div key={j}>
                        <span style={{ color: 'var(--wf-red)', fontWeight: 600 }}>
                          [{tr.tool}]
                        </span>{' '}
                        {JSON.stringify(tr.result, null, 0).substring(0, 200)}...
                      </div>
                    ))}
                  </div>
                )}
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
              {suggestions.map(q => (
                <button
                  key={q}
                  onClick={() => setInput(q)}
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
              placeholder={profile ? 'Ask about your data...' : 'Upload a file first...'}
              disabled={!profile || loading}
              style={{
                flex: 1,
                padding: '9px 14px',
                borderRadius: 20,
                border: '0.5px solid var(--border-2)',
                fontSize: 13,
                background: profile ? 'var(--surface-2)' : 'var(--surface-3)',
                color: 'var(--ink)',
                outline: 'none',
                fontFamily: 'var(--font-body)',
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading || !profile}
              style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                background: input.trim() && profile ? 'var(--wf-red)' : 'var(--surface-3)',
                border: 'none',
                cursor: input.trim() && profile ? 'pointer' : 'default',
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