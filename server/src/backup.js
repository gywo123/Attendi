import { DATA_COLLECTIONS, col, syncAllCounters } from './db.js'
import { now } from './time.js'
import { ValidationError } from './validation.js'

const BACKUP_VERSION = 1

export async function createBackup() {
  const collections = {}
  for (const name of DATA_COLLECTIONS) {
    collections[name] = await col(name)
      .find({}, name === 'counters' ? {} : { projection: { _id: 0 } })
      .sort(name === 'counters' ? { _id: 1 } : { id: 1 })
      .toArray()
  }

  return {
    app: 'attendi',
    version: BACKUP_VERSION,
    exportedAt: now(),
    collections,
  }
}

export async function restoreBackup(input, { mode = 'replace' } = {}) {
  const backup = input?.backup || input
  validateBackup(backup)

  if (!['replace', 'merge'].includes(mode)) {
    throw new ValidationError('복구 방식은 replace 또는 merge만 사용할 수 있습니다.', [{ field: 'mode', message: 'invalid_enum' }])
  }

  const counts = {}
  for (const name of DATA_COLLECTIONS) {
    const docs = backup.collections[name] || []
    if (mode === 'replace') await col(name).deleteMany({})
    if (mode === 'merge') {
      for (const doc of docs) {
        const filter = restoreFilter(name, doc)
        await col(name).replaceOne(filter, doc, { upsert: true })
      }
    } else if (docs.length) {
      await col(name).insertMany(docs, { ordered: false })
    }
    counts[name] = docs.length
  }

  await syncAllCounters()
  return { restoredAt: now(), mode, counts }
}

function restoreFilter(name, doc) {
  if (name === 'counters') return { _id: doc._id }
  if (name === 'classAttendancePolicies') return { classId: Number(doc.classId) }
  if (name === 'attendanceClosures') return { date: doc.date, classId: doc.classId ?? null }
  if (name === 'attendancePolicies') return { id: Number(doc.id || 1) }
  return { id: doc.id }
}

function validateBackup(backup) {
  if (!backup || typeof backup !== 'object') {
    throw new ValidationError('복구할 백업 데이터가 필요합니다.', [{ field: 'backup', message: 'required' }])
  }
  if (backup.app !== 'attendi' || backup.version !== BACKUP_VERSION) {
    throw new ValidationError('지원하지 않는 백업 파일입니다.', [{ field: 'backup.version', message: 'unsupported' }])
  }
  if (!backup.collections || typeof backup.collections !== 'object') {
    throw new ValidationError('백업 파일에 collections 데이터가 없습니다.', [{ field: 'backup.collections', message: 'required' }])
  }

  for (const name of DATA_COLLECTIONS) {
    const value = backup.collections[name]
    if (value !== undefined && !Array.isArray(value)) {
      throw new ValidationError(`${name} 컬렉션 형식이 올바르지 않습니다.`, [{ field: `collections.${name}`, message: 'invalid_array' }])
    }
    for (const doc of value || []) {
      if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
        throw new ValidationError(`${name} 컬렉션 문서 형식이 올바르지 않습니다.`, [{ field: `collections.${name}`, message: 'invalid_document' }])
      }
      if (name !== 'counters') delete doc._id
    }
  }
}
