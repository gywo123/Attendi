import express from 'express'
import cors from 'cors'
import crypto from 'node:crypto'
import { CLIENT_URL, GOOGLE_CLIENT_ID, GOOGLE_REDIRECT_URI, PORT, QR_TTL_SECONDS } from './config.js'
import { db, initDb, ensureInitialData, all, one, run } from './db.js'
import { authOptional, authRequired, authResponse, currentAuthPayload, exchangeGoogleCode, upsertGoogleUser } from './auth.js'
import { csvCell, fail, ok } from './http.js'
import { parseCsv } from './csv.js'
import { encodeClientPayload, hashPassword, hashToken, verifyPassword } from './security.js'
import { now, today, toIsoAtDateTime } from './time.js'
import {
  extractQrToken,
  generateDeviceToken,
  getAttendanceStatus,
  getDeviceTokenById,
  getSchoolLocation,
  getStudentById,
  getStudentFromRequest,
  getTeacherById,
  isFiniteNumber,
  isInsideSchool,
  normalizeRole,
  normalizeTeacherStatus,
  readAttendanceRows,
  resolveClassId,
  toClientAttendanceRow,
  toClientStatus,
  toDbStatus,
} from './domain.js'

const app = express()

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true)
    if (origin === CLIENT_URL || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
      return callback(null, true)
    }
    return callback(new Error(`CORS blocked origin: ${origin}`))
  },
  credentials: true,
}))
app.use(express.json())

initDb()
ensureInitialData()

app.get('/api/health', (_req, res) => {
  ok(res, { status: 'ok', time: new Date().toISOString() })
})

app.get('/', (_req, res) => {
  ok(res, { service: 'Attendi API', health: '/api/health' })
})

app.get('/api/auth/google', (req, res) => {
  const role = req.query.role === 'teacher' ? 'teacher' : 'student'

  if (!GOOGLE_CLIENT_ID) {
    return fail(res, 500, 'GOOGLE_OAUTH_NOT_CONFIGURED', 'GOOGLE_CLIENT_ID가 설정되지 않았습니다.')
  }

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'select_account',
    state: role,
  })

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`)
})

app.get('/api/auth/google/callback', async (req, res) => {
  const code = req.query.code
  const role = req.query.state === 'teacher' ? 'teacher' : 'student'
  if (!code) return res.redirect(`${CLIENT_URL}?auth_error=missing_code`)

  try {
    const googleUser = await exchangeGoogleCode(String(code))
    const result = upsertGoogleUser({ role, googleUser })
    if (result.pendingApproval) {
      return res.redirect(`${CLIENT_URL}?signup_pending=${encodeClientPayload(result.pendingApproval)}`)
    }
    if (result.authError) {
      return res.redirect(`${CLIENT_URL}?auth_error=${encodeURIComponent(result.authError)}`)
    }
    res.redirect(`${CLIENT_URL}?auth=${encodeClientPayload(result)}`)
  } catch (error) {
    console.error(error)
    res.redirect(`${CLIENT_URL}?auth_error=google_oauth_failed`)
  }
})

app.get('/api/auth/me', authRequired([]), (req, res) => {
  ok(res, currentAuthPayload(req.user))
})

app.post('/api/auth/teacher/login', (req, res) => {
  const { email, password, passwordHash } = req.body || {}
  const input = password || passwordHash
  if (!email || !input) return fail(res, 400, 'BAD_REQUEST', '이메일과 비밀번호를 입력해 주세요.')

  const teacher = one('SELECT * FROM teachers WHERE email = ?', [email])
  if (!teacher || !verifyPassword(input, teacher.password_hash)) {
    return fail(res, 401, 'UNAUTHORIZED', '이메일 또는 비밀번호가 올바르지 않습니다.')
  }
  if (teacher.status === 'pending') {
    return fail(res, 403, 'TEACHER_PENDING', '관리자 승인 대기 중인 교사 계정입니다.')
  }
  if (teacher.status && teacher.status !== 'active') {
    return fail(res, 403, 'TEACHER_INACTIVE', '비활성화된 교사 계정입니다.')
  }

  ok(res, authResponse({
    id: teacher.id,
    role: teacher.role,
    name: teacher.name,
    email: teacher.email,
  }))
})

app.post('/api/auth/teacher/signup', (req, res) => {
  const { name, email, password, school = '학교', subject = '' } = req.body || {}
  if (!name || !email || !password) {
    return fail(res, 400, 'BAD_REQUEST', '이름, 이메일, 비밀번호를 입력해 주세요.')
  }

  try {
    run(
      `INSERT INTO teachers (name, email, role, password_hash, school, subject, status, created_at)
       VALUES (?, ?, 'teacher', ?, ?, ?, 'pending', ?)`,
      [String(name), String(email), hashPassword(String(password)), String(school), String(subject), now()],
    )
    ok(res, {
      id: db.prepare('SELECT last_insert_rowid() AS id').get().id,
      name,
      email,
      status: 'pending',
    })
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) {
      return fail(res, 409, 'DUPLICATE_TEACHER_EMAIL', '이미 등록된 교사 이메일입니다.')
    }
    throw error
  }
})

app.post('/api/auth/student/signup', (req, res) => {
  const { name, email } = req.body || {}
  if (!name || !email) return fail(res, 400, 'BAD_REQUEST', '이름과 이메일을 입력해 주세요.')

  const activeStudent = one('SELECT id FROM students WHERE email = ? AND is_active = 1', [String(email)])
  if (activeStudent) return fail(res, 409, 'STUDENT_ALREADY_APPROVED', '이미 승인된 학생 계정입니다.')

  const pending = one(
    "SELECT id FROM student_applications WHERE email = ? AND status = 'pending' ORDER BY requested_at DESC, id DESC LIMIT 1",
    [String(email)],
  )
  if (!pending) {
    run(
      "INSERT INTO student_applications (name, email, status, requested_at) VALUES (?, ?, 'pending', ?)",
      [String(name), String(email), now()],
    )
  }
  ok(res, { name, email, role: 'student', status: 'pending' })
})

app.post('/api/device/login', (req, res) => {
  const { token, deviceName } = req.body || {}
  if (!token) return fail(res, 400, 'BAD_REQUEST', '기기 토큰을 입력해 주세요.')

  const device = one('SELECT * FROM device_tokens WHERE token = ? AND revoked_at IS NULL', [token])
  if (!device) return fail(res, 401, 'UNAUTHORIZED', '유효하지 않은 기기 토큰입니다.')

  run(
    'UPDATE device_tokens SET device_name = COALESCE(?, device_name), last_used_at = ? WHERE id = ?',
    [deviceName || null, now(), device.id],
  )

  ok(res, authResponse({
    id: device.id,
    role: 'device',
    name: deviceName || device.device_name || '출석 인식기',
    deviceName: deviceName || device.device_name || '출석 인식기',
    email: '',
  }))
})

app.get('/api/classes', authOptional, (_req, res) => {
  ok(res, all('SELECT id, name, school_location_id AS schoolLocationId, created_at AS createdAt FROM classes ORDER BY id'))
})

app.get('/api/students', authOptional, (req, res) => {
  const { classId, keyword, includeInactive } = req.query
  const clauses = includeInactive === 'true' ? ['1 = 1'] : ['s.is_active = 1']
  const params = []
  if (classId) {
    clauses.push('s.class_id = ?')
    params.push(Number(classId))
  }
  if (keyword) {
    clauses.push('(s.name LIKE ? OR s.student_number LIKE ?)')
    params.push(`%${keyword}%`, `%${keyword}%`)
  }

  ok(res, all(`
    SELECT s.id, s.class_id AS classId, s.student_number AS studentNumber, s.name, s.email, s.is_active AS isActive,
           c.name AS className
    FROM students s
    JOIN classes c ON c.id = s.class_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY c.id, s.student_number
  `, params))
})

app.get('/api/students/export.csv', authRequired(['teacher', 'admin']), (req, res) => {
  const includeInactive = req.query.includeInactive === 'true'
  const rows = all(`
    SELECT s.name, s.student_number AS studentNumber, s.email, s.is_active AS isActive, c.name AS className
    FROM students s
    JOIN classes c ON c.id = s.class_id
    WHERE ${includeInactive ? '1 = 1' : 's.is_active = 1'}
    ORDER BY c.id, s.student_number
  `)
  const csv = [
    ['name', 'studentNumber', 'className', 'email', 'isActive'],
    ...rows.map((row) => [row.name, row.studentNumber, row.className, row.email || '', row.isActive ? 'true' : 'false']),
  ].map((line) => line.map(csvCell).join(',')).join('\n')
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="students.csv"')
  res.send(`\uFEFF${csv}`)
})

app.post('/api/students/import', authRequired(['teacher', 'admin']), (req, res) => {
  const rows = Array.isArray(req.body?.students)
    ? req.body.students
    : parseCsv(String(req.body?.csv || ''))
  const imported = []
  const skipped = []

  for (const row of rows) {
    const name = row.name || row['이름']
    const studentNumber = row.studentNumber || row.studentId || row['학번']
    const className = row.className || row.class || row['학반'] || row['반']
    const email = row.email || row['이메일'] || ''
    const isActive = String(row.isActive ?? row['활성'] ?? 'true') !== 'false'
    if (!name || !studentNumber) {
      skipped.push({ row, reason: '이름 또는 학번 없음' })
      continue
    }
    try {
      const classId = resolveClassId({ className })
      const existing = one('SELECT id FROM students WHERE student_number = ?', [String(studentNumber)])
      if (existing) {
        run(
          'UPDATE students SET name = ?, class_id = ?, email = ?, is_active = ? WHERE id = ?',
          [String(name), classId, String(email), isActive ? 1 : 0, existing.id],
        )
        imported.push(getStudentById(existing.id))
      } else {
        run(
          'INSERT INTO students (class_id, student_number, name, email, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [classId, String(studentNumber), String(name), String(email), isActive ? 1 : 0, now()],
        )
        imported.push(getStudentById(db.prepare('SELECT last_insert_rowid() AS id').get().id))
      }
    } catch (error) {
      skipped.push({ row, reason: error.message })
    }
  }

  ok(res, { importedCount: imported.length, skippedCount: skipped.length, students: imported, skipped })
})

app.post('/api/students', authRequired(['teacher', 'admin']), (req, res) => {
  const { name, studentNumber, email = '', classId, className, grade, classNum, isActive = true } = req.body || {}
  if (!name || !studentNumber) return fail(res, 400, 'BAD_REQUEST', '이름과 학번을 입력해 주세요.')

  const resolvedClassId = resolveClassId({ classId, className, grade, classNum })
  try {
    run(
      `INSERT INTO students (class_id, student_number, name, email, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [resolvedClassId, String(studentNumber), String(name), String(email), isActive ? 1 : 0, now()],
    )
    ok(res, getStudentById(db.prepare('SELECT last_insert_rowid() AS id').get().id))
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) {
      return fail(res, 409, 'DUPLICATE_STUDENT_NUMBER', '이미 등록된 학번입니다.')
    }
    throw error
  }
})

app.patch('/api/students/:id', authRequired(['teacher', 'admin']), (req, res) => {
  const student = getStudentById(req.params.id)
  if (!student) return fail(res, 404, 'NOT_FOUND', '학생을 찾을 수 없습니다.')

  const { name, studentNumber, email, classId, className, grade, classNum, isActive } = req.body || {}
  const resolvedClassId = classId || className || grade || classNum
    ? resolveClassId({ classId, className, grade, classNum })
    : student.classId

  try {
    run(
      `UPDATE students
       SET class_id = ?, student_number = ?, name = ?, email = ?, is_active = ?
       WHERE id = ?`,
      [
        resolvedClassId,
        String(studentNumber ?? student.studentNumber),
        String(name ?? student.name),
        String(email ?? student.email ?? ''),
        isActive === undefined ? Number(student.isActive) : isActive ? 1 : 0,
        student.id,
      ],
    )
    ok(res, getStudentById(student.id))
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) {
      return fail(res, 409, 'DUPLICATE_STUDENT_NUMBER', '이미 등록된 학번입니다.')
    }
    throw error
  }
})

app.delete('/api/students/:id', authRequired(['teacher', 'admin']), (req, res) => {
  const student = getStudentById(req.params.id)
  if (!student) return fail(res, 404, 'NOT_FOUND', '학생을 찾을 수 없습니다.')
  run('DELETE FROM attendance_records WHERE student_id = ?', [student.id])
  run('DELETE FROM qr_sessions WHERE student_id = ?', [student.id])
  run('DELETE FROM students WHERE id = ?', [student.id])
  ok(res, { id: student.id, deleted: true })
})

app.get('/api/student-applications', authRequired(['teacher', 'admin']), (req, res) => {
  const status = ['pending', 'approved', 'rejected'].includes(String(req.query.status)) ? String(req.query.status) : 'pending'
  ok(res, all(`
    SELECT id, name, email, status, class_id AS classId, student_number AS studentNumber,
           reviewed_by AS reviewedBy, requested_at AS requestedAt, reviewed_at AS reviewedAt
    FROM student_applications
    WHERE status = ?
    ORDER BY requested_at DESC, id DESC
  `, [status]))
})

app.patch('/api/student-applications/:id', authRequired(['teacher', 'admin']), (req, res) => {
  const application = one('SELECT * FROM student_applications WHERE id = ?', [Number(req.params.id)])
  if (!application) return fail(res, 404, 'NOT_FOUND', '학생 가입 신청을 찾을 수 없습니다.')
  if (application.status !== 'pending') {
    return fail(res, 409, 'APPLICATION_ALREADY_REVIEWED', '이미 처리된 학생 가입 신청입니다.')
  }

  const action = req.body?.status === 'rejected' ? 'rejected' : 'approved'
  if (action === 'rejected') {
    run(
      "UPDATE student_applications SET status = 'rejected', reviewed_by = ?, reviewed_at = ? WHERE id = ?",
      [req.user.id, now(), application.id],
    )
    return ok(res, getStudentApplicationById(application.id))
  }

  const { studentNumber, classId, className, grade, classNum, name } = req.body || {}
  if (!studentNumber) return fail(res, 400, 'BAD_REQUEST', '승인할 학생의 학번을 입력해 주세요.')

  const resolvedClassId = resolveClassId({ classId, className, grade, classNum })
  const finalName = String(name || application.name)
  const finalNumber = String(studentNumber)
  try {
    const existingStudent = one('SELECT id FROM students WHERE email = ? OR student_number = ?', [application.email, finalNumber])
    if (existingStudent) {
      run(
        'UPDATE students SET name = ?, class_id = ?, student_number = ?, email = ?, is_active = 1 WHERE id = ?',
        [finalName, resolvedClassId, finalNumber, application.email, existingStudent.id],
      )
    } else {
      run(
        'INSERT INTO students (class_id, student_number, name, email, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)',
        [resolvedClassId, finalNumber, finalName, application.email, now()],
      )
    }
    run(
      "UPDATE student_applications SET status = 'approved', class_id = ?, student_number = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?",
      [resolvedClassId, finalNumber, req.user.id, now(), application.id],
    )
    ok(res, {
      application: getStudentApplicationById(application.id),
      student: getStudentById(finalNumber),
    })
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) {
      return fail(res, 409, 'DUPLICATE_STUDENT_NUMBER', '이미 등록된 학번입니다.')
    }
    throw error
  }
})

app.get('/api/teachers', authRequired(['teacher', 'admin']), (_req, res) => {
  ok(res, all(`
    SELECT id, name, email, role, school, subject, status, created_at AS joinedAt
    FROM teachers
    ORDER BY created_at DESC, id DESC
  `))
})

app.get('/api/teachers/export.csv', authRequired(['teacher', 'admin']), (_req, res) => {
  const rows = all(`
    SELECT name, email, role, school, subject, status, created_at AS joinedAt
    FROM teachers
    ORDER BY created_at DESC, id DESC
  `)
  const csv = [
    ['name', 'email', 'role', 'school', 'subject', 'status', 'joinedAt'],
    ...rows.map((row) => [row.name, row.email, row.role, row.school, row.subject, row.status, row.joinedAt]),
  ].map((line) => line.map(csvCell).join(',')).join('\n')
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="teachers.csv"')
  res.send(`\uFEFF${csv}`)
})

app.post('/api/teachers', authRequired(['admin', 'teacher']), (req, res) => {
  const { name, email, role = 'teacher', school = '학교', subject = '', status = 'active', password = '1234' } = req.body || {}
  if (!name || !email) return fail(res, 400, 'BAD_REQUEST', '이름과 이메일을 입력해 주세요.')

  try {
    run(
      `INSERT INTO teachers (name, email, role, password_hash, school, subject, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [String(name), String(email), normalizeRole(role), hashPassword(password), String(school), String(subject), normalizeTeacherStatus(status), now()],
    )
    ok(res, getTeacherById(db.prepare('SELECT last_insert_rowid() AS id').get().id))
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) {
      return fail(res, 409, 'DUPLICATE_TEACHER_EMAIL', '이미 등록된 교사 이메일입니다.')
    }
    throw error
  }
})

app.patch('/api/teachers/:id', authRequired(['admin', 'teacher']), (req, res) => {
  const teacher = getTeacherById(req.params.id)
  if (!teacher) return fail(res, 404, 'NOT_FOUND', '교사를 찾을 수 없습니다.')

  const { name, email, role, school, subject, status } = req.body || {}
  try {
    run(
      `UPDATE teachers
       SET name = ?, email = ?, role = ?, school = ?, subject = ?, status = ?
       WHERE id = ?`,
      [
        String(name ?? teacher.name),
        String(email ?? teacher.email),
        normalizeRole(role ?? teacher.role),
        String(school ?? teacher.school ?? '학교'),
        String(subject ?? teacher.subject ?? ''),
        normalizeTeacherStatus(status ?? teacher.status),
        teacher.id,
      ],
    )
    ok(res, getTeacherById(teacher.id))
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) {
      return fail(res, 409, 'DUPLICATE_TEACHER_EMAIL', '이미 등록된 교사 이메일입니다.')
    }
    throw error
  }
})

app.delete('/api/teachers/:id', authRequired(['admin', 'teacher']), (req, res) => {
  const teacher = getTeacherById(req.params.id)
  if (!teacher) return fail(res, 404, 'NOT_FOUND', '교사를 찾을 수 없습니다.')
  run('DELETE FROM teachers WHERE id = ?', [teacher.id])
  ok(res, { id: teacher.id, deleted: true })
})

app.get('/api/school-location', authOptional, (_req, res) => {
  ok(res, getSchoolLocation())
})

app.put('/api/school-location', authRequired(['teacher', 'admin']), (req, res) => {
  const { name = '학교', latitude, longitude, radiusMeters } = req.body || {}
  if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude) || !isFiniteNumber(radiusMeters)) {
    return fail(res, 400, 'BAD_REQUEST', '위도, 경도, 허용 반경을 숫자로 입력해 주세요.')
  }

  run(
    `UPDATE school_locations SET name = ?, latitude = ?, longitude = ?, radius_meters = ? WHERE id = 1`,
    [String(name), latitude, longitude, radiusMeters],
  )
  ok(res, getSchoolLocation())
})

app.post('/api/location/verify', authOptional, (req, res) => {
  const { latitude, longitude } = req.body || {}
  ok(res, { insideSchoolArea: isInsideSchool(latitude, longitude) })
})

app.post('/api/qr-sessions', authOptional, (req, res) => {
  const student = getStudentFromRequest(req)
  const { classId = student.classId, latitude, longitude, accuracyMeters } = req.body || {}
  if (!isInsideSchool(latitude, longitude)) {
    return fail(res, 422, 'OUT_OF_SCHOOL_AREA', '학교 인증 구역 밖에서는 QR 코드를 발급할 수 없습니다.')
  }

  const token = crypto.randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + QR_TTL_SECONDS * 1000).toISOString()
  const tokenHash = hashToken(token)
  const createdAt = now()

  run(
    `INSERT INTO qr_sessions (student_id, class_id, token_hash, latitude, longitude, accuracy_meters, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [student.id, Number(classId), tokenHash, latitude ?? null, longitude ?? null, accuracyMeters ?? null, expiresAt, createdAt],
  )

  ok(res, {
    qrSessionId: db.prepare('SELECT last_insert_rowid() AS id').get().id,
    qrPayload: `attendi://attendance?token=${token}`,
    expiresAt,
    expiresInSeconds: QR_TTL_SECONDS,
  })
})

app.post('/api/qr-sessions/verify', authRequired(['teacher', 'admin', 'device']), (req, res) => {
  const { qrPayload } = req.body || {}
  const token = extractQrToken(qrPayload)
  if (!token) return fail(res, 400, 'INVALID_QR', '유효하지 않은 QR 코드입니다.')

  const session = one('SELECT * FROM qr_sessions WHERE token_hash = ?', [hashToken(token)])
  if (!session) return fail(res, 400, 'INVALID_QR', '유효하지 않은 QR 코드입니다.')
  if (session.used_at) return fail(res, 409, 'DUPLICATE_ATTENDANCE', '이미 출석 처리된 QR 코드입니다.')
  if (new Date(session.expires_at).getTime() < Date.now()) {
    return fail(res, 410, 'QR_EXPIRED', '만료된 QR 코드입니다.')
  }

  const verifiedAt = now()
  const today = verifiedAt.slice(0, 10)
  const status = getAttendanceStatus()
  const existing = one(
    'SELECT id FROM attendance_records WHERE student_id = ? AND class_id = ? AND date = ?',
    [session.student_id, session.class_id, today],
  )
  if (existing) return fail(res, 409, 'DUPLICATE_ATTENDANCE', '이미 출석 처리된 학생입니다.')

  run('UPDATE qr_sessions SET used_at = ? WHERE id = ?', [verifiedAt, session.id])
  run(
    `INSERT INTO attendance_records
      (student_id, class_id, date, status, memo, verified_by_qr, verified_latitude, verified_longitude, verified_at, updated_at)
     VALUES (?, ?, ?, ?, '', 1, ?, ?, ?, ?)`,
    [session.student_id, session.class_id, today, status, session.latitude, session.longitude, verifiedAt, verifiedAt],
  )

  const student = one(`
    SELECT s.id, s.name, s.student_number AS studentNumber, c.name AS className
    FROM students s
    JOIN classes c ON c.id = s.class_id
    WHERE s.id = ?
  `, [session.student_id])
  ok(res, { result: 'accepted', status: toClientStatus(status), verifiedAt, student })
})

app.get('/api/attendance/summary', authOptional, (req, res) => {
  const date = req.query.date || today()
  const classId = req.query.classId ? Number(req.query.classId) : null
  const classFilter = classId ? 'AND class_id = ?' : ''
  const classParams = classId ? [classId] : []
  const rows = all(
    `SELECT status, COUNT(*) AS count FROM attendance_records WHERE date = ? ${classFilter} GROUP BY status`,
    [date, ...classParams],
  )
  const total = one(
    `SELECT COUNT(*) AS count FROM students WHERE is_active = 1 ${classId ? 'AND class_id = ?' : ''}`,
    classParams,
  ).count
  const counts = Object.fromEntries(rows.map((row) => [row.status, row.count]))
  const recentScans = all(`
    SELECT s.id AS studentId, s.name AS studentName, s.student_number AS studentNumber,
           c.name AS className, ar.status, ar.verified_at AS verifiedAt
    FROM attendance_records ar
    JOIN students s ON s.id = ar.student_id
    JOIN classes c ON c.id = ar.class_id
    WHERE ar.date = ? ${classId ? 'AND ar.class_id = ?' : ''}
    ORDER BY ar.verified_at DESC
    LIMIT 8
  `, [date, ...classParams])

  ok(res, {
    date,
    classId,
    summary: {
      total,
      present: counts.present || 0,
      late: counts.late || 0,
      absent: Math.max(0, total - (counts.present || 0) - (counts.late || 0) - (counts.early_leave || 0)),
      earlyLeave: counts.early_leave || 0,
    },
    recentScans: recentScans.map((row) => ({ ...row, status: toClientStatus(row.status) })),
  })
})

app.get('/api/attendance/weekly-summary', authOptional, (req, res) => {
  const targetDate = String(req.query.date || today())
  const classId = req.query.classId ? Number(req.query.classId) : null
  const days = getWeekDatesThrough(targetDate)
  const total = one(
    `SELECT COUNT(*) AS count FROM students WHERE is_active = 1 ${classId ? 'AND class_id = ?' : ''}`,
    classId ? [classId] : [],
  ).count
  const classFilter = classId ? 'AND class_id = ?' : ''
  const rows = all(
    `SELECT date, status, COUNT(*) AS count
     FROM attendance_records
     WHERE date BETWEEN ? AND ? ${classFilter}
     GROUP BY date, status`,
    [days[0], days[days.length - 1], ...(classId ? [classId] : [])],
  )
  const countByDate = new Map()
  for (const row of rows) {
    if (!countByDate.has(row.date)) countByDate.set(row.date, {})
    countByDate.get(row.date)[row.status] = row.count
  }

  ok(res, {
    date: targetDate,
    classId,
    days: days.map((date) => {
      const counts = countByDate.get(date) || {}
      const present = counts.present || 0
      const late = counts.late || 0
      const earlyLeave = counts.early_leave || 0
      const attended = present + late + earlyLeave
      return {
        date,
        dayLabel: date === targetDate ? '오늘' : weekdayLabel(date),
        total,
        present,
        late,
        earlyLeave,
        absent: Math.max(0, total - attended),
        attended,
        rate: total ? Math.round((attended / total) * 100) : 0,
      }
    }),
  })
})

app.get('/api/attendance', authOptional, (req, res) => {
  ok(res, readAttendanceRows(req.query).map(toClientAttendanceRow))
})

app.get('/api/attendance/export.csv', authOptional, (req, res) => {
  const rows = readAttendanceRows(req.query)
  const header = ['date', 'className', 'studentNumber', 'studentName', 'status', 'verifiedByQr', 'verifiedAt', 'memo']
  const body = rows.map((row) => [
    row.date,
    row.className,
    row.studentNumber,
    row.studentName,
    toClientStatus(row.status),
    row.verifiedByQr ? 'QR' : 'manual',
    row.verifiedAt || '',
    row.memo || '',
  ])
  const csv = [header, ...body].map((line) => line.map(csvCell).join(',')).join('\n')
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="attendance.csv"')
  res.send(`\uFEFF${csv}`)
})

app.post('/api/attendance/manual', authRequired(['teacher', 'admin']), (req, res) => {
  const { records, date = today() } = req.body || {}
  const input = Array.isArray(records) ? records : [req.body]
  const saved = []

  for (const item of input) {
    if (!item || !item.studentId || !item.status) continue
    const student = getStudentById(item.studentId)
    if (!student) continue
    const status = toDbStatus(item.status)
    const verifiedAt = status === 'absent' ? null : toIsoAtDateTime(date, item.time)
    const updatedAt = now()
    run(
      `INSERT INTO attendance_records
        (student_id, class_id, date, status, memo, verified_by_qr, verified_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)
       ON CONFLICT(student_id, class_id, date) DO UPDATE SET
         status = excluded.status,
         memo = excluded.memo,
         verified_by_qr = 0,
         verified_at = excluded.verified_at,
         updated_at = excluded.updated_at`,
      [student.id, student.classId, date, status, item.memo || item.note || '', verifiedAt, updatedAt],
    )
    saved.push({ studentId: student.id, status: toClientStatus(status) })
  }

  ok(res, { savedCount: saved.length, records: saved })
})

app.get('/api/device-tokens', authRequired(['teacher', 'admin']), (_req, res) => {
  ok(res, all(`
    SELECT id, token, device_name AS deviceName, location, revoked_at AS revokedAt,
           last_used_at AS lastUsedAt, created_at AS createdAt, 0 AS usageCount
    FROM device_tokens
    ORDER BY created_at DESC, id DESC
  `))
})

app.post('/api/device-tokens', authRequired(['teacher', 'admin']), (req, res) => {
  const { deviceName = '새 기기', location = '미지정' } = req.body || {}
  const token = generateDeviceToken()
  run(
    'INSERT INTO device_tokens (token, device_name, location, created_at) VALUES (?, ?, ?, ?)',
    [token, String(deviceName), String(location), now()],
  )
  ok(res, getDeviceTokenById(db.prepare('SELECT last_insert_rowid() AS id').get().id))
})

app.delete('/api/device-tokens/:id', authRequired(['teacher', 'admin']), (req, res) => {
  const device = getDeviceTokenById(req.params.id)
  if (!device) return fail(res, 404, 'NOT_FOUND', '기기 토큰을 찾을 수 없습니다.')
  run('UPDATE device_tokens SET revoked_at = ? WHERE id = ?', [now(), device.id])
  ok(res, getDeviceTokenById(device.id))
})

function getWeekDatesThrough(targetDate) {
  const target = new Date(`${targetDate}T00:00:00`)
  if (Number.isNaN(target.getTime())) return [today()]
  const day = target.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  const monday = new Date(target)
  monday.setDate(target.getDate() + mondayOffset)

  const dates = []
  for (const cursor = new Date(monday); cursor <= target; cursor.setDate(cursor.getDate() + 1)) {
    dates.push(formatDateKey(cursor))
  }
  return dates.length ? dates : [targetDate]
}

function weekdayLabel(date) {
  return new Intl.DateTimeFormat('ko-KR', { weekday: 'short' }).format(new Date(`${date}T00:00:00`))
}

function formatDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function getStudentApplicationById(id) {
  return one(`
    SELECT id, name, email, status, class_id AS classId, student_number AS studentNumber,
           reviewed_by AS reviewedBy, requested_at AS requestedAt, reviewed_at AS reviewedAt
    FROM student_applications
    WHERE id = ?
  `, [Number(id)])
}

export default app

if (!process.env.VERCEL) {
  const server = app.listen(PORT, () => {
    console.log(`Attendi API listening on http://localhost:${PORT}`)
  })

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Stop the existing server or set PORT to another value.`)
      process.exit(1)
    }
    throw error
  })
}
