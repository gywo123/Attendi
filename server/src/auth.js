import crypto from 'node:crypto'
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } from './config.js'
import { fail } from './http.js'
import { col, insertDoc, publicDoc } from './db.js'
import { now } from './time.js'
import { displayStudentNumber, getStudentById } from './domain.js'
import { hashPassword, signJwt, verifyJwt } from './security.js'

export async function exchangeGoogleCode(code) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  })
  if (!response.ok) throw new Error(`Google token exchange failed: ${response.status}`)
  const tokenData = await response.json()
  const profile = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${tokenData.id_token}`).then((r) => r.json())
  return {
    name: profile.name || profile.email?.split('@')[0] || '사용자',
    email: profile.email,
  }
}

export async function upsertGoogleUser({ role, googleUser }) {
  if (role === 'teacher') {
    let teacher = publicDoc(await col('teachers').findOne({ email: googleUser.email }))
    if (!teacher) {
      teacher = await insertDoc('teachers', {
        name: googleUser.name,
        email: googleUser.email,
        role: 'teacher',
        passwordHash: hashPassword(crypto.randomBytes(12).toString('hex')),
        school: '학교',
        subject: '',
        status: 'pending',
        createdAt: now(),
      })
    }
    if (teacher.status === 'pending') {
      return { pendingApproval: { name: teacher.name || googleUser.name, email: teacher.email, role: 'teacher' } }
    }
    if (teacher.status && teacher.status !== 'active') {
      return { authError: 'teacher_inactive' }
    }
    return authResponse({ id: teacher.id, role: teacher.role, name: teacher.name, email: teacher.email })
  }

  const student = publicDoc(await col('students').findOne({ email: googleUser.email, isActive: true }))
  if (!student) {
    const pending = publicDoc(await col('studentApplications').findOne(
      { email: googleUser.email, status: 'pending' },
      { sort: { requestedAt: -1, id: -1 } },
    ))
    if (!pending) {
      await insertDoc('studentApplications', {
        name: googleUser.name,
        email: googleUser.email,
        status: 'pending',
        requestedAt: now(),
      })
    }
    const application = pending || { name: googleUser.name, email: googleUser.email }
    return { pendingApproval: { name: application.name, email: application.email, role: 'student' } }
  }
  return authResponse({
    id: student.id,
    role: 'student',
    name: student.name,
    email: student.email,
    class: student.className,
    number: student.studentNumber,
    studentId: student.studentNumber,
  })
}

export function authOptional(req, _res, next) {
  req.user = readBearerUser(req)
  next()
}

export function authRequired(roles) {
  return async (req, res, next) => {
    try {
      const user = readBearerUser(req)
      if (!user) return fail(res, 401, 'UNAUTHORIZED', '인증이 필요합니다.')
      const session = await refreshSessionUser(user)
      if (session.error) {
        return fail(res, session.status, session.code, session.message)
      }
      if (roles.length && !roles.includes(session.user.role)) return fail(res, 403, 'FORBIDDEN', '권한이 없습니다.')
      req.user = session.user
      next()
    } catch (error) {
      next(error)
    }
  }
}

export async function authResponse(user) {
  const student = user.role === 'student' ? await getStudentById(user.id) : null

  return {
    accessToken: signJwt(user),
    user: {
      ...user,
      class: user.class || student?.className,
      number: user.number || displayStudentNumber(student?.studentNumber),
      studentId: user.studentId || student?.studentNumber,
      classId: user.classId || student?.classId,
    },
    student: student ? {
      id: student.id,
      classId: student.classId,
      className: student.className,
      studentNumber: student.studentNumber,
      name: student.name,
    } : undefined,
  }
}

export async function currentAuthPayload(user) {
  if (user.role === 'student') {
    const student = await getStudentById(user.id)
    if (student) {
      return authResponse({
        id: student.id,
        role: 'student',
        name: student.name,
        email: student.email,
        class: student.className,
        number: displayStudentNumber(student.studentNumber),
        studentId: student.studentNumber,
        classId: student.classId,
      })
    }
  }

  if (user.role === 'teacher' || user.role === 'admin') {
    const teacher = publicDoc(await col('teachers').findOne(
      { id: Number(user.id) },
      { projection: { _id: 0, passwordHash: 0 } },
    ))
    if (teacher) return authResponse(teacher)
  }

  if (user.role === 'device') {
    const device = publicDoc(await col('deviceTokens').findOne({ id: Number(user.id), revokedAt: null }))
    if (device) {
      return authResponse({
        id: device.id,
        role: 'device',
        name: device.deviceName || '출석 인식기',
        deviceName: device.deviceName || '출석 인식기',
        email: '',
      })
    }
  }

  return authResponse(user)
}

function readBearerUser(req) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return null
  try { return verifyJwt(token) } catch { return null }
}

async function refreshSessionUser(user) {
  if (user.role === 'teacher' || user.role === 'admin') {
    const teacher = publicDoc(await col('teachers').findOne(
      { id: Number(user.id) },
      { projection: { _id: 0, passwordHash: 0 } },
    ))
    if (!teacher) {
      return { error: true, status: 401, code: 'UNAUTHORIZED', message: '교사 계정을 찾을 수 없습니다.' }
    }
    if (teacher.status === 'pending') {
      return { error: true, status: 403, code: 'TEACHER_PENDING', message: '관리자 승인 대기 중인 교사 계정입니다.' }
    }
    if (teacher.status && teacher.status !== 'active') {
      return { error: true, status: 403, code: 'TEACHER_INACTIVE', message: '비활성화된 교사 계정입니다.' }
    }
    return { user: { id: teacher.id, role: teacher.role, name: teacher.name, email: teacher.email } }
  }

  if (user.role === 'student') {
    const student = await col('students').findOne({ id: Number(user.id) }, { projection: { _id: 0 } })
    if (!student || !student.isActive) {
      return { error: true, status: 403, code: 'STUDENT_INACTIVE', message: '비활성화된 학생 계정입니다.' }
    }
  }

  if (user.role === 'device') {
    const device = await col('deviceTokens').findOne({ id: Number(user.id), revokedAt: null })
    if (!device) {
      return { error: true, status: 403, code: 'DEVICE_REVOKED', message: '사용 중지된 기기 토큰입니다.' }
    }
  }

  return { user }
}
