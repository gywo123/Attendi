export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api'
const DEFAULT_GET_CACHE_TTL_MS = 3000
const ACCESS_TOKEN_KEY = 'attendi.accessToken'

type ApiRequestOptions = RequestInit & {
  cacheTtlMs?: number
  skipCache?: boolean
}

const getCache = new Map<string, { expiresAt: number; promise?: Promise<unknown>; data?: unknown }>()

export type ApiSuccess<T> = {
  success: true
  data: T
}

export type ApiFailure = {
  success: false
  error: {
    code: string
    message: string
  }
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure

export type AuthPayload = {
  accessToken: string
  user: {
    id?: number
    role: 'student' | 'teacher' | 'admin' | 'device'
    name: string
    email?: string
    class?: string
    number?: string
    studentId?: string
    classId?: number
    deviceName?: string
  }
  student?: {
    id: number
    classId: number
    className?: string
    studentNumber: string
    name: string
  }
}

export function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY) || ''
}

export function setAccessToken(token: string) {
  if (token) localStorage.setItem(ACCESS_TOKEN_KEY, token)
}

export function clearAccessToken() {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
}

export function clearApiCache() {
  getCache.clear()
  window.dispatchEvent(new CustomEvent('attendi:api-cache-cleared'))
}

export function startGoogleLogin(role: 'student' | 'teacher') {
  window.location.href = `${API_BASE_URL}/auth/google?role=${role}`
}

function isAuthPayload(value: unknown): value is AuthPayload {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'accessToken' in value &&
    typeof (value as { accessToken?: unknown }).accessToken === 'string'
  )
}

export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const method = String(options.method || 'GET').toUpperCase()
  const isGet = method === 'GET'
  const cacheKey = `${API_BASE_URL}${path}`
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_GET_CACHE_TTL_MS
  const cached = getCache.get(cacheKey)

  if (isGet && !options.skipCache && cached && cached.expiresAt > Date.now()) {
    if ('data' in cached) return cached.data as T
    if (cached.promise) return cached.promise as Promise<T>
  }

  const headers = new Headers(options.headers)
  if (!headers.has('Content-Type') && options.body) headers.set('Content-Type', 'application/json')
  const token = getAccessToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  if (!isGet) clearApiCache()

  const request = fetch(`${API_BASE_URL}${path}`, { ...options, headers, credentials: 'include' })
    .then(async (response) => {
      const payload = await response.json() as ApiResponse<T>
      if (!payload.success) {
        throw new ApiError(payload.error.code, payload.error.message, response.status)
      }
      if (isAuthPayload(payload.data)) {
        setAccessToken(payload.data.accessToken)
      }
      if (isGet && !options.skipCache && cacheTtlMs > 0) {
        getCache.set(cacheKey, { data: payload.data, expiresAt: Date.now() + cacheTtlMs })
      }
      return payload.data
    })
    .catch((error) => {
      if (isGet) getCache.delete(cacheKey)
      throw error
    })

  if (isGet && !options.skipCache && cacheTtlMs > 0) {
    getCache.set(cacheKey, { promise: request, expiresAt: Date.now() + cacheTtlMs })
  }

  return request
}

export async function loginTeacher(email: string, password: string) {
  const payload = await apiFetch<AuthPayload>('/auth/teacher/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  return payload
}

export async function loginDevice(token: string, deviceName: string) {
  const payload = await apiFetch<AuthPayload>('/device/login', {
    method: 'POST',
    body: JSON.stringify({ token, deviceName }),
  })
  return payload
}

export class ApiError extends Error {
  code: string
  status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}
