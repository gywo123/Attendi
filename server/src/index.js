import express from 'express'
import cors from 'cors'
import crypto from 'node:crypto'
import { CLIENT_URL, CLIENT_URLS, GOOGLE_CLIENT_ID, GOOGLE_REDIRECT_URI, PORT, QR_TTL_SECONDS } from './config.js'
import { col, ensureDbReady, insertDoc, pingDb, publicDoc, publicDocs } from './db.js'
import { authOptional, authRequired, authResponse, currentAuthPayload, exchangeGoogleCode, upsertGoogleUser } from './auth.js'
import { csvCell, fail, ok } from './http.js'
import { parseCsv } from './csv.js'
import { encodeClientPayload, hashPassword, hashToken, verifyPassword } from './security.js'
import { now, today, toIsoAtDateTime } from './time.js'
import { createBackup, restoreBackup } from './backup.js'
import { logError, logInfo, requestContext, requestLogger } from './logger.js'
import {
  ValidationError,
  assertObject,
  dateKey,
  enumValue,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalString,
  requiredEmail,
  requiredNumber,
  requiredString,
  timeKey,
} from './validation.js'
import {
  extractQrToken,
  generateDeviceToken,
  getAttendanceStatus,
  getAttendancePolicy,
  getClassAttendancePolicies,
  getDeviceTokenById,
  getEffectiveAttendancePolicy,
  getSchoolLocation,
  getStudentById,
  getStudentFromRequest,
  getTeacherById,
  isAttendanceClosed,
  isInsideSchool,
  isPastAttendanceCloseTime,
  normalizeRole,
  normalizeTeacherStatus,
  readAttendanceRows,
  resolveClassId,
  saveAttendancePolicy,
  saveClassAttendancePolicy,
  toClientAttendanceRow,
  toClientStatus,
  toDbStatus,
  upsertAttendanceClosure,
} from './domain.js'

const app = express()
const route = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
const vercelPreviewOrigin = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i
const localOrigin = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/

const corsMiddleware = cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true)
    const normalizedOrigin = origin.replace(/\/$/, '')
    if (CLIENT_URLS.includes(normalizedOrigin) || localOrigin.test(origin) || vercelPreviewOrigin.test(origin)) {
      return callback(null, true)
    }
    return callback(null, false)
  },
  credentials: true,
  optionsSuccessStatus: 204,
})

app.use(corsMiddleware)
app.options('*', corsMiddleware)
app.use(requestContext)
app.use(requestLogger)
app.use(express.json({ limit: '10mb' }))

app.get('/', (_req, res) => {
  ok(res, { service: 'Attendi API', db: 'mongodb', health: '/api/health', time: new Date().toISOString() })
})

app.get('/api/health', route(async (_req, res) => {
  await pingDb()
  ok(res, { status: 'ok', db: 'mongodb', time: new Date().toISOString() })
}))

app.use('/api', route(async (_req, _res, next) => {
  await ensureDbReady()
  next()
}))

app.get('/api/admin/backup', authRequired(['admin']), route(async (req, res) => {
  const backup = await createBackup()
  const fileDate = backup.exportedAt.slice(0, 10)
  logInfo('db_backup_created', { requestId: req.requestId, userId: req.user.id, exportedAt: backup.exportedAt })
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="attendi-backup-${fileDate}.json"`)
  res.json(backup)
}))

app.post('/api/admin/restore', authRequired(['admin']), route(async (req, res) => {
  const body = assertObject(req.body)
  if (body.confirm !== 'RESTORE_ATTENDI') {
    return fail(res, 400, 'RESTORE_CONFIRM_REQUIRED', 'DB 복구를 실행하려면 confirm 값을 RESTORE_ATTENDI로 보내야 합니다.')
  }

  const mode = body.mode ? enumValue(String(body.mode), ['replace', 'merge'], 'mode', '복구 방식') : 'replace'
  const result = await restoreBackup(body.backup, { mode })
  logInfo('db_backup_restored', { requestId: req.requestId, userId: req.user.id, mode, counts: result.counts })
  ok(res, result)
}))

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

app.get('/api/auth/google/callback', route(async (req, res) => {
  const code = req.query.code
  const role = req.query.state === 'teacher' ? 'teacher' : 'student'
  if (!code) return res.redirect(`${CLIENT_URL}?auth_error=missing_code`)

  try {
    const googleUser = await exchangeGoogleCode(String(code))
    const result = await upsertGoogleUser({ role, googleUser })
    if (result.pendingApproval) {
      return res.redirect(`${CLIENT_URL}?signup_pending=${encodeClientPayload(result.pendingApproval)}`)
    }
    if (result.authError) {
      return res.redirect(`${CLIENT_URL}?auth_error=${encodeURIComponent(result.authError)}`)
    }
    res.redirect(`${CLIENT_URL}?auth=${encodeClientPayload(result)}`)
  } catch (error) {
    logError('google_oauth_failed', error, { requestId: req.requestId })
    res.redirect(`${CLIENT_URL}?auth_error=google_oauth_failed`)
  }
}))

app.get('/api/auth/me', authRequired([]), route(async (req, res) => {
  ok(res, await currentAuthPayload(req.user))
}))

app.post('/api/auth/teacher/login', route(async (req, res) => {
  const body = assertObject(req.body)
  const email = requiredEmail(body)
  const input = requiredString(body, body.password ? 'password' : 'passwordHash', '비밀번호', { max: 200 })

  const teacher = publicDoc(await col('teachers').findOne({ email }))
  if (!teacher || !verifyPassword(input, teacher.passwordHash)) {
    return fail(res, 401, 'UNAUTHORIZED', '이메일 또는 비밀번호가 올바르지 않습니다.')
  }
  if (teacher.status === 'pending') {
    return fail(res, 403, 'TEACHER_PENDING', '관리자 승인 대기 중인 교사 계정입니다.')
  }
  if (teacher.status && teacher.status !== 'active') {
    return fail(res, 403, 'TEACHER_INACTIVE', '비활성화된 교사 계정입니다.')
  }

  ok(res, await authResponse({
    id: teacher.id,
    role: teacher.role,
    name: teacher.name,
    email: teacher.email,
  }))
}))

app.post('/api/auth/teacher/signup', route(async (req, res) => {
  const body = assertObject(req.body)
  const name = requiredString(body, 'name', '이름')
  const email = requiredEmail(body)
  const password = requiredString(body, 'password', '비밀번호', { max: 200 })
  const school = optionalString(body, 'school', '학교', { defaultValue: '학교' })
  const subject = optionalString(body, 'subject', '담당 과목')

  try {
    const teacher = await insertDoc('teachers', {
      name: String(name),
      email: String(email),
      role: 'teacher',
      passwordHash: hashPassword(String(password)),
      school: String(school),
      subject: String(subject),
      status: 'pending',
      createdAt: now(),
    })
    ok(res, { id: teacher.id, name, email, status: 'pending' })
  } catch (error) {
    if (isDuplicate(error)) return fail(res, 409, 'DUPLICATE_TEACHER_EMAIL', '이미 등록된 교사 이메일입니다.')
    throw error
  }
}))

app.post('/api/auth/student/signup', route(async (req, res) => {
  const body = assertObject(req.body)
  const name = requiredString(body, 'name', '이름')
  const email = requiredEmail(body)

  const activeStudent = await col('students').findOne({ email, isActive: true })
  if (activeStudent) return fail(res, 409, 'STUDENT_ALREADY_APPROVED', '이미 승인된 학생 계정입니다.')

  const pending = await col('studentApplications').findOne({ email: String(email), status: 'pending' })
  if (!pending) {
    await insertDoc('studentApplications', {
      name: String(name),
      email: String(email),
      status: 'pending',
      requestedAt: now(),
    })
  }
  ok(res, { name, email, role: 'student', status: 'pending' })
}))

app.post('/api/device/login', route(async (req, res) => {
  const body = assertObject(req.body)
  const token = requiredString(body, 'token', '기기 토큰', { max: 80 })
  const deviceName = optionalString(body, 'deviceName', '기기 이름')

  const device = publicDoc(await col('deviceTokens').findOne({ token, revokedAt: null }))
  if (!device) return fail(res, 401, 'UNAUTHORIZED', '유효하지 않은 기기 토큰입니다.')

  await col('deviceTokens').updateOne(
    { id: device.id },
    { $set: { deviceName: deviceName || device.deviceName, lastUsedAt: now() } },
  )

  ok(res, await authResponse({
    id: device.id,
    role: 'device',
    name: deviceName || device.deviceName || '출석 인식기',
    deviceName: deviceName || device.deviceName || '출석 인식기',
    email: '',
  }))
}))

app.get('/api/classes', authOptional, route(async (_req, res) => {
  ok(res, publicDocs(await col('classes').find().sort({ id: 1 }).toArray()))
}))

app.get('/api/attendance/policy', authRequired(['teacher', 'admin']), route(async (_req, res) => {
  const [policy, classPolicies] = await Promise.all([
    getAttendancePolicy(),
    getClassAttendancePolicies(),
  ])
  ok(res, { policy, classPolicies })
}))

app.put('/api/attendance/policy', authRequired(['teacher', 'admin']), route(async (req, res) => {
  const body = assertObject(req.body)
  const policy = await saveAttendancePolicy({
    startTime: timeKey(body.startTime, 'startTime', '수업 시작 시간'),
    lateAfterTime: timeKey(body.lateAfterTime, 'lateAfterTime', '지각 기준 시간'),
    closeTime: timeKey(body.closeTime, 'closeTime', '출석 마감 시간'),
    autoAbsentEnabled: optionalBoolean(body, 'autoAbsentEnabled', false),
  })
  ok(res, policy)
}))

app.put('/api/classes/:id/attendance-policy', authRequired(['teacher', 'admin']), route(async (req, res) => {
  const body = assertObject(req.body)
  const policy = await saveClassAttendancePolicy(req.params.id, {
    startTime: body.startTime ? timeKey(body.startTime, 'startTime', '수업 시작 시간') : '',
    lateAfterTime: body.lateAfterTime ? timeKey(body.lateAfterTime, 'lateAfterTime', '지각 기준 시간') : '',
    closeTime: body.closeTime ? timeKey(body.closeTime, 'closeTime', '출석 마감 시간') : '',
  })
  if (!policy) return fail(res, 404, 'CLASS_NOT_FOUND', '반을 찾을 수 없습니다.')
  ok(res, policy)
}))

app.get('/api/students', authOptional, route(async (req, res) => {
  const { classId, keyword, includeInactive } = req.query
  const filter = includeInactive === 'true' ? {} : { isActive: true }
  if (classId) filter.classId = Number(classId)
  if (keyword) {
    filter.$or = [
      { name: { $regex: escapeRegex(keyword), $options: 'i' } },
      { studentNumber: { $regex: escapeRegex(keyword), $options: 'i' } },
    ]
  }

  const students = publicDocs(await col('students').find(filter).sort({ classId: 1, studentNumber: 1 }).toArray())
  ok(res, await Promise.all(students.map(withClassName)))
}))

app.get('/api/students/export.csv', authRequired(['teacher', 'admin']), route(async (req, res) => {
  const includeInactive = req.query.includeInactive === 'true'
  const filter = includeInactive ? {} : { isActive: true }
  const students = publicDocs(await col('students').find(filter).sort({ classId: 1, studentNumber: 1 }).toArray())
  const rows = await Promise.all(students.map(withClassName))
  const csv = [
    ['name', 'studentNumber', 'className', 'email', 'isActive'],
    ...rows.map((row) => [row.name, row.studentNumber, row.className, row.email || '', row.isActive ? 'true' : 'false']),
  ].map((line) => line.map(csvCell).join(',')).join('\n')
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="students.csv"')
  res.send(`\uFEFF${csv}`)
}))

app.post('/api/students/import', authRequired(['teacher', 'admin']), route(async (req, res) => {
  const body = assertObject(req.body)
  const rows = Array.isArray(req.body?.students)
    ? req.body.students
    : parseCsv(String(body.csv || ''))
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
      const classId = await resolveClassId({ className })
      const existing = await col('students').findOne({ studentNumber: String(studentNumber) })
      if (existing) {
        await col('students').updateOne(
          { id: existing.id },
          { $set: { name: String(name), classId, email: String(email), isActive } },
        )
        imported.push(await getStudentById(existing.id))
      } else {
        const student = await insertDoc('students', {
          classId,
          studentNumber: String(studentNumber),
          name: String(name),
          email: String(email),
          isActive,
          createdAt: now(),
        })
        imported.push(await getStudentById(student.id))
      }
    } catch (error) {
      skipped.push({ row, reason: duplicateMessage(error, error.message) })
    }
  }

  ok(res, { importedCount: imported.length, skippedCount: skipped.length, students: imported, skipped })
}))

app.post('/api/students', authRequired(['teacher', 'admin']), route(async (req, res) => {
  const body = assertObject(req.body)
  const name = requiredString(body, 'name', '이름')
  const studentNumber = requiredString(body, 'studentNumber', '학번', { max: 40 })
  const email = body.email ? requiredEmail(body) : ''
  const classId = optionalInteger(body, 'classId', '반 ID')
  const className = optionalString(body, 'className', '반')
  const grade = optionalInteger(body, 'grade', '학년')
  const classNum = optionalInteger(body, 'classNum', '반 번호')
  const isActive = optionalBoolean(body, 'isActive', true)

  const resolvedClassId = await resolveClassId({ classId, className, grade, classNum })
  try {
    const student = await insertDoc('students', {
      classId: resolvedClassId,
      studentNumber: String(studentNumber),
      name: String(name),
      email: String(email),
      isActive: Boolean(isActive),
      createdAt: now(),
    })
    ok(res, await getStudentById(student.id))
  } catch (error) {
    if (isDuplicate(error)) return fail(res, 409, 'DUPLICATE_STUDENT_NUMBER', '이미 등록된 학번입니다.')
    throw error
  }
}))

app.patch('/api/students/:id', authRequired(['teacher', 'admin']), route(async (req, res) => {
  const student = await getStudentById(req.params.id)
  if (!student) return fail(res, 404, 'NOT_FOUND', '학생을 찾을 수 없습니다.')

  const body = assertObject(req.body)
  const name = body.name === undefined ? undefined : requiredString(body, 'name', '이름')
  const studentNumber = body.studentNumber === undefined ? undefined : requiredString(body, 'studentNumber', '학번', { max: 40 })
  const email = body.email === undefined || body.email === '' ? body.email : requiredEmail(body)
  const classId = optionalInteger(body, 'classId', '반 ID')
  const className = optionalString(body, 'className', '반')
  const grade = optionalInteger(body, 'grade', '학년')
  const classNum = optionalInteger(body, 'classNum', '반 번호')
  const isActive = body.isActive === undefined ? undefined : optionalBoolean(body, 'isActive', Boolean(student.isActive))
  const resolvedClassId = classId || className || grade || classNum
    ? await resolveClassId({ classId, className, grade, classNum })
    : student.classId

  try {
    await col('students').updateOne(
      { id: student.id },
      {
        $set: {
          classId: resolvedClassId,
          studentNumber: String(studentNumber ?? student.studentNumber),
          name: String(name ?? student.name),
          email: String(email ?? student.email ?? ''),
          isActive: isActive === undefined ? Boolean(student.isActive) : Boolean(isActive),
        },
      },
    )
    ok(res, await getStudentById(student.id))
  } catch (error) {
    if (isDuplicate(error)) return fail(res, 409, 'DUPLICATE_STUDENT_NUMBER', '이미 등록된 학번입니다.')
    throw error
  }
}))

app.delete('/api/students/:id', authRequired(['teacher', 'admin']), route(async (req, res) => {
  const student = await getStudentById(req.params.id)
  if (!student) return fail(res, 404, 'NOT_FOUND', '학생을 찾을 수 없습니다.')
  await Promise.all([
    col('attendanceRecords').deleteMany({ studentId: student.id }),
    col('qrSessions').deleteMany({ studentId: student.id }),
    col('students').deleteOne({ id: student.id }),
  ])
  ok(res, { id: student.id, deleted: true })
}))

app.get('/api/student-applications', authRequired(['teacher', 'admin']), route(async (req, res) => {
  const status = ['pending', 'approved', 'rejected'].includes(String(req.query.status)) ? String(req.query.status) : 'pending'
  ok(res, publicDocs(await col('studentApplications').find({ status }).sort({ requestedAt: -1, id: -1 }).toArray()))
}))

app.patch('/api/student-applications/:id', authRequired(['teacher', 'admin']), route(async (req, res) => {
  const application = publicDoc(await col('studentApplications').findOne({ id: Number(req.params.id) }))
  if (!application) return fail(res, 404, 'NOT_FOUND', '학생 가입 신청을 찾을 수 없습니다.')
  if (application.status !== 'pending') {
    return fail(res, 409, 'APPLICATION_ALREADY_REVIEWED', '이미 처리된 학생 가입 신청입니다.')
  }

  const body = assertObject(req.body)
  const action = body.status === 'rejected' ? 'rejected' : 'approved'
  if (action === 'rejected') {
    await col('studentApplications').updateOne(
      { id: application.id },
      { $set: { status: 'rejected', reviewedBy: req.user.id, reviewedAt: now() } },
    )
    return ok(res, await getStudentApplicationById(application.id))
  }

  const studentNumber = requiredString(body, 'studentNumber', '승인할 학생의 학번', { max: 40 })
  const classId = optionalInteger(body, 'classId', '반 ID')
  const className = optionalString(body, 'className', '반')
  const grade = optionalInteger(body, 'grade', '학년')
  const classNum = optionalInteger(body, 'classNum', '반 번호')
  const name = optionalString(body, 'name', '이름')

  const resolvedClassId = await resolveClassId({ classId, className, grade, classNum })
  const finalName = String(name || application.name)
  const finalNumber = String(studentNumber)
  try {
    const existingStudent = await col('students').findOne({
      $or: [{ email: application.email }, { studentNumber: finalNumber }],
    })
    if (existingStudent) {
      await col('students').updateOne(
        { id: existingStudent.id },
        { $set: { name: finalName, classId: resolvedClassId, studentNumber: finalNumber, email: application.email, isActive: true } },
      )
    } else {
      await insertDoc('students', {
        classId: resolvedClassId,
        studentNumber: finalNumber,
        name: finalName,
        email: application.email,
        isActive: true,
        createdAt: now(),
      })
    }
    await col('studentApplications').updateOne(
      { id: application.id },
      { $set: { status: 'approved', classId: resolvedClassId, studentNumber: finalNumber, reviewedBy: req.user.id, reviewedAt: now() } },
    )
    ok(res, {
      application: await getStudentApplicationById(application.id),
      student: await getStudentById(finalNumber),
    })
  } catch (error) {
    if (isDuplicate(error)) return fail(res, 409, 'DUPLICATE_STUDENT_NUMBER', '이미 등록된 학번입니다.')
    throw error
  }
}))

app.get('/api/teachers', authRequired(['teacher', 'admin']), route(async (_req, res) => {
  ok(res, publicDocs(await col('teachers').find({}, { projection: { passwordHash: 0 } }).sort({ createdAt: -1, id: -1 }).toArray()))
}))

app.get('/api/teachers/export.csv', authRequired(['teacher', 'admin']), route(async (_req, res) => {
  const rows = publicDocs(await col('teachers').find({}, { projection: { passwordHash: 0 } }).sort({ createdAt: -1, id: -1 }).toArray())
  const csv = [
    ['name', 'email', 'role', 'school', 'subject', 'status', 'joinedAt'],
    ...rows.map((row) => [row.name, row.email, row.role, row.school, row.subject, row.status, row.createdAt]),
  ].map((line) => line.map(csvCell).join(',')).join('\n')
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="teachers.csv"')
  res.send(`\uFEFF${csv}`)
}))

app.post('/api/teachers', authRequired(['admin', 'teacher']), route(async (req, res) => {
  const body = assertObject(req.body)
  const name = requiredString(body, 'name', '이름')
  const email = requiredEmail(body)
  const role = normalizeRole(optionalString(body, 'role', '역할', { defaultValue: 'teacher' }))
  const school = optionalString(body, 'school', '학교', { defaultValue: '학교' })
  const subject = optionalString(body, 'subject', '담당 과목')
  const status = normalizeTeacherStatus(optionalString(body, 'status', '상태', { defaultValue: 'active' }))
  const password = optionalString(body, 'password', '비밀번호', { defaultValue: '1234', max: 200 })

  try {
    const teacher = await insertDoc('teachers', {
      name: String(name),
      email: String(email),
      role,
      passwordHash: hashPassword(password),
      school: String(school),
      subject: String(subject),
      status,
      createdAt: now(),
    })
    ok(res, await getTeacherById(teacher.id))
  } catch (error) {
    if (isDuplicate(error)) return fail(res, 409, 'DUPLICATE_TEACHER_EMAIL', '이미 등록된 교사 이메일입니다.')
    throw error
  }
}))

app.patch('/api/teachers/:id', authRequired(['admin', 'teacher']), route(async (req, res) => {
  const teacher = await getTeacherById(req.params.id)
  if (!teacher) return fail(res, 404, 'NOT_FOUND', '교사를 찾을 수 없습니다.')

  const body = assertObject(req.body)
  const name = body.name === undefined ? teacher.name : requiredString(body, 'name', '이름')
  const email = body.email === undefined ? teacher.email : requiredEmail(body)
  const role = normalizeRole(body.role === undefined ? teacher.role : optionalString(body, 'role', '역할', { defaultValue: teacher.role }))
  const school = body.school === undefined ? teacher.school : optionalString(body, 'school', '학교', { defaultValue: teacher.school ?? '학교' })
  const subject = body.subject === undefined ? teacher.subject : optionalString(body, 'subject', '담당 과목')
  const status = normalizeTeacherStatus(body.status === undefined ? teacher.status : optionalString(body, 'status', '상태', { defaultValue: teacher.status }))
  try {
    await col('teachers').updateOne(
      { id: teacher.id },
      {
        $set: {
          name: String(name ?? teacher.name),
          email: String(email ?? teacher.email),
          role: normalizeRole(role ?? teacher.role),
          school: String(school ?? teacher.school ?? '학교'),
          subject: String(subject ?? teacher.subject ?? ''),
          status: normalizeTeacherStatus(status ?? teacher.status),
        },
      },
    )
    ok(res, await getTeacherById(teacher.id))
  } catch (error) {
    if (isDuplicate(error)) return fail(res, 409, 'DUPLICATE_TEACHER_EMAIL', '이미 등록된 교사 이메일입니다.')
    throw error
  }
}))

app.delete('/api/teachers/:id', authRequired(['admin', 'teacher']), route(async (req, res) => {
  const teacher = await getTeacherById(req.params.id)
  if (!teacher) return fail(res, 404, 'NOT_FOUND', '교사를 찾을 수 없습니다.')
  await col('teachers').deleteOne({ id: teacher.id })
  ok(res, { id: teacher.id, deleted: true })
}))

app.get('/api/school-location', authOptional, route(async (_req, res) => {
  ok(res, await getSchoolLocation())
}))

app.put('/api/school-location', authRequired(['teacher', 'admin']), route(async (req, res) => {
  const body = assertObject(req.body)
  const name = optionalString(body, 'name', '학교 이름', { defaultValue: '학교' })
  const latitude = requiredNumber(body, 'latitude', '위도', { min: -90, max: 90 })
  const longitude = requiredNumber(body, 'longitude', '경도', { min: -180, max: 180 })
  const radiusMeters = requiredNumber(body, 'radiusMeters', '허용 반경', { min: 10, max: 5000 })

  await col('schools').updateOne(
    { id: 1 },
    { $set: { name: String(name), latitude: Number(latitude), longitude: Number(longitude), radiusMeters: Number(radiusMeters) } },
    { upsert: true },
  )
  ok(res, await getSchoolLocation())
}))

app.post('/api/location/verify', authOptional, route(async (req, res) => {
  const body = assertObject(req.body)
  const latitude = requiredNumber(body, 'latitude', '위도', { min: -90, max: 90 })
  const longitude = requiredNumber(body, 'longitude', '경도', { min: -180, max: 180 })
  ok(res, { insideSchoolArea: await isInsideSchool(latitude, longitude) })
}))

app.post('/api/qr-sessions', authOptional, route(async (req, res) => {
  const student = await getStudentFromRequest(req)
  if (!student) return fail(res, 404, 'STUDENT_NOT_FOUND', '출석 처리할 학생을 찾을 수 없습니다.')
  const body = assertObject(req.body)
  const classId = optionalInteger(body, 'classId', '반 ID', { defaultValue: student.classId })
  const latitude = requiredNumber(body, 'latitude', '위도', { min: -90, max: 90 })
  const longitude = requiredNumber(body, 'longitude', '경도', { min: -180, max: 180 })
  const accuracyMeters = optionalNumber(body, 'accuracyMeters', 'GPS 정확도', { min: 0, max: 10000 })
  if (await isAttendanceClosed(today(), classId)) {
    return fail(res, 409, 'ATTENDANCE_CLOSED', '오늘 출석이 마감되어 QR 코드를 발급할 수 없습니다.')
  }
  if (await isPastAttendanceCloseTime({ classId })) {
    return fail(res, 409, 'ATTENDANCE_CLOSED', '출석 가능 시간이 지나 QR 코드를 발급할 수 없습니다.')
  }
  if (!await isInsideSchool(latitude, longitude)) {
    return fail(res, 422, 'OUT_OF_SCHOOL_AREA', '학교 인증 구역 밖에서는 QR 코드를 발급할 수 없습니다.')
  }

  const token = crypto.randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + QR_TTL_SECONDS * 1000).toISOString()
  const session = await insertDoc('qrSessions', {
    studentId: student.id,
    classId: Number(classId),
    tokenHash: hashToken(token),
    latitude: latitude ?? null,
    longitude: longitude ?? null,
    accuracyMeters: accuracyMeters ?? null,
    expiresAt,
    usedAt: null,
    createdAt: now(),
  })

  ok(res, {
    qrSessionId: session.id,
    qrPayload: `attendi://attendance?token=${token}`,
    expiresAt,
    expiresInSeconds: QR_TTL_SECONDS,
  })
}))

app.post('/api/qr-sessions/verify', authRequired(['teacher', 'admin', 'device']), route(async (req, res) => {
  const body = assertObject(req.body)
  const qrPayload = requiredString(body, 'qrPayload', 'QR 코드', { max: 500 })
  const token = extractQrToken(qrPayload)
  if (!token) return fail(res, 400, 'INVALID_QR', '유효하지 않은 QR 코드입니다.')

  const session = publicDoc(await col('qrSessions').findOne({ tokenHash: hashToken(token) }))
  if (!session) return fail(res, 400, 'INVALID_QR', '유효하지 않은 QR 코드입니다.')
  if (session.usedAt) return fail(res, 409, 'DUPLICATE_ATTENDANCE', '이미 출석 처리된 QR 코드입니다.')
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    return fail(res, 410, 'QR_EXPIRED', '만료된 QR 코드입니다.')
  }

  const verifiedAt = now()
  const date = verifiedAt.slice(0, 10)
  if (await isAttendanceClosed(date, session.classId)) {
    return fail(res, 409, 'ATTENDANCE_CLOSED', '이미 마감된 출석입니다.')
  }
  if (await isPastAttendanceCloseTime({ classId: session.classId, at: verifiedAt })) {
    return fail(res, 409, 'ATTENDANCE_CLOSED', '출석 가능 시간이 지난 QR 코드입니다.')
  }
  const status = await getAttendanceStatus({ classId: session.classId, at: verifiedAt })
  const existing = await col('attendanceRecords').findOne({ studentId: session.studentId, classId: session.classId, date })
  if (existing) return fail(res, 409, 'DUPLICATE_ATTENDANCE', '이미 출석 처리된 학생입니다.')

  await col('qrSessions').updateOne({ id: session.id }, { $set: { usedAt: verifiedAt } })
  await insertDoc('attendanceRecords', {
    studentId: session.studentId,
    classId: session.classId,
    date,
    status,
    memo: '',
    verifiedByQr: true,
    verifiedLatitude: session.latitude,
    verifiedLongitude: session.longitude,
    verifiedAt,
    updatedAt: verifiedAt,
  })

  const student = await getStudentById(session.studentId)
  ok(res, { result: 'accepted', status: toClientStatus(status), verifiedAt, student })
}))

app.get('/api/attendance/summary', authOptional, route(async (req, res) => {
  const date = String(req.query.date || today())
  const classId = req.query.classId ? Number(req.query.classId) : null
  const filter = { date, ...(classId ? { classId } : {}) }
  const [records, total, recentRecords] = await Promise.all([
    col('attendanceRecords').find(filter).toArray(),
    col('students').countDocuments({ isActive: true, ...(classId ? { classId } : {}) }),
    col('attendanceRecords').find(filter).sort({ verifiedAt: -1, id: -1 }).limit(8).toArray(),
  ])
  const counts = countStatuses(records)
  const recentScans = await Promise.all(publicDocs(recentRecords).map(withRecentAttendanceNames))

  ok(res, {
    date,
    classId,
    summary: {
      total,
      present: counts.present || 0,
      late: counts.late || 0,
      absent: counts.absent || Math.max(0, total - (counts.present || 0) - (counts.late || 0) - (counts.early_leave || 0) - (counts.excused || 0) - (counts.sick || 0)),
      earlyLeave: counts.early_leave || 0,
      excused: counts.excused || 0,
      sick: counts.sick || 0,
    },
    recentScans: recentScans.map((row) => ({ ...row, status: toClientStatus(row.status) })),
  })
}))

app.get('/api/attendance/weekly-summary', authOptional, route(async (req, res) => {
  const targetDate = String(req.query.date || today())
  const classId = req.query.classId ? Number(req.query.classId) : null
  const days = getWeekDatesThrough(targetDate)
  const [total, records] = await Promise.all([
    col('students').countDocuments({ isActive: true, ...(classId ? { classId } : {}) }),
    col('attendanceRecords').find({
      date: { $gte: days[0], $lte: days[days.length - 1] },
      ...(classId ? { classId } : {}),
    }).toArray(),
  ])
  const countByDate = new Map()
  for (const row of records) {
    if (!countByDate.has(row.date)) countByDate.set(row.date, {})
    countByDate.get(row.date)[row.status] = (countByDate.get(row.date)[row.status] || 0) + 1
  }

  ok(res, {
    date: targetDate,
    classId,
    days: days.map((date) => {
      const counts = countByDate.get(date) || {}
      const present = counts.present || 0
      const late = counts.late || 0
      const earlyLeave = counts.early_leave || 0
      const excused = counts.excused || 0
      const sick = counts.sick || 0
      const attended = present + late + earlyLeave
      return {
        date,
        dayLabel: date === targetDate ? '오늘' : weekdayLabel(date),
        total,
        present,
        late,
        earlyLeave,
        excused,
        sick,
        absent: counts.absent || Math.max(0, total - attended - excused - sick),
        attended,
        rate: total ? Math.round((attended / total) * 100) : 0,
      }
    }),
  })
}))

app.get('/api/attendance', authOptional, route(async (req, res) => {
  ok(res, (await readAttendanceRows(req.query)).map(toClientAttendanceRow))
}))

app.get('/api/attendance/export.csv', authOptional, route(async (req, res) => {
  const rows = await readAttendanceRows(req.query)
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
}))

app.post('/api/attendance/close', authRequired(['teacher', 'admin']), route(async (req, res) => {
  const body = assertObject(req.body)
  const selectedDate = dateKey(body.date || today())
  const classId = body.classId === undefined || body.classId === null || body.classId === ''
    ? null
    : optionalInteger(body, 'classId', '반 ID')
  const policy = await getEffectiveAttendancePolicy(classId)
  const autoCreateAbsent = body.autoCreateAbsent === undefined
    ? Boolean(policy.autoAbsentEnabled)
    : optionalBoolean(body, 'autoCreateAbsent', Boolean(policy.autoAbsentEnabled))
  const closure = await upsertAttendanceClosure({ date: selectedDate, classId, closedBy: req.user.id })
  const createdAbsentCount = autoCreateAbsent
    ? await createMissingAbsences({ date: selectedDate, classId })
    : 0
  ok(res, { closure, createdAbsentCount })
}))

app.post('/api/attendance/manual', authRequired(['teacher', 'admin']), route(async (req, res) => {
  const body = assertObject(req.body)
  const selectedDate = body.date ? dateKey(body.date) : today()
  const input = Array.isArray(body.records) ? body.records : [body]
  const saved = []

  for (const item of input) {
    if (!item || typeof item !== 'object') continue
    if (!item.studentId || !item.status) continue
    const student = await getStudentById(item.studentId)
    if (!student) continue
    if (await isAttendanceClosed(selectedDate, student.classId)) {
      return fail(res, 409, 'ATTENDANCE_CLOSED', '이미 마감된 날짜 또는 반입니다.')
    }
    const status = toDbStatus(enumValue(String(item.status), ['present', 'late', 'absent', 'early', 'early_leave', 'excused', 'sick'], 'status', '출석 상태'))
    const verifiedAt = status === 'absent' ? null : toIsoAtDateTime(selectedDate, item.time)
    const updatedAt = now()
    const filter = { studentId: student.id, classId: student.classId, date: selectedDate }
    const existing = await col('attendanceRecords').findOne(filter)
    const data = {
      ...filter,
      status,
      memo: item.memo || item.note || '',
      verifiedByQr: false,
      verifiedAt,
      updatedAt,
    }
    if (existing) {
      await col('attendanceRecords').updateOne({ id: existing.id }, { $set: data })
    } else {
      await insertDoc('attendanceRecords', data)
    }
    saved.push({ studentId: student.id, status: toClientStatus(status) })
  }

  ok(res, { savedCount: saved.length, records: saved })
}))

app.get('/api/device-tokens', authRequired(['teacher', 'admin']), route(async (_req, res) => {
  const rows = publicDocs(await col('deviceTokens').find().sort({ createdAt: -1, id: -1 }).toArray())
  ok(res, rows.map((row) => ({ ...row, usageCount: 0 })))
}))

app.post('/api/device-tokens', authRequired(['teacher', 'admin']), route(async (req, res) => {
  const body = req.body ? assertObject(req.body) : {}
  const deviceName = optionalString(body, 'deviceName', '기기 이름', { defaultValue: '새 기기' })
  const location = optionalString(body, 'location', '설치 위치', { defaultValue: '미지정' })
  const token = await generateDeviceToken()
  const device = await insertDoc('deviceTokens', {
    token,
    deviceName: String(deviceName),
    location: String(location),
    revokedAt: null,
    lastUsedAt: null,
    createdAt: now(),
  })
  ok(res, await getDeviceTokenById(device.id))
}))

app.delete('/api/device-tokens/:id', authRequired(['teacher', 'admin']), route(async (req, res) => {
  const device = await getDeviceTokenById(req.params.id)
  if (!device) return fail(res, 404, 'NOT_FOUND', '기기 토큰을 찾을 수 없습니다.')
  await col('deviceTokens').updateOne({ id: device.id }, { $set: { revokedAt: now() } })
  ok(res, await getDeviceTokenById(device.id))
}))

app.use((error, req, res, _next) => {
  if (error?.type === 'entity.parse.failed') {
    logInfo('invalid_json', { requestId: req.requestId, path: req.originalUrl })
    return fail(res, 400, 'INVALID_JSON', 'JSON 형식이 올바르지 않습니다.')
  }

  if (error instanceof ValidationError) {
    logInfo('validation_failed', { requestId: req.requestId, path: req.originalUrl, details: error.details })
    return fail(res, error.status, error.code, error.message, error.details)
  }

  if (error?.name === 'ApiError') {
    logInfo('api_error', { requestId: req.requestId, path: req.originalUrl, status: error.status, code: error.code })
    return fail(res, error.status, error.code, error.message, error.details)
  }

  if (isDuplicate(error)) {
    logInfo('duplicate_key', { requestId: req.requestId, path: req.originalUrl })
    return fail(res, 409, 'DUPLICATE_VALUE', '이미 등록된 값입니다.')
  }

  logError('unhandled_error', error, { requestId: req.requestId, path: req.originalUrl })
  fail(res, 500, 'INTERNAL_SERVER_ERROR', '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.')
})

export default app

if (!process.env.VERCEL) {
  const server = app.listen(PORT, () => {
    console.log(`Attendi API listening on http://localhost:${PORT}`)
  })

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      logError('server_port_in_use', error, { port: PORT })
      process.exit(1)
    }
    throw error
  })
}

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

async function getStudentApplicationById(id) {
  return publicDoc(await col('studentApplications').findOne({ id: Number(id) }))
}

async function withClassName(student) {
  const cls = await col('classes').findOne({ id: Number(student.classId) }, { projection: { _id: 0 } })
  return { ...student, className: cls?.name || '' }
}

async function withRecentAttendanceNames(row) {
  const [student, cls] = await Promise.all([
    col('students').findOne({ id: Number(row.studentId) }, { projection: { _id: 0 } }),
    col('classes').findOne({ id: Number(row.classId) }, { projection: { _id: 0 } }),
  ])
  return {
    studentId: student?.id || row.studentId,
    studentName: student?.name || '',
    studentNumber: student?.studentNumber || '',
    className: cls?.name || '',
    status: row.status,
    verifiedAt: row.verifiedAt,
  }
}

function countStatuses(records) {
  return records.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1
    return acc
  }, {})
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isDuplicate(error) {
  return error?.code === 11000
}

function duplicateMessage(error, fallback) {
  return isDuplicate(error) ? '중복된 값' : fallback
}

async function createMissingAbsences({ date, classId }) {
  const studentFilter = { isActive: true, ...(classId ? { classId: Number(classId) } : {}) }
  const students = await col('students').find(studentFilter, { projection: { _id: 0 } }).toArray()
  let created = 0
  for (const student of students) {
    const filter = { studentId: student.id, classId: student.classId, date }
    const existing = await col('attendanceRecords').findOne(filter)
    if (existing) continue
    await insertDoc('attendanceRecords', {
      ...filter,
      status: 'absent',
      memo: '마감 시 자동 결석 처리',
      verifiedByQr: false,
      verifiedAt: null,
      updatedAt: now(),
    })
    created += 1
  }
  return created
}
