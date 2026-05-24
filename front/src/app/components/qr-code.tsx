import { useEffect, useState } from 'react'
import QR from 'qrcode'

interface QRCodeProps {
  value: string
  size?: number
  dim?: boolean
}

export function QRCode({ value, size = 196, dim = false }: QRCodeProps) {
  const [src, setSrc] = useState('')

  useEffect(() => {
    let alive = true
    QR.toDataURL(value || 'attendi-empty', {
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#111827',
        light: '#ffffff',
      },
    }).then((url) => {
      if (alive) setSrc(url)
    })
    return () => {
      alive = false
    }
  }, [size, value])

  if (!src) {
    return <div style={{ width: size, height: size }} className="bg-white" />
  }

  return <img src={src} width={size} height={size} className={dim ? 'opacity-20' : ''} alt="출석 QR 코드" />
}

interface CircleTimerProps {
  seconds: number
  total?: number
  size?: number
}

export function CircleTimer({ seconds, total = 30, size = 52 }: CircleTimerProps) {
  const r = (size - 6) / 2
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r
  const pct = seconds / total
  const offset = circumference * (1 - pct)

  const color = seconds <= 5 ? '#ef4444' : seconds <= 10 ? '#f59e0b' : '#111827'

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e7eb" strokeWidth={4} />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={4}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s linear, stroke 0.3s' }}
        />
      </svg>
      <span
        className="absolute text-xs font-medium"
        style={{ color, fontVariantNumeric: 'tabular-nums' }}
      >
        {seconds}
      </span>
    </div>
  )
}
