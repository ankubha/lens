'use client'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'

export default function Navbar() {
  const router   = useRouter()
  const pathname = usePathname()

  // Active tab: 'profiler' or 'dataforge'
  // We store it in URL as ?tab=dataforge
  const isDataForge = typeof window !== 'undefined'
    && window.location.search.includes('tab=dataforge')

  const goTo = (tab: string) => {
    if (pathname !== '/') {
      router.push(`/?tab=${tab}`)
    } else {
      const url = new URL(window.location.href)
      url.searchParams.set('tab', tab)
      window.history.pushState({}, '', url)
      window.dispatchEvent(new Event('tabchange'))
    }
  }

  return (
    <nav style={{
      background: 'var(--wf-red)',
      borderBottom: '3px solid var(--wf-gold)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      <div style={{
        maxWidth: 1280,
        margin: '0 auto',
        padding: '0 24px',
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>

        {/* LEFT — logo + wordmark */}
        <Link
          href="/"
          className="nav-logo"
          style={{ display: 'flex', alignItems: 'center', gap: 16, textDecoration: 'none' }}
        >
          <Image
            src="/wf-logo-horizontal.png"
            alt="Wells Fargo"
            width={155} height={38}
            style={{ objectFit: 'contain' }}
            priority
          />
          <div style={{ width: 1, height: 30, background: 'rgba(255,255,255,0.28)', flexShrink: 0 }}/>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={{
              fontFamily: 'var(--font-display)', fontSize: 21, fontWeight: 700,
              color: 'white', letterSpacing: '-0.01em', lineHeight: 1,
            }}>Lens</span>
            <span style={{
              fontSize: 10, color: 'rgba(255,255,255,0.85)',
              letterSpacing: '0.07em', textTransform: 'uppercase', lineHeight: 1,
            }}>CDO Intelligence</span>
          </div>
        </Link>

        {/* CENTER — two tabs */}
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { id: 'profiler',   label: '📊 Profiler'   },
            { id: 'dataforge',  label: '⚡ DataForge'  },
          ].map(item => {
            const isActive = item.id === 'dataforge' ? isDataForge : !isDataForge
            return (
              <button
                key={item.id}
                onClick={() => goTo(item.id)}
                style={{
                  background: isActive ? 'rgba(255,205,65,0.18)' : 'transparent',
                  border: isActive ? '1px solid rgba(255,205,65,0.5)' : '1px solid transparent',
                  color: isActive ? 'white' : 'rgba(255,255,255,0.7)',
                  padding: '7px 20px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 13,
                  fontWeight: isActive ? 500 : 400,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-body)',
                  transition: 'all 0.15s ease',
                }}
              >
                {item.label}
              </button>
            )
          })}
        </div>

        {/* RIGHT — POC credit + status */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
          <span style={{ fontSize: 11, color: 'var(--wf-gold)', letterSpacing: '0.03em', fontWeight: 500 }}>
            POC by Anubhav Bhattacharya
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: '#4ade80', boxShadow: '0 0 0 2px rgba(74,222,128,0.25)',
            }}/>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>API Connected</span>
          </div>
        </div>

      </div>

      <div style={{
        height: 2,
        background: 'linear-gradient(90deg, var(--wf-gold) 0%, var(--wf-gold-dark) 60%, transparent 100%)',
        opacity: 0.7,
      }}/>
    </nav>
  )
}