import crypto from 'node:crypto'
import { JWT_SECRET } from './config.js'

const PASSWORD_ITERATIONS = 120000
const PASSWORD_KEYLEN = 32
const PASSWORD_DIGEST = 'sha256'

export function hashPassword(value) {
  const salt = crypto.randomBytes(16).toString('base64url')
  const hash = crypto.pbkdf2Sync(String(value), salt, PASSWORD_ITERATIONS, PASSWORD_KEYLEN, PASSWORD_DIGEST).toString('base64url')
  return `pbkdf2$${PASSWORD_ITERATIONS}$${salt}$${hash}`
}

export function verifyPassword(input, stored) {
  const value = String(input)
  const hash = String(stored || '')
  if (hash.startsWith('pbkdf2$')) {
    const [, iterations, salt, expected] = hash.split('$')
    const actual = crypto.pbkdf2Sync(value, salt, Number(iterations), PASSWORD_KEYLEN, PASSWORD_DIGEST).toString('base64url')
    return safeEqual(actual, expected)
  }
  return safeEqual(legacyPasswordHash(value), hash)
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export function signJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8 })).toString('base64url')
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${sig}`
}

export function verifyJwt(token) {
  const [header, body, sig] = token.split('.')
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url')
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw new Error('bad signature')
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) throw new Error('expired')
  return payload
}

export function encodeClientPayload(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

function legacyPasswordHash(value) {
  return crypto.createHash('sha256').update(`attendi:${value}`).digest('hex')
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a))
  const right = Buffer.from(String(b))
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}
