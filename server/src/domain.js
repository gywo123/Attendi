import { all, one, run } from './db.js'
import { now } from './time.js'

export function getStudentFromRequest(req) {
  if (req.user?.role === 'student') {
    const student = one('SELECT id, class_id AS classId, student_number AS studentNumber, name FROM students WHERE id = ?', [req.user.id])
    if (student) return student
  }
  return one('SELECT id, class_id AS classId, student_number AS studentNumber, name FROM students ORDER BY id LIMIT 1')
}

export function getSchoolLocation() {
  const row = one('SELECT id, name, latitude, longitude, radius_meters AS radiusMeters FROM school_locations WHERE id = 1')
  return {
    ...row,
    devBypassLocation: String(process.env.DEV_BYPASS_LOCATION || 'true') === 'true',
  }
}

export function getStudentById(id) {
  const value = String(id)
  const numericId = Number(value)
  const studentNumber = value.startsWith('S') ? value.slice(1) : value
  return one(`
    SELECT s.id, s.class_id AS classId, s.student_number AS studentNumber, s.name,
           s.email, s.is_active AS isActive, c.name AS className
    FROM students s
    JOIN classes c ON c.id = s.class_id
    WHERE s.id = ? OR s.student_number = ? OR s.student_number = ?
  `, [Number.isFinite(numericId) ? numericId : -1, value, studentNumber])
}

export function getTeacherById(id) {
  return one(`
    SELECT id, name, email, role, school, subject, status, created_at AS joinedAt
    FROM teachers
    WHERE id = ?
  `, [Number(id)])
}

export function getDeviceTokenById(id) {
  return one(`
    SELECT id, token, device_name AS deviceName, location, revoked_at AS revokedAt,
           last_used_at AS lastUsedAt, created_at AS createdAt, 0 AS usageCount
    FROM device_tokens
    WHERE id = ?
  `, [Number(id)])
}

export function resolveClassId({ classId, className, grade, classNum }) {
  if (classId) {
    const existing = one('SELECT id FROM classes WHERE id = ?', [Number(classId)])
    if (existing) return existing.id
  }

  const normalized = toFullClassName(className || `${grade || 3}-${classNum || 1}`)
  let cls = one('SELECT id FROM classes WHERE name = ?', [normalized])
  if (!cls) {
    run('INSERT INTO classes (name, school_location_id, created_at) VALUES (?, 1, ?)', [normalized, now()])
    cls = one('SELECT id FROM classes WHERE name = ?', [normalized])
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

export function readAttendanceRows(query = {}) {
  const { dateFrom, dateTo, classId, studentId, status } = query
  const clauses = ['1 = 1']
  const params = []
  if (dateFrom) { clauses.push('ar.date >= ?'); params.push(dateFrom) }
  if (dateTo) { clauses.push('ar.date <= ?'); params.push(dateTo) }
  if (classId) { clauses.push('ar.class_id = ?'); params.push(Number(classId)) }
  if (studentId) {
    const student = getStudentById(studentId)
    clauses.push('ar.student_id = ?')
    params.push(student?.id || Number(studentId))
  }
  if (status) { clauses.push('ar.status = ?'); params.push(toDbStatus(status)) }

  return all(`
    SELECT ar.id, ar.student_id AS studentId, s.name AS studentName, s.student_number AS studentNumber,
           ar.class_id AS classId, c.name AS className, ar.date, ar.status,
           ar.verified_by_qr AS verifiedByQr, ar.verified_at AS verifiedAt, ar.memo
    FROM attendance_records ar
    JOIN students s ON s.id = ar.student_id
    JOIN classes c ON c.id = ar.class_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY ar.date DESC, ar.verified_at DESC
  `, params)
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

export function generateDeviceToken() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let value = ''
  do {
    value = `ATD-${Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')}`
  } while (one('SELECT id FROM device_tokens WHERE token = ?', [value]))
  return value
}

export function isInsideSchool(latitude, longitude) {
  if (String(process.env.DEV_BYPASS_LOCATION || 'true') === 'true') return true
  if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude)) return false
  const school = getSchoolLocation()
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
