export class ApiError extends Error {
  constructor(status, code, message, details = []) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export function ok(res, data) {
  res.json({ success: true, data })
}

export function fail(res, status, code, message, details = []) {
  res.status(status).json({
    success: false,
    error: {
      code,
      message,
      requestId: res.req?.requestId,
      ...(details?.length ? { details } : {}),
    },
  })
}

export function throwHttp(status, code, message, details = []) {
  throw new ApiError(status, code, message, details)
}

export function csvCell(value) {
  const text = String(value ?? '')
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}
