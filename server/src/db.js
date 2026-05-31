import { MongoClient } from 'mongodb'
import { DB_NAME, MONGODB_URI } from './config.js'
import { hashPassword } from './security.js'
import { now } from './time.js'

let client
let database
let initPromise
let bootstrapped = false
let bootstrapPromise

export const DATA_COLLECTIONS = [
  'schools',
  'classes',
  'students',
  'studentApplications',
  'teachers',
  'deviceTokens',
  'qrSessions',
  'attendanceRecords',
  'attendancePolicies',
  'classAttendancePolicies',
  'attendanceClosures',
  'counters',
]

export async function initDb() {
  if (database) return database
  if (initPromise) return initPromise
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI environment variable is required.')
  }

  initPromise = (async () => {
    client = new MongoClient(MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    })
    await client.connect()
    database = client.db(DB_NAME)
    ensureIndexesInBackground()

    return database
  })().catch((error) => {
    initPromise = null
    database = null
    client = null
    throw error
  })

  return initPromise
}

export async function ensureDbReady() {
  await initDb()
  if (bootstrapped) return database
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      await ensureInitialData()
      bootstrapped = true
    })().catch((error) => {
      bootstrapPromise = null
      throw error
    })
  }
  await bootstrapPromise
  return database
}

export async function pingDb() {
  const db = await initDb()
  await db.command({ ping: 1 })
  return true
}

export function col(name) {
  if (!database) throw new Error('Database has not been initialized.')
  return database.collection(name)
}

export function db() {
  if (!database) throw new Error('Database has not been initialized.')
  return database
}

export async function ensureInitialData() {
  if (await col('appMeta').findOne({ _id: 'initialDataReady' })) return

  if (!await col('schools').findOne({ id: 1 })) {
    await col('schools').insertOne({
      id: 1,
      name: process.env.SCHOOL_NAME || '학교',
      latitude: Number(process.env.SCHOOL_LATITUDE || 37.2538509301),
      longitude: Number(process.env.SCHOOL_LONGITUDE || 126.9823507279),
      radiusMeters: Number(process.env.SCHOOL_RADIUS_METERS || 100),
    })
    await syncCounter('schools')
  }

  if (await col('classes').countDocuments() === 0) {
    for (const name of ['3학년 1반', '3학년 2반', '2학년 1반', '2학년 2반']) {
      await insertDoc('classes', { name, schoolLocationId: 1, createdAt: now() })
    }
  }

  if (!await col('attendancePolicies').findOne({ id: 1 })) {
    await col('attendancePolicies').insertOne({
      id: 1,
      startTime: '09:00',
      lateAfterTime: '09:10',
      closeTime: '17:00',
      autoAbsentEnabled: false,
      statuses: ['present', 'late', 'absent', 'early_leave', 'excused', 'sick'],
      updatedAt: now(),
    })
    await syncCounter('attendancePolicies')
  }

  await ensureTeacherInitial('관리자', 'admin@school.kr', 'admin', '')
  await col('appMeta').updateOne(
    { _id: 'initialDataReady' },
    { $set: { ready: true, updatedAt: now() } },
    { upsert: true },
  )
}

function ensureIndexesInBackground() {
  Promise.all([
    col('schools').createIndex({ id: 1 }, { unique: true }),
    col('classes').createIndex({ id: 1 }, { unique: true }),
    col('students').createIndex({ id: 1 }, { unique: true }),
    col('students').createIndex({ studentNumber: 1 }, { unique: true }),
    col('students').createIndex({ email: 1 }),
    col('students').createIndex({ classId: 1, isActive: 1 }),
    col('studentApplications').createIndex({ id: 1 }, { unique: true }),
    col('studentApplications').createIndex({ email: 1, status: 1 }),
    col('teachers').createIndex({ id: 1 }, { unique: true }),
    col('teachers').createIndex({ email: 1 }, { unique: true }),
    col('deviceTokens').createIndex({ id: 1 }, { unique: true }),
    col('deviceTokens').createIndex({ token: 1 }, { unique: true }),
    col('deviceTokens').createIndex({ tokenHash: 1 }),
    col('qrSessions').createIndex({ id: 1 }, { unique: true }),
    col('qrSessions').createIndex({ tokenHash: 1 }, { unique: true }),
    col('attendanceRecords').createIndex({ id: 1 }, { unique: true }),
    col('attendanceRecords').createIndex({ studentId: 1, classId: 1, date: 1 }, { unique: true }),
    col('attendanceRecords').createIndex({ date: 1, classId: 1 }),
    col('attendancePolicies').createIndex({ id: 1 }, { unique: true }),
    col('classAttendancePolicies').createIndex({ classId: 1 }, { unique: true }),
    col('attendanceClosures').createIndex({ date: 1, classId: 1 }, { unique: true }),
    col('rateLimits').createIndex({ key: 1 }, { unique: true }),
    col('rateLimits').createIndex({ resetAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 }),
  ]).catch((error) => {
    console.warn(`MongoDB index setup failed: ${error.message}`)
  })
}

export async function nextId(name) {
  const result = await col('counters').findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' },
  )
  return result?.seq ?? result?.value?.seq
}

export async function insertDoc(name, doc) {
  const id = doc.id ?? await nextId(name)
  const finalDoc = { ...doc, id }
  await col(name).insertOne(finalDoc)
  return finalDoc
}

export async function replaceDoc(name, filter, update) {
  await col(name).updateOne(filter, { $set: update })
  return col(name).findOne(filter, { projection: { _id: 0 } })
}

export function publicDoc(doc) {
  if (!doc) return null
  const { _id, ...rest } = doc
  return rest
}

export function publicDocs(docs) {
  return docs.map(publicDoc)
}

async function ensureTeacherInitial(name, email, role, subject) {
  const existing = await col('teachers').findOne({ email })
  const data = {
    name,
    role,
    passwordHash: hashPassword('1234'),
    school: '학교',
    subject,
    status: 'active',
  }
  if (existing) {
    await col('teachers').updateOne({ id: existing.id }, { $set: data })
    return
  }
  await insertDoc('teachers', {
    ...data,
    email,
    createdAt: now(),
  })
}

async function syncCounter(name) {
  const max = await col(name).find().sort({ id: -1 }).limit(1).next()
  await col('counters').updateOne(
    { _id: name },
    { $max: { seq: Number(max?.id || 0) } },
    { upsert: true },
  )
}

export async function syncAllCounters() {
  for (const name of DATA_COLLECTIONS.filter((item) => item !== 'counters')) {
    await syncCounter(name)
  }
}
