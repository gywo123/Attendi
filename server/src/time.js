export function now() {
  return new Date().toISOString()
}

export function today() {
  return now().slice(0, 10)
}

export function toIsoAtDateTime(date, time = '') {
  if (!date) return now()
  const safeTime = /^\d{2}:\d{2}$/.test(String(time)) ? time : '09:00'
  return new Date(`${date}T${safeTime}:00`).toISOString()
}
