interface Props {
  score: number
  breakdown?: Record<string, number>
  size?: 'sm' | 'lg'
}

export default function HealthGauge({ score, breakdown, size = 'lg' }: Props) {
  const r = size === 'lg' ? 52 : 32
  const stroke = size === 'lg' ? 8 : 6
  const circumference = 2 * Math.PI * r
  const offset = circumference - (score / 100) * circumference
  const dim = (r + stroke) * 2
  const cx = dim / 2
  const cy = dim / 2

  const color = score >= 85 ? '#1A7F4B' : score >= 65 ? '#D71E2B' : '#CC2222'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
      {/* Circle */}
      <div style={{ position: 'relative', width: dim, height: dim, flexShrink: 0 }}>
        <svg width={dim} height={dim} style={{ transform: 'rotate(-90deg)' }}>
          <circle
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke="var(--surface-tertiary)"
            strokeWidth={stroke}
          />
          <circle
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1s ease' }}
          />
        </svg>
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
        }}>
          <div style={{
            fontSize: size === 'lg' ? 22 : 14,
            fontWeight: 600,
            color,
            lineHeight: 1,
            fontFamily: 'var(--font-display)',
          }}>
            {score.toFixed(2)}
          </div>
          {size === 'lg' && (
            <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 2 }}>/100</div>
          )}
        </div>
      </div>

      {/* Breakdown */}
      {breakdown && size === 'lg' && (
        <div style={{ flex: 1, minWidth: 180 }}>
          {Object.entries(breakdown).map(([key, val]) => (
            <div key={key} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 8,
            }}>
              <span style={{
                fontSize: 11,
                color: 'var(--ink-3)',
                width: 130,
                textTransform: 'capitalize',
                flexShrink: 0,
              }}>
                {key.replace(/_/g, ' ')}
              </span>
              <div style={{
                flex: 1,
                height: 4,
                background: 'var(--surface-tertiary)',
                borderRadius: 2,
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%',
                  width: `${val}%`,
                  background: val >= 85 ? '#1A7F4B' : 'var(--wf-red)',
                  borderRadius: 2,
                  transition: 'width 1s ease',
                }}/>
              </div>
              <span style={{
                fontSize: 11,
                fontWeight: 500,
                color: 'var(--ink)',
                width: 36,
                textAlign: 'right',
              }}>
                {val.toFixed(2)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}