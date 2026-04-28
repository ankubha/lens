'use client'
import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'

export default function Navbar() {
  const [active, setActive] = useState('profiles')

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

        {/* LEFT — Wells Fargo logo + Lens wordmark — clickable, goes home */}
        <Link
          href="/"
          className="nav-logo"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            textDecoration: 'none',
          }}
        >
          {/* Wells Fargo horizontal logo */}
          <Image
            src="/wf-logo-horizontal.png"
            alt="Wells Fargo"
            width={155}
            height={38}
            style={{ objectFit: 'contain' }}
            priority
          />

          {/* Vertical divider */}
          <div style={{
            width: 1,
            height: 30,
            background: 'rgba(255,255,255,0.28)',
            flexShrink: 0,
          }}/>

          {/* Lens wordmark + subtitle */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={{
              fontFamily: 'var(--font-display)',
              fontSize: 21,
              fontWeight: 700,
              color: 'white',
              letterSpacing: '-0.01em',
              lineHeight: 1,
            }}>
              Lens
            </span>
            <span style={{
              fontSize: 10,
              color: 'rgba(255,255,255,0.85)',
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              lineHeight: 1,
            }}>
              CDO Intelligence
            </span>
          </div>
        </Link>

        {/* CENTER — Nav items */}
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { id: 'profiles',  label: 'Profiles'  },
            { id: 'portfolio', label: 'Portfolio' },
            { id: 'qa',        label: 'Q&A'        },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => setActive(item.id)}
              style={{
                background: active === item.id
                  ? 'rgba(255,205,65,0.18)'
                  : 'transparent',
                border: active === item.id
                  ? '1px solid rgba(255,205,65,0.5)'
                  : '1px solid transparent',
                color: active === item.id
                  ? 'white'
                  : 'rgba(255,255,255,0.7)',
                padding: '6px 16px',
                borderRadius: 'var(--radius-sm)',
                fontSize: 13,
                fontWeight: active === item.id ? 500 : 400,
                cursor: 'pointer',
                fontFamily: 'var(--font-body)',
                transition: 'all 0.15s ease',
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* RIGHT — POC credit + API status */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 3,
        }}>
          <span style={{
            fontSize: 11,
            color: 'var(--wf-gold)',
            letterSpacing: '0.03em',
            fontWeight: 500,
          }}>
            POC by Anubhav Bhattacharya
          </span>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}>
            <div style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#4ade80',
              boxShadow: '0 0 0 2px rgba(74,222,128,0.25)',
              flexShrink: 0,
            }}/>
            <span style={{
              fontSize: 11,
              color: 'rgba(255,255,255,0.5)',
            }}>
              API Connected
            </span>
          </div>
        </div>

      </div>

      {/* Gold rule bottom accent */}
      <div style={{
        height: 2,
        background: 'linear-gradient(90deg, var(--wf-gold) 0%, var(--wf-gold-dark) 60%, transparent 100%)',
        opacity: 0.7,
      }}/>

    </nav>
  )
}