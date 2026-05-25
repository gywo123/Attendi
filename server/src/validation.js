export class ValidationError extends Error {
  constructor(message, details = []) {
    super(message)
    this.name = 'ValidationError'
    this.status = 400
    this.code = 'VALIDATION_ERROR'
    this.details = Array.isArray(details) ? details : [details]
  }
}

export function assertObject(value, message = '요청 본문 형식이 올바르지 않습니다.') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(message)
  }
  return value
}

export function requiredString(body, field, label, options = {}) {
  const value = body?.[field]
  if (typeof value !== 'string' || !value.trim()) {
    throw new ValidationError(`${label}을(를) 입력해 주세요.`, [{ field, message: 'required' }])
  }
  return cleanString(value, field, label, options)
}

export function optionalString(body, field, label, options = {}) {
  const value = body?.[field]
  if (value === undefined || value === null) return options.defaultValue ?? ''
  return cleanString(String(value), field, label, options)
}

export function requiredEmail(body, field = 'email', label = '이메일') {
  const value = requiredString(body, field, label, { max: 254 }).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new ValidationError('올바른 이메일 형식으로 입력해 주세요.', [{ field, message: 'invalid_email' }])
  }
  return value
}

export function optionalBoolean(body, field, defaultValue = false) {
  const value = body?.[field]
  if (value === undefined || value === null) return defaultValue
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  throw new ValidationError(`${field} 값은 true 또는 false여야 합니다.`, [{ field, message: 'invalid_boolean' }])
}

export function requiredNumber(body, field, label, options = {}) {
  const value = Number(body?.[field])
  if (!Number.isFinite(value)) {
    throw new ValidationError(`${label}을(를) 숫자로 입력해 주세요.`, [{ field, message: 'invalid_number' }])
  }
  if (options.min !== undefined && value < options.min) {
    throw new ValidationError(`${label}은(는) ${options.min} 이상이어야 합니다.`, [{ field, message: 'too_small' }])
  }
  if (options.max !== undefined && value > options.max) {
    throw new ValidationError(`${label}은(는) ${options.max} 이하여야 합니다.`, [{ field, message: 'too_large' }])
  }
  return value
}

export function optionalNumber(body, field, label, options = {}) {
  const value = body?.[field]
  if (value === undefined || value === null || value === '') return options.defaultValue ?? null
  return requiredNumber(body, field, label, options)
}

export function optionalInteger(body, field, label, options = {}) {
  const value = optionalNumber(body, field, label, options)
  if (value === null) return value
  if (!Number.isInteger(value)) {
    throw new ValidationError(`${label}은(는) 정수로 입력해 주세요.`, [{ field, message: 'invalid_integer' }])
  }
  return value
}

export function enumValue(value, allowed, field, label) {
  if (!allowed.includes(value)) {
    throw new ValidationError(`${label} 값이 올바르지 않습니다.`, [{ field, message: 'invalid_enum', allowed }])
  }
  return value
}

export function dateKey(value, field = 'date', label = '날짜') {
  const text = String(value || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(new Date(`${text}T00:00:00`).getTime())) {
    throw new ValidationError(`${label}는 YYYY-MM-DD 형식이어야 합니다.`, [{ field, message: 'invalid_date' }])
  }
  return text
}

function cleanString(value, field, label, options) {
  const text = String(value).trim()
  const max = options.max ?? 120
  if (text.length > max) {
    throw new ValidationError(`${label}은(는) ${max}자 이하여야 합니다.`, [{ field, message: 'too_long' }])
  }
  return text
}
