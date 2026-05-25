import crypto from 'node:crypto'

export function requestContext(req, _res, next) {
  req.requestId = req.headers['x-request-id'] || crypto.randomUUID()
  next()
}

export function requestLogger(req, res, next) {
  const startedAt = Date.now()
  res.setHeader('X-Request-Id', req.requestId)

  res.on('finish', () => {
    logInfo('http_request', {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
      userRole: req.user?.role || null,
      userId: req.user?.id || null,
    })
  })

  next()
}

export function logInfo(event, data = {}) {
  console.log(JSON.stringify({ level: 'info', event, time: new Date().toISOString(), ...data }))
}

export function logWarn(event, data = {}) {
  console.warn(JSON.stringify({ level: 'warn', event, time: new Date().toISOString(), ...data }))
}

export function logError(event, error, data = {}) {
  console.error(JSON.stringify({
    level: 'error',
    event,
    time: new Date().toISOString(),
    message: error?.message || String(error),
    stack: process.env.NODE_ENV === 'production' ? undefined : error?.stack,
    ...data,
  }))
}
