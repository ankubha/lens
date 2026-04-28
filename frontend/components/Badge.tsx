type Variant = 'pii' | 'confidential' | 'restricted' | 'internal' | 'public' |
               'structured' | 'unstructured' | 'semi' |
               'high' | 'medium' | 'low' |
               'success' | 'warning' | 'danger' | 'info' | 'neutral'

interface Props {
  variant: Variant
  label: string
  dot?: boolean
}

const styles: Record<Variant, { bg: string; color: string; border: string }> = {
  pii:          { bg: '#FEF2F2', color: '#CC2222', border: 'rgba(204,34,34,0.25)' },
  confidential: { bg: '#FFFAED', color: '#8a6800', border: 'rgba(255,205,65,0.4)' },
  restricted:   { bg: '#FEF2F2', color: '#CC2222', border: 'rgba(204,34,34,0.25)' },
  internal:     { bg: '#F0EFED', color: '#4A4A4A', border: '#E5E3DF' },
  public:       { bg: '#EAF7F0', color: '#1A7F4B', border: 'rgba(26,127,75,0.25)' },
  structured:   { bg: '#EFF6FF', color: '#1D4ED8', border: 'rgba(29,78,216,0.2)' },
  unstructured: { bg: '#F5E6E7', color: '#D71E2B', border: 'rgba(215,30,43,0.25)' },
  semi:         { bg: '#FEF9EE', color: '#B45309', border: 'rgba(180,83,9,0.2)' },
  high:         { bg: '#EAF7F0', color: '#1A7F4B', border: 'rgba(26,127,75,0.25)' },
  medium:       { bg: '#FEF9EE', color: '#B45309', border: 'rgba(180,83,9,0.2)' },
  low:          { bg: '#FEF2F2', color: '#CC2222', border: 'rgba(204,34,34,0.25)' },
  success:      { bg: '#EAF7F0', color: '#1A7F4B', border: 'rgba(26,127,75,0.25)' },
  warning:      { bg: '#FEF9EE', color: '#B45309', border: 'rgba(180,83,9,0.2)' },
  danger:       { bg: '#FEF2F2', color: '#CC2222', border: 'rgba(204,34,34,0.25)' },
  info:         { bg: '#EFF6FF', color: '#1D4ED8', border: 'rgba(29,78,216,0.2)' },
  neutral:      { bg: '#F0EFED', color: '#4A4A4A', border: '#E5E3DF' },
}

export default function Badge({ variant, label, dot }: Props) {
  const s = styles[variant] || styles.neutral
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      fontSize: 11,
      fontWeight: 500,
      padding: '2px 8px',
      borderRadius: 4,
      background: s.bg,
      color: s.color,
      border: `0.5px solid ${s.border}`,
      whiteSpace: 'nowrap',
      fontFamily: 'var(--font-body)',
    }}>
      {dot && (
        <span style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: s.color,
          flexShrink: 0,
        }}/>
      )}
      {label}
    </span>
  )
}