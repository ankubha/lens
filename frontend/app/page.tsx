'use client'
import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { profileFile } from '@/lib/api'
import LensBot from '@/components/LensBot'
import DataForge from '@/components/DataForge'

const SUPPORTED = ['.csv', '.xlsx', '.xls', '.pdf', '.docx', '.json', '.xml']

export default function HomePage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'profiler' | 'dataforge'>('profiler')
  const [dragging, setDragging]   = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress]   = useState('')
  const [error, setError]         = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const read = () => {
      const p = new URLSearchParams(window.location.search)
      setActiveTab(p.get('tab') === 'dataforge' ? 'dataforge' : 'profiler')
    }
    read()
    window.addEventListener('tabchange', read)
    window.addEventListener('popstate', read)
    return () => {
      window.removeEventListener('tabchange', read)
      window.removeEventListener('popstate', read)
    }
  }, [])

  const handleFile = useCallback(async (file: File) => {
    setError('')
    const ext = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!SUPPORTED.includes(ext)) {
      setError(`Unsupported file type: ${ext}. Supported: ${SUPPORTED.join(', ')}`)
      return
    }
    setUploading(true)
    const isUnstructured = ext === '.pdf' || ext === '.docx'
    const messages = isUnstructured
      ? ['Analysing document structure...', 'Extracting text from all pages...', 'Running LLM extraction...', 'Generating executive summary...', 'Building data dictionary...', 'Finalising profile...']
      : ['Loading dataset...', 'Profiling columns...', 'Computing statistics...', 'Detecting PII and semantic types...', 'Calculating health score...']
    let i = 0
    setProgress(messages[0])
    const interval = setInterval(() => {
      i = Math.min(i + 1, messages.length - 1)
      setProgress(messages[i])
    }, isUnstructured ? 12000 : 800)
    try {
      const contract = await profileFile(file)
      clearInterval(interval)
      router.push(`/profile/${contract.profile_id}`)
    } catch (e: any) {
      clearInterval(interval)
      setError(e.message || 'Profiling failed. Please try again.')
      setUploading(false)
      setProgress('')
    }
  }, [router])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  return (
    <div>

      {/* ── PROFILER TAB ── */}
      <div style={{ display: activeTab === 'profiler' ? 'block' : 'none' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '60px 24px' }}>

          <div style={{ textAlign: 'center', marginBottom: 56 }} className="animate-fade-up">
            <div style={{
              display: 'inline-block',
              background: 'var(--wf-red-light)', color: 'var(--wf-red)',
              fontSize: 11, fontWeight: 500, padding: '4px 12px', borderRadius: 20,
              letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 16,
              border: '0.5px solid rgba(215,30,43,0.2)',
            }}>
              Wells Fargo CDO · Data Intelligence
            </div>
            <h1 style={{
              fontFamily: 'var(--font-display)', fontSize: 48, fontWeight: 700,
              color: 'var(--ink)', lineHeight: 1.15, letterSpacing: '-0.02em', marginBottom: 16,
            }}>
              Profile anything.<br/>
              <span style={{ color: 'var(--wf-red)' }}>Understand everything.</span>
            </h1>
            <p style={{ fontSize: 17, color: 'var(--ink-2)', maxWidth: 560, margin: '0 auto', lineHeight: 1.7 }}>
              Drop a CSV, Excel, PDF, Word (.docx), or JSON file. Lens auto-detects the type and returns
              structured intelligence — health scores, extracted facts, summaries, and a full data dictionary.
            </p>
          </div>

          <div className="gold-rule" style={{ marginBottom: 48 }}/>

          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => !uploading && inputRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? 'var(--wf-red)' : 'var(--border-2)'}`,
              borderRadius: 'var(--radius-xl)',
              background: dragging ? 'var(--wf-red-light)' : 'var(--surface)',
              padding: '64px 40px', textAlign: 'center',
              cursor: uploading ? 'default' : 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: 'var(--shadow-md)',
              position: 'relative', overflow: 'hidden',
            }}
          >
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 3,
              background: 'linear-gradient(90deg, var(--wf-gold) 0%, var(--wf-gold-dark) 100%)',
            }}/>
            <input
              ref={inputRef} type="file" accept={SUPPORTED.join(',')}
              style={{ display: 'none' }}
              onChange={e => { const file = e.target.files?.[0]; if (file) handleFile(file) }}
            />
            {uploading ? (
              <div className="animate-fade-in">
                <div style={{
                  width: 56, height: 56,
                  border: '3px solid var(--surface-tertiary)',
                  borderTop: '3px solid var(--wf-red)',
                  borderRadius: '50%', margin: '0 auto 24px',
                  animation: 'spin 1s linear infinite',
                }}/>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                <p style={{ fontSize: 16, fontWeight: 500, color: 'var(--ink)', marginBottom: 8 }}>{progress}</p>
                <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>This may take 1-2 minutes for large documents</p>
              </div>
            ) : (
              <>
                <div style={{
                  width: 64, height: 64, background: 'var(--wf-red)', borderRadius: '50%',
                  margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 4px 16px rgba(215,30,43,0.25)',
                }}>
                  <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                    <path d="M14 4v16M6 12l8-8 8 8" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M4 22h20" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>Drop your file here</h2>
                <p style={{ fontSize: 14, color: 'var(--ink-3)', marginBottom: 20 }}>or click to browse</p>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                  {[
                    { label: 'CSV',  type: 'structured'   },
                    { label: 'XLSX', type: 'structured'   },
                    { label: 'PDF',  type: 'unstructured' },
                    { label: 'DOCX', type: 'unstructured' },
                    { label: 'JSON', type: 'semi'         },
                    { label: 'XML',  type: 'semi'         },
                  ].map(f => (
                    <span key={f.label} style={{
                      fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 4,
                      background: f.type === 'structured' ? '#EFF6FF' : f.type === 'unstructured' ? 'var(--wf-red-light)' : '#FEF9EE',
                      color: f.type === 'structured' ? '#1D4ED8' : f.type === 'unstructured' ? 'var(--wf-red)' : '#B45309',
                      border: `0.5px solid ${f.type === 'structured' ? 'rgba(29,78,216,0.2)' : f.type === 'unstructured' ? 'rgba(215,30,43,0.2)' : 'rgba(180,83,9,0.2)'}`,
                    }}>
                      {f.label}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>

          {error && (
            <div style={{
              marginTop: 16, padding: '12px 16px',
              background: '#FEF2F2', border: '0.5px solid rgba(204,34,34,0.3)',
              borderRadius: 'var(--radius-md)', color: '#CC2222', fontSize: 14,
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 48 }}>
            {[
              { icon: '📊', title: 'Structured Profiling', desc: 'Full statistical analysis, PII detection, semantic typing, health scores, and drift detection for CSV and Excel files.', border: 'rgba(29,78,216,0.15)' },
              { icon: '📄', title: 'Document Intelligence', desc: 'Extract critical data elements, generate tiered summaries, and build a data dictionary from any PDF or Word document.', border: 'rgba(215,30,43,0.15)' },
              { icon: '{ }', title: 'Semi-structured', desc: 'Profile JSON and XML feeds. Schema inference, field coverage, and type detection across batches.', border: 'rgba(180,83,9,0.15)' },
            ].map(card => (
              <div key={card.title} style={{
                background: 'var(--surface)',
                border: `0.5px solid ${card.border}`,
                borderRadius: 'var(--radius-lg)',
                padding: '20px',
                boxShadow: 'var(--shadow-sm)',
                borderTop: `3px solid ${card.border.replace('0.15', '0.6')}`,
              }}>
                <div style={{ fontSize: 24, marginBottom: 10 }}>{card.icon}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>{card.title}</div>
                <div style={{ fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.6 }}>{card.desc}</div>
              </div>
            ))}
          </div>

        </div>
      </div>

      {/* ── DATAFORGE TAB ── */}
      <div style={{ display: activeTab === 'dataforge' ? 'block' : 'none' }}>
        <DataForge />
      </div>

      <LensBot profile={null} />
    </div>
  )
}
