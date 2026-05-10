'use client'
import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { profileFile } from '@/lib/api'
import LensBot from '@/components/LensBot'
import DataForge from '@/components/DataForge'

const SUPPORTED = ['.csv', '.xlsx', '.xls', '.pdf', '.docx', '.json', '.xml']

// ── 3D illustration (scaled for compact hero) ─────────────
function HeroIllustration() {
  return (
    <svg viewBox="0 0 460 270" fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{ width: '100%', height: '100%', maxHeight: 240 }}>
      <defs>
        <radialGradient id="bgGlow2" cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor="#FFD6D6" stopOpacity="0.45"/>
          <stop offset="100%" stopColor="#FFFFFF"  stopOpacity="0"/>
        </radialGradient>
        <linearGradient id="ptTop" x1="0" y1="0" x2="0.2" y2="1">
          <stop offset="0%" stopColor="#F04050"/>
          <stop offset="100%" stopColor="#D71E2B"/>
        </linearGradient>
        <linearGradient id="ptSide" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#C41E2A"/>
          <stop offset="100%" stopColor="#8B1018"/>
        </linearGradient>
        <filter id="cs2" x="-15%" y="-15%" width="130%" height="130%">
          <feDropShadow dx="0" dy="8"  stdDeviation="14" floodColor="#D71E2B" floodOpacity="0.07"/>
          <feDropShadow dx="0" dy="2"  stdDeviation="4"  floodColor="#000"     floodOpacity="0.07"/>
        </filter>
        <filter id="fs2" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="7" floodColor="#000" floodOpacity="0.09"/>
        </filter>
      </defs>

      <ellipse cx="230" cy="135" rx="205" ry="165" fill="url(#bgGlow2)"/>

      {/* dot grid */}
      {[0,1,2,3].map(r => [0,1,2,3,4,5].map(c => (
        <circle key={`${r}${c}`} cx={65+c*66} cy={40+r*46} r="1.3" fill="#D71E2B" opacity="0.07"/>
      )))}

      {/* platform */}
      <ellipse cx="230" cy="242" rx="106" ry="13" fill="#D71E2B" opacity="0.1"/>
      <rect    x="136" y="220" width="188" height="21" rx="2" fill="url(#ptSide)"/>
      <ellipse cx="230" cy="220" rx="94"  ry="15" fill="url(#ptTop)"/>
      <ellipse cx="216" cy="216" rx="54"  ry="7"  fill="white" opacity="0.16"/>

      {/* main card */}
      <g filter="url(#cs2)">
        <rect x="146" y="68" width="170" height="150" rx="13" fill="white"/>
        <rect x="146" y="68" width="170" height="5"   rx="2.5" fill="#D71E2B"/>
        <circle cx="162" cy="84" r="3.5" fill="#F5F5F5"/>
        <circle cx="175" cy="84" r="3.5" fill="#F5F5F5"/>
        <circle cx="188" cy="84" r="3.5" fill="#F5F5F5"/>
        <rect x="162" y="96"  width="80"  height="6.5" rx="3"   fill="#EDECEA"/>
        <rect x="162" y="108" width="124" height="4.5" rx="2.25" fill="#F3F2F0"/>
        <rect x="162" y="118" width="104" height="4.5" rx="2.25" fill="#F3F2F0"/>
        <rect x="162" y="132" width="15" height="44" rx="3" fill="#D71E2B" opacity="0.76"/>
        <rect x="182" y="144" width="15" height="32" rx="3" fill="#D71E2B" opacity="0.50"/>
        <rect x="202" y="136" width="15" height="40" rx="3" fill="#D71E2B" opacity="0.86"/>
        <rect x="222" y="148" width="15" height="28" rx="3" fill="#FFCD41" opacity="0.76"/>
        <rect x="242" y="133" width="15" height="43" rx="3" fill="#D71E2B" opacity="0.60"/>
        <rect x="262" y="142" width="15" height="34" rx="3" fill="#FFCD41" opacity="0.53"/>
        <rect x="162" y="186" width="136" height="1"   fill="#F0EFED"/>
        <rect x="162" y="192" width="96"  height="4.5" rx="2.25" fill="#F3F2F0"/>
        <rect x="266" y="192" width="28"  height="4.5" rx="2.25" fill="#FFCD41" opacity="0.5"/>
      </g>

      {/* pie card */}
      <g filter="url(#fs2)">
        <rect x="50" y="78" width="80" height="76" rx="12" fill="white"/>
        <circle cx="90" cy="112" r="21" stroke="#EDECEA" strokeWidth="11" fill="none"/>
        <circle cx="90" cy="112" r="21" stroke="#D71E2B" strokeWidth="11" fill="none" strokeDasharray="42 90" strokeDashoffset="22"/>
        <circle cx="90" cy="112" r="21" stroke="#FFCD41" strokeWidth="11" fill="none" strokeDasharray="26 106" strokeDashoffset="-20"/>
        <circle cx="90" cy="112" r="21" stroke="#1D4ED8" strokeWidth="11" fill="none" strokeDasharray="16 116" strokeDashoffset="-46"/>
        <rect x="66" y="145" width="48" height="4.5" rx="2.25" fill="#F3F2F0"/>
      </g>

      {/* bar card */}
      <g filter="url(#fs2)">
        <rect x="332" y="84" width="86" height="68" rx="12" fill="white"/>
        <rect x="344" y="96"  width="62" height="4.5" rx="2.25" fill="#F3F2F0"/>
        <rect x="344" y="116" width="12" height="24" rx="3" fill="#D71E2B" opacity="0.72"/>
        <rect x="360" y="124" width="12" height="16" rx="3" fill="#FFCD41" opacity="0.82"/>
        <rect x="376" y="110" width="12" height="30" rx="3" fill="#1D4ED8" opacity="0.60"/>
        <rect x="392" y="118" width="12" height="22" rx="3" fill="#D71E2B" opacity="0.50"/>
      </g>

      {/* json chip */}
      <g filter="url(#fs2)">
        <rect x="44" y="175" width="72" height="26" rx="13" fill="white"/>
        <text x="59" y="192" fill="#B45309" fontSize="14" fontWeight="700" fontFamily="monospace">{ }</text>
      </g>

      {/* health chip */}
      <g filter="url(#fs2)">
        <rect x="336" y="177" width="90" height="26" rx="13" fill="white"/>
        <circle cx="353" cy="190" r="7" fill="#EAF7F0"/>
        <text x="349" y="194" fill="#1A7F4B" fontSize="9" fontWeight="700">✓</text>
        <rect x="366" y="185" width="46" height="4.5" rx="2.25" fill="#F3F2F0"/>
        <rect x="366" y="193" width="32" height="3.5" rx="1.75" fill="#FFCD41" opacity="0.6"/>
      </g>

      {/* dots */}
      <circle cx="124" cy="62"  r="6.5" fill="#D71E2B" opacity="0.28"/>
      <circle cx="118" cy="64"  r="3"   fill="#D71E2B" opacity="0.44"/>
      <circle cx="376" cy="65"  r="5"   fill="#FFCD41" opacity="0.50"/>
      <circle cx="400" cy="170" r="5.5" fill="#1D4ED8" opacity="0.20"/>
      <circle cx="92"  cy="228" r="3.5" fill="#D71E2B" opacity="0.16"/>
      <circle cx="362" cy="226" r="7"   fill="#FFCD41" opacity="0.26"/>
    </svg>
  )
}

// ── Card icons ────────────────────────────────────────────
function IconStructured() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
      <rect width="36" height="36" rx="9" fill="url(#sg2)"/>
      <defs><linearGradient id="sg2" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#6366F1"/><stop offset="100%" stopColor="#3B82F6"/>
      </linearGradient></defs>
      <rect x="7"  y="22" width="6" height="9"  rx="2" fill="white" opacity="0.9"/>
      <rect x="15" y="16" width="6" height="15" rx="2" fill="white"/>
      <rect x="23" y="11" width="6" height="20" rx="2" fill="white" opacity="0.8"/>
    </svg>
  )
}
function IconDocument() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
      <rect width="36" height="36" rx="9" fill="url(#dg2)"/>
      <defs><linearGradient id="dg2" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#F43F5E"/><stop offset="100%" stopColor="#D71E2B"/>
      </linearGradient></defs>
      <rect x="10" y="7"  width="16" height="22" rx="3" fill="white" opacity="0.2"/>
      <rect x="12" y="9"  width="16" height="22" rx="3" fill="white" opacity="0.9"/>
      <rect x="16" y="14" width="9"  height="1.5" rx="0.75" fill="#D71E2B" opacity="0.5"/>
      <rect x="16" y="18" width="13" height="1.5" rx="0.75" fill="#D71E2B" opacity="0.4"/>
      <rect x="16" y="22" width="11" height="1.5" rx="0.75" fill="#D71E2B" opacity="0.35"/>
      <rect x="16" y="26" width="7"  height="1.5" rx="0.75" fill="#D71E2B" opacity="0.3"/>
    </svg>
  )
}
function IconSemi() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
      <rect width="36" height="36" rx="9" fill="url(#smg2)"/>
      <defs><linearGradient id="smg2" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#F59E0B"/><stop offset="100%" stopColor="#D97706"/>
      </linearGradient></defs>
      <text x="4" y="26" fill="white" fontSize="20" fontWeight="800" fontFamily="monospace">{`{}`}</text>
    </svg>
  )
}

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
    const msgs = isUnstructured
      ? ['Analysing document structure...','Extracting text from all pages...','Running LLM extraction...','Generating executive summary...','Building data dictionary...','Finalising profile...']
      : ['Loading dataset...','Profiling columns...','Computing statistics...','Detecting PII and semantic types...','Calculating health score...']
    let i = 0
    setProgress(msgs[0])
    const iv = setInterval(() => { i = Math.min(i+1, msgs.length-1); setProgress(msgs[i]) },
      isUnstructured ? 12000 : 800)
    try {
      const contract = await profileFile(file)
      clearInterval(iv)
      router.push(`/profile/${contract.profile_id}`)
    } catch (e: any) {
      clearInterval(iv)
      setError(e.message || 'Profiling failed. Please try again.')
      setUploading(false)
      setProgress('')
    }
  }, [router])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]; if (f) handleFile(f)
  }, [handleFile])

  const FILE_CHIPS = [
    { label:'CSV',  c:'#1D4ED8', b:'rgba(29,78,216,0.3)'  },
    { label:'XLSX', c:'#1D4ED8', b:'rgba(29,78,216,0.3)'  },
    { label:'PDF',  c:'#D71E2B', b:'rgba(215,30,43,0.3)'  },
    { label:'DOCX', c:'#D71E2B', b:'rgba(215,30,43,0.3)'  },
    { label:'JSON', c:'#B45309', b:'rgba(180,83,9,0.3)'   },
    { label:'XML',  c:'#B45309', b:'rgba(180,83,9,0.3)'   },
  ]

  const CARDS = [
    { Icon: IconStructured, title:'Structured Profiling',    arrow:'#6366F1',
      desc:'Statistical analysis, PII detection, health scores & drift detection for CSV & Excel.' },
    { Icon: IconDocument,   title:'Unstructured Document Profiling', arrow:'#D71E2B',
      desc:'Extract key data elements, generate summaries & validate FR Y-14Q from PDF & DOCX.' },
    { Icon: IconSemi,       title:'Semi Structured Data Profiling', arrow:'#D97706',
      desc:'Profile JSON and XML feeds with schema inference, field coverage & cross-column AI.' },
  ]

  return (
    <div>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .fc:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.1) !important; }
        .fc { transition: transform 0.18s ease, box-shadow 0.18s ease; }
      `}</style>

      {/* ── PROFILER ── */}
      <div style={{
        display: activeTab === 'profiler' ? 'flex' : 'none',
        flexDirection: 'column',
        height: 'calc(100vh - 60px)',
        overflow: 'hidden',
        background: 'linear-gradient(145deg,#FFF4F4 0%,#FFFFFF 52%,#F4F4FF 100%)',
      }}>

        {/* ════ ROW 1 — HERO (44%) ════ */}
        <div style={{
          flex: '0 0 44%', minHeight: 0,
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          alignItems: 'center',
          padding: '24px 52px 16px',
          borderBottom: '1px solid rgba(0,0,0,0.05)',
        }}>

          {/* Left — text */}
          <div>
            {/* chip */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'var(--wf-red-light)', color: 'var(--wf-red)',
              fontSize: 9.5, fontWeight: 600, padding: '3px 11px', borderRadius: 20,
              letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14,
              border: '0.5px solid rgba(215,30,43,0.2)',
            }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--wf-red)' }}/>
              Wells Fargo CDO · Data Intelligence
            </div>

            {/* headline */}
            <h1 style={{
              fontFamily: 'var(--font-display)', fontWeight: 800,
              fontSize: 'clamp(28px, 3vw, 42px)',
              lineHeight: 1.1, letterSpacing: '-0.025em', marginBottom: 12,
            }}>
              <span style={{ color: '#0F0F0F', display: 'block' }}>Profile anything.</span>
              <span style={{
                display: 'block',
                background: 'linear-gradient(90deg,#D71E2B 0%,#FF5C3A 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              }}>
                Understand everything.
              </span>
            </h1>

            {/* tagline */}
            <p style={{ fontSize: 13, color: '#5A5A6E', lineHeight: 1.65, maxWidth: 400, marginBottom: 20 }}>
              Lens auto-detects your file type and returns structured intelligence —
              health scores, extracted facts, summaries, and a full data dictionary.
            </p>

            {/* pills */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              {[
                { icon:'🔍', label:'Auto-detects file type',    bg:'#FEF2F2' },
                { icon:'✨', label:'Extracts critical insights', bg:'#FEFCE8' },
                { icon:'🛡️', label:'Built for enterprise',      bg:'#F0FDF4' },
              ].map((p, i) => (
                <div key={p.label} style={{ display:'flex', alignItems:'center', gap: 14 }}>
                  {i > 0 && <div style={{ width:1, height:24, background:'rgba(0,0,0,0.1)' }}/>}
                  <div style={{ display:'flex', alignItems:'center', gap: 6 }}>
                    <span style={{
                      width:24, height:24, borderRadius:6, background: p.bg,
                      display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize:12, flexShrink:0,
                    }}>{p.icon}</span>
                    <span style={{ fontSize:12, fontWeight:500, color:'#3A3A4A', whiteSpace:'nowrap' }}>{p.label}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right — illustration */}
          <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'100%' }}>
            <HeroIllustration />
          </div>
        </div>

        {/* ════ ROW 2 — UPLOAD (26%) ════ */}
        <div style={{
          flex: '0 0 26%', minHeight: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '12px 52px',
          background: '#FFFFFF',
          borderBottom: '1px solid rgba(0,0,0,0.05)',
        }}>
          <div style={{ width: '100%', maxWidth: 660 }}>
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => !uploading && inputRef.current?.click()}
              style={{
                border: `1.5px dashed ${dragging ? '#D71E2B' : 'rgba(0,0,0,0.13)'}`,
                borderRadius: 14,
                background: dragging ? '#FFF5F5' : '#FAFAFA',
                padding: '18px 32px',
                textAlign: 'center',
                cursor: uploading ? 'default' : 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: '0 1px 10px rgba(0,0,0,0.055)',
                position: 'relative',
              }}
            >
              <input ref={inputRef} type="file" accept={SUPPORTED.join(',')}
                style={{ display:'none' }}
                onChange={e => { const f=e.target.files?.[0]; if(f) handleFile(f) }}/>

              {uploading ? (
                <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:16 }}>
                  <div style={{
                    width:36, height:36, borderRadius:'50%', flexShrink:0,
                    border:'3px solid #F0F0F0', borderTop:'3px solid #D71E2B',
                    animation:'spin 1s linear infinite',
                  }}/>
                  <div style={{ textAlign:'left' }}>
                    <p style={{ fontSize:14, fontWeight:500, color:'#1A1A2E', marginBottom:3 }}>{progress}</p>
                    <p style={{ fontSize:11, color:'#9090A0' }}>May take 1–2 min for large documents</p>
                  </div>
                </div>
              ) : (
                <div style={{ display:'flex', alignItems:'center', gap:20 }}>
                  {/* icon */}
                  <div style={{
                    width:44, height:44, background:'#D71E2B', borderRadius:'50%', flexShrink:0,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    boxShadow:'0 4px 14px rgba(215,30,43,0.28)',
                  }}>
                    <svg width="20" height="20" viewBox="0 0 28 28" fill="none">
                      <path d="M14 4v16M6 12l8-8 8 8" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M4 22h20" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
                    </svg>
                  </div>
                  {/* text */}
                  <div style={{ textAlign:'left', flex:1 }}>
                    <div style={{ fontSize:15, fontWeight:600, color:'#1A1A2E', marginBottom:3 }}>Drop your file here</div>
                    <div style={{ fontSize:12, color:'#9090A0' }}>or click to browse</div>
                  </div>
                  {/* chips */}
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap', justifyContent:'flex-end' }}>
                    {FILE_CHIPS.map(f => (
                      <span key={f.label} style={{
                        fontSize:11, fontWeight:500, padding:'3px 12px', borderRadius:20,
                        color:f.c, border:`1px solid ${f.b}`, background:'transparent',
                      }}>{f.label}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div style={{
                marginTop:8, padding:'8px 14px',
                background:'#FEF2F2', border:'0.5px solid rgba(204,34,34,0.3)',
                borderRadius:8, color:'#CC2222', fontSize:12,
              }}>{error}</div>
            )}
          </div>
        </div>

        {/* ════ ROW 3 — FEATURE CARDS (remaining) ════ */}
        <div style={{
          flex:1, minHeight:0,
          display:'grid', gridTemplateColumns:'repeat(3,1fr)',
          gap:16,
          padding:'14px 52px 18px',
          background:'#F8F8FA',
          alignItems:'stretch',
        }}>
          {CARDS.map(card => (
            <div key={card.title} className="fc" style={{
              background:'white',
              border:'0.5px solid rgba(0,0,0,0.07)',
              borderRadius:13,
              padding:'16px 18px 42px',
              boxShadow:'0 2px 8px rgba(0,0,0,0.05)',
              position:'relative',
              overflow:'hidden',
            }}>
              <card.Icon />
              <div style={{ fontSize:13.5, fontWeight:700, color:'#1A1A2E', margin:'10px 0 6px' }}>
                {card.title}
              </div>
              <div style={{ fontSize:12, color:'#6B6B80', lineHeight:1.6 }}>
                {card.desc}
              </div>
              {/* arrow */}
              <div style={{
                position:'absolute', bottom:14, right:16,
                width:26, height:26, borderRadius:'50%',
                background:card.arrow,
                display:'flex', alignItems:'center', justifyContent:'center',
                boxShadow:`0 2px 8px ${card.arrow}40`,
              }}>
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                  <path d="M2 7h10M8 3l4 4-4 4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>
          ))}
        </div>

      </div>

      {/* ── DATAFORGE ── */}
      <div style={{ display: activeTab === 'dataforge' ? 'block' : 'none' }}>
        <DataForge />
      </div>

      <LensBot profile={null} />
    </div>
  )
}
