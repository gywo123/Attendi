import { col, insertDoc, publicDoc, publicDocs } from './db.js'
import { now } from './time.js'

export async function getStudentFromRequest(req) {
  if (req.user?.role === 'student') {
    const student = await getStudentById(req.user.id)
    if (student) return student
  }
  const student = await col('students').findOne({}, { sort: { id: 1 }, projection: { _id: 0 } })
  return student ? withClassName(student) : null
}

export async function getSchoolLocation() {
  const row = await col('schools').findOne({ id: 1 }, { projection: { _id: 0 } })
  return {
    ...row,
    devBypassLocation: String(process.env.DEV_BYPASS_LOCATION || 'true') === 'true',
  }
}

export async function getStudentById(id) {
  const value = String(id)
  const numericId = Number(value)
  const studentNumber = value.startsWith('S') ? value.slice(1) : value
  const query = Number.isFinite(numericId)
    ? { $or: [{ id: numericId }, { studentNumber: value }, { studentNumber }] }
    : { $or: [{ studentNumber: value }, { studentNumber }] }
  const student = await col('students').findOne(query, { projection: { _id: 0 } })
  return student ? withClassName(student) : null
}

export async function getTeacherById(id) {
  return publicDoc(await col('teachers').findOne(
    { id: Number(id) },
    { projection: { _id: 0, passwordHash: 0 } },
  ))
}

export async function getDeviceTokenById(id) {
  const token = await col('deviceTokens').findOne({ id: Number(id) }, { projection: { _id: 0 } })
  return token ? { ...token, usageCount: 0 } : null
}

export async function resolveClassId({ classId, className, grade, classNum }) {
  if (classId) {
    const existing = await col('classes').findOne({ id: Number(classId) }, { projection: { _id: 0 } })
    if (existing) return existing.id
  }

  const normalized = toFullClassName(className || `${grade || 3}-${classNum || 1}`)
  let cls = await col('classes').findOne({ name: normalized }, { projection: { _id: 0 } })
  if (!cls) {
    cls = await insertDoc('classes', { name: normalized, schoolLocationId: 1, createdAt: now() })
  }
  return cls.id
}

export function toFullClassName(value) {
  const raw = String(value || '').trim()
  const dashed = raw.match(/^(\d+)-(\d+)$/)
  if (dashed) return `${dashed[1]}학년 ${dashed[2]}반`
  const compact = raw.match(/^(\d+)학년\s*(\d+)반$/)
  if (compact) return `${compact[1]}학년 ${compact[2]}반`
  return raw || '3학년 1반'
}

export function displayStudentNumber(studentNumber = '') {
  const parsed = Number(String(studentNumber).slice(-2))
  return Number.isFinite(parsed) && parsed > 0 ? `${parsed}번` : ''
}

export async function readAttendanceRows(query = {}) {
  const { dateFrom, dateTo, classId, studentId, status } = query
  const filter = {}
  if (dateFrom || dateTo) {
    filter.date = {}
    if (dateFrom) filter.date.$gte = String(dateFrom)
    if (dateTo) filter.date.$lte = String(dateTo)
  }
  if (classId) filter.classId = Number(classId)
  if (studentId) {
    const student = await getStudentById(studentId)
    filter.studentId = student?.id || Number(studentId)
  }
  if (status) filter.status = toDbStatus(status)

  const rows = publicDocs(await col('attendanceRecords').find(filter).sort({ date: -1, verifiedAt: -1, id: -1 }).toArray())
  return Promise.all(rows.map(withAttendanceNames))
}

export function toClientAttendanceRow(row) {
  return {
    ...row,
    status: toClientStatus(row.status),
    verifiedByQr: Boolean(row.verifiedByQr),
  }
}

export function toClientStatus(status) {
  return status === 'early_leave' ? 'early' : status
}

export function toDbStatus(status) {
  return status === 'early' ? 'early_leave' : String(status)
}

export function normalizeRole(role) {
  return role === 'admin' ? 'admin' : 'teacher'
}

export function normalizeTeacherStatus(status) {
  return ['active', 'pending', 'inactive'].includes(status) ? status : 'active'
}

export async function generateDeviceToken() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let value = ''
  do {
    value = `ATD-${Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')}`
  } while (await col('deviceTokens').findOne({ token: value }))
  return value
}

export async function isInsideSchool(latitude, longitude) {
  if (String(process.env.DEV_BYPASS_LOCATION || 'true') === 'true') return true
  if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude)) return false
  const school = await getSchoolLocation()
  return distanceMeters(latitude, longitude, school.latitude, school.longitude) <= school.radiusMeters
}

export function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const toRad = (deg) => deg * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export function extractQrToken(payload) {
  if (!payload || typeof payload !== 'string') return ''
  if (payload.startsWith('attendi://')) {
    try { return new URL(payload).searchParams.get('token') || '' } catch { return '' }
  }
  return payload
}

export function getAttendanceStatus() {
  const hour = new Date().getHours()
  const minute = new Date().getMinutes()
  return hour > 8 || (hour === 8 && minute > 50) ? 'late' : 'present'
}

export function isFiniteNumber(value) {
  return Number.isFinite(Number(value))
}

async function withClassName(student) {
  const cls = await col('classes').findOne({ id: Number(student.classId) }, { projection: { _id: 0 } })
  return { ...student, className: cls?.name || '' }
}

async function withAttendanceNames(row) {
  const [student, cls] = await Promise.all([
    col('students').findOne({ id: Number(row.studentId) }, { projection: { _id: 0 } }),
    col('classes').findOne({ id: Number(row.classId) }, { projection: { _id: 0 } }),
  ])
  return {
    ...row,
    studentName: student?.name || '',
    studentNumber: student?.studentNumber || '',
    className: cls?.name || '',
  }
}
