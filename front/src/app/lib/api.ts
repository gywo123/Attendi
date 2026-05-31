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
  return ''
}

export function clearAccessToken() {
  localStorage.removeItem('attendi.accessToken')
}

export function startGoogleLogin(role: 'student' | 'teacher') {
  window.location.href = `${API_BASE_URL}/auth/google?role=${role}`
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (!headers.has('Content-Type') && options.body) headers.set('Content-Type', 'application/json')
  const token = getAccessToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers, credentials: 'include' })
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
