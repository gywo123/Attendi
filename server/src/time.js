const SEOUL_TIME_ZONE = 'Asia/Seoul'

function seoulParts(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SEOUL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const get = (type) => parts.find((part) => part.type === type)?.value || '00'

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  }
}

export function now() {
  return new Date().toISOString()
}

export function today(value = new Date()) {
  const parts = seoulParts(value)
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function toIsoAtDateTime(date, time = '') {
  if (!date) return now()
  const safeTime = /^\d{2}:\d{2}$/.test(String(time)) ? time : '09:00'
  return new Date(`${date}T${safeTime}:00+09:00`).toISOString()
}
