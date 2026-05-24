import { Clock } from 'lucide-react'

type TimeInputProps = {
  value: string
  disabled: boolean
  onChange: (value: string) => void
}

function sanitizeTimeInput(value: string) {
  return value.replace(/[^\d:]/g, '').slice(0, 5)
}

function normalizeTimeInput(value: string) {
  const match = value.match(/^(\d{1,2}):?(\d{2})$/)
  if (!match) return value
  const hour = Math.min(23, Number(match[1]))
  const minute = Math.min(59, Number(match[2]))
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export function TimeInput({ value, disabled, onChange }: TimeInputProps) {
  return (
    <label
      className={`inline-flex h-9 w-28 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 ${
        disabled ? 'opacity-45' : 'shadow-sm'
      }`}
      title="출석 처리 시간"
    >
      <Clock size={12} className="shrink-0 text-gray-400" />
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-2][0-9]:[0-5][0-9]"
        placeholder="09:00"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(sanitizeTimeInput(event.target.value))}
        onBlur={(event) => onChange(normalizeTimeInput(event.target.value))}
        className="w-14 bg-transparent text-sm font-medium tabular-nums text-gray-800 outline-none placeholder:text-gray-300 disabled:cursor-not-allowed"
        aria-label="출석 처리 시간"
      />
    </label>
  )
}
