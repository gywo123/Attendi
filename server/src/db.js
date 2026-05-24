import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hashPassword } from './security.js'
import { now } from './time.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = join(__dirname, '..', 'data')
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })

export const db = new DatabaseSync(join(dataDir, 'attendi.sqlite'))

export function initDb() {
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS school_locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      radius_meters INTEGER NOT NULL DEFAULT 100
    );
    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      school_location_id INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      student_number TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      email TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS student_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      class_id INTEGER,
      student_number TEXT,
      reviewed_by INTEGER,
      requested_at TEXT NOT NULL,
      reviewed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS teachers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      school TEXT NOT NULL DEFAULT '학교',
      subject TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS device_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      device_name TEXT,
      location TEXT,
      revoked_at TEXT,
      last_used_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS qr_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      class_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      latitude REAL,
      longitude REAL,
      accuracy_meters REAL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS attendance_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      class_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      status TEXT NOT NULL,
      memo TEXT,
      verified_by_qr INTEGER NOT NULL DEFAULT 0,
      verified_latitude REAL,
      verified_longitude REAL,
      verified_at TEXT,
      updated_at TEXT NOT NULL,
      UNIQUE(student_id, class_id, date)
    );
  `)
  ensureColumn('teachers', 'school', "TEXT NOT NULL DEFAULT '학교'")
  ensureColumn('teachers', 'subject', "TEXT NOT NULL DEFAULT ''")
  ensureColumn('teachers', 'status', "TEXT NOT NULL DEFAULT 'active'")
  ensureColumn('device_tokens', 'location', 'TEXT')
  ensureColumn('student_applications', 'class_id', 'INTEGER')
  ensureColumn('student_applications', 'student_number', 'TEXT')
  ensureColumn('student_applications', 'reviewed_by', 'INTEGER')
  ensureColumn('student_applications', 'reviewed_at', 'TEXT')
}

export function ensureInitialData() {
  if (!one('SELECT id FROM school_locations WHERE id = 1')) {
    run(
      'INSERT INTO school_locations (id, name, latitude, longitude, radius_meters) VALUES (1, ?, ?, ?, ?)',
      [
        process.env.SCHOOL_NAME || '학교',
        Number(process.env.SCHOOL_LATITUDE || 37.5012743),
        Number(process.env.SCHOOL_LONGITUDE || 127.039585),
        Number(process.env.SCHOOL_RADIUS_METERS || 100),
      ],
    )
  }
  if (one('SELECT COUNT(*) AS count FROM classes').count === 0) {
    for (const name of ['3학년 1반', '3학년 2반', '2학년 1반', '2학년 2반']) {
      run('INSERT INTO classes (name, school_location_id, created_at) VALUES (?, 1, ?)', [name, now()])
    }
  }
  ensureTeacherInitial('관리자', 'admin@school.kr', 'admin', '')
}

export function all(sql, params = []) {
  return db.prepare(sql).all(...params)
}

export function one(sql, params = []) {
  return db.prepare(sql).get(...params)
}

export function run(sql, params = []) {
  return db.prepare(sql).run(...params)
}

function ensureTeacherInitial(name, email, role, subject) {
  const existing = one('SELECT id FROM teachers WHERE email = ?', [email])
  if (existing) {
    run(
      `UPDATE teachers
       SET name = ?, role = ?, password_hash = ?, school = ?, subject = ?
       WHERE id = ?`,
      [name, role, hashPassword('1234'), '학교', subject, existing.id],
    )
    return
  }
  run(
    'INSERT INTO teachers (name, email, role, password_hash, school, subject, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [name, email, role, hashPassword('1234'), '학교', subject, 'active', now()],
  )
}

function ensureColumn(table, column, definition) {
  const exists = db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column)
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}
