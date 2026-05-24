export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api'

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
  return localStorage.getItem('attendi.accessToken') || ''
}

export function setAccessToken(token: string) {
  localStorage.setItem('attendi.accessToken', token)
}

export function clearAccessToken() {
  localStorage.removeItem('attendi.accessToken')
}

export function startGoogleLogin(role: 'student' | 'teacher') {
  window.location.href = `${API_BASE_URL}/auth/google?role=${role}`
}

export function decodeAuthPayload(value: string): AuthPayload | null {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value)))
  } catch {
    return null
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (!headers.has('Content-Type') && options.body) headers.set('Content-Type', 'application/json')
  const token = getAccessToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers })
  const payload = await response.json() as ApiResponse<T>
  if (!payload.success) {
    throw new ApiError(payload.error.code, payload.error.message, response.status)
  }
  return payload.data
}

export async function loginTeacher(email: string, password: string) {
  const payload = await apiFetch<AuthPayload>('/auth/teacher/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  setAccessToken(payload.accessToken)
  return payload
}

export async function loginDevice(token: string, deviceName: string) {
  const payload = await apiFetch<AuthPayload>('/device/login', {
    method: 'POST',
    body: JSON.stringify({ token, deviceName }),
  })
  setAccessToken(payload.accessToken)
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

function base64UrlToBytes(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - base64.length % 4) % 4)
  const bin = atob(padded)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}
