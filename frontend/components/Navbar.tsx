'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

export default function Navbar() {
  const router   = useRouter()
  const pathname = usePathname()
  const [isDataForge, setIsDataForge] = useState(false)

  useEffect(() => {
    const sync = () => setIsDataForge(window.location.search.includes('tab=dataforge'))
    sync()
    window.addEventListener('tabchange', sync)
    window.addEventListener('popstate',  sync)
    return () => {
      window.removeEventListener('tabchange', sync)
      window.removeEventListener('popstate',  sync)
    }
  }, [])

  useEffect(() => {
    setIsDataForge(
      typeof window !== 'undefined' && window.location.search.includes('tab=dataforge')
    )
  }, [pathname])

  const goTo = (tab: string) => {
    if (tab === 'dataforge') {
      if (typeof window !== 'undefined' && pathname !== '/') {
        sessionStorage.setItem('profilerReturnUrl', window.location.href)
      }
      if (pathname !== '/') {
        router.push('/?tab=dataforge')
      } else {
        const url = new URL(window.location.href)
        url.searchParams.set('tab', 'dataforge')
        window.history.pushState({}, '', url)
        window.dispatchEvent(new Event('tabchange'))
      }
    } else {
      const returnUrl = typeof window !== 'undefined'
        ? sessionStorage.getItem('profilerReturnUrl')
        : null
      if (returnUrl) {
        sessionStorage.removeItem('profilerReturnUrl')
        router.push(returnUrl)
        return
      }
      if (pathname !== '/') {
        router.push('/?tab=profiler')
      } else {
        const url = new URL(window.location.href)
        url.searchParams.set('tab', 'profiler')
        window.history.pushState({}, '', url)
        window.dispatchEvent(new Event('tabchange'))
      }
    }
  }

  const tabs = [
    { id: 'profiler',  label: 'Profiler',  icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.6"/>
        <path d="M10.6 10.6L14 14" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"/>
        <path d="M3.8 7.8L5.2 5.8L6.6 7.2L8.6 4.8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    )},
    { id: 'dataforge', label: 'DataForge', icon: (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
        <ellipse cx="7" cy="3.8" rx="4.2" ry="1.7" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M2.8 3.8V10.2" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M11.2 3.8V7.5" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M2.8 10.2C2.8 11.14 4.69 11.9 7 11.9C7.7 11.9 8.36 11.82 8.94 11.68" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        <path d="M11.5 8L9.2 11.2H11.4L9.1 15" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    )},
  ]

  return (
    <>
      <style>{`
        .nav-tab-btn { transition: background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease; }
        .nav-tab-btn:hover:not(.nav-tab-active) { background: rgba(255,255,255,0.12) !important; color: white !important; }
        .nav-logo-link { transition: opacity 0.15s ease; }
        .nav-logo-link:hover { opacity: 0.85; }
      `}</style>

      <nav style={{
        background: 'linear-gradient(180deg, #D4202D 0%, #C21B28 100%)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: '0 2px 14px rgba(0,0,0,0.2)',
      }}>

        <div style={{
          maxWidth: 1400,
          margin: '0 auto',
          padding: '0 32px',
          height: 70,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 24,
        }}>

          {/* ── LEFT: WF logo + Lens identity ── */}
          <Link
            href="/"
            className="nav-logo-link"
            style={{ display: 'flex', alignItems: 'center', gap: 18, textDecoration: 'none', flexShrink: 0 }}
          >
            {/* Wells Fargo wordmark */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/wf-wordmark.png"
              alt="Wells Fargo"
              style={{ height: 110, width: 'auto', objectFit: 'contain', display: 'block' }}
            />

            <div style={{ width: 1.5, height: 34, background: 'rgba(255,255,255,0.25)', flexShrink: 0 }}/>

            {/* Lens wordmark + descriptors */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, userSelect: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 22, fontWeight: 800,
                  color: 'white',
                  letterSpacing: '-0.03em',
                  lineHeight: 1,
                  textShadow: '0 1px 4px rgba(0,0,0,0.15)',
                }}>
                  Lens
                </span>
                <span style={{
                  fontSize: 9, fontWeight: 700,
                  color: 'rgba(255,255,255,0.5)',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  border: '1px solid rgba(255,255,255,0.22)',
                  padding: '1px 5px',
                  borderRadius: 3,
                  lineHeight: '14px',
                }}>
                  BETA
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  fontSize: 10, fontWeight: 500,
                  color: 'rgba(255,255,255,0.7)',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  lineHeight: 1,
                }}>
                  CDO Intelligence
                </span>
                <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, lineHeight: 1 }}>·</span>
                <span style={{
                  fontSize: 10, fontWeight: 500,
                  color: 'rgba(255,255,255,0.55)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  lineHeight: 1,
                }}>
                  Data Profiling Assistant
                </span>
              </div>
            </div>
          </Link>

          {/* ── CENTER: tab switcher ── */}
          <div style={{
            marginRight: 'auto',
            marginLeft: 80,
            display: 'flex',
            alignItems: 'center',
            background: 'rgba(0,0,0,0.22)',
            borderRadius: 12,
            padding: '4px',
            gap: 2,
            border: '1px solid rgba(255,255,255,0.12)',
            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.25)',
            flexShrink: 0,
          }}>
            {tabs.map(tab => {
              const active = tab.id === 'dataforge' ? isDataForge : !isDataForge
              return (
                <button
                  key={tab.id}
                  onClick={() => goTo(tab.id)}
                  className={`nav-tab-btn${active ? ' nav-tab-active' : ''}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 24px',
                    borderRadius: 8,
                    border: 'none',
                    background: active ? 'rgba(255,255,255,0.97)' : 'transparent',
                    color: active ? '#C21B28' : 'rgba(255,255,255,0.62)',
                    fontSize: 13,
                    fontWeight: active ? 700 : 400,
                    cursor: 'pointer',
                    fontFamily: 'var(--font-body)',
                    letterSpacing: active ? '-0.01em' : '0.01em',
                    whiteSpace: 'nowrap',
                    boxShadow: active ? '0 1px 6px rgba(0,0,0,0.2)' : 'none',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', opacity: active ? 1 : 0.65 }}>
                    {tab.icon}
                  </span>
                  {tab.label}
                </button>
              )
            })}
          </div>

          {/* ── RIGHT: POC credit ── */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexShrink: 0,
          }}>
            <div style={{ width: 1.5, height: 32, background: 'rgba(255,255,255,0.2)' }}/>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Avatar */}
              <div style={{
                width: 34, height: 34,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.18)',
                border: '2px solid rgba(255,255,255,0.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 800,
                color: 'white',
                letterSpacing: '-0.02em',
                flexShrink: 0,
                boxShadow: '0 1px 6px rgba(0,0,0,0.15)',
              }}>
                AB
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'white',
                  letterSpacing: '-0.01em',
                  lineHeight: 1,
                }}>
                  POC by Anubhav Bhattacharya
                </span>
                <span style={{
                  fontSize: 10,
                  color: 'rgba(255,255,255,0.5)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  lineHeight: 1,
                  fontWeight: 500,
                }}>
                  Chief Data Office
                </span>
              </div>
            </div>
          </div>

        </div>

        {/* Gold bottom line */}
        <div style={{
          height: 4,
          background: 'linear-gradient(90deg, var(--wf-gold-dark) 0%, var(--wf-gold) 50%, var(--wf-gold-dark) 100%)',
        }}/>

      </nav>
    </>
  )
}
