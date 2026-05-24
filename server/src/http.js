export function ok(res, data) {
  res.json({ success: true, data })
}

export function fail(res, status, code, message) {
  res.status(status).json({ success: false, error: { code, message } })
}

export function csvCell(value) {
  const text = String(value ?? '')
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}
