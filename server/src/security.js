import crypto from 'node:crypto'
import { JWT_SECRET } from './config.js'

export function hashPassword(value) {
  return crypto.createHash('sha256').update(`attendi:${value}`).digest('hex')
}

export function verifyPassword(input, stored) {
  return hashPassword(input) === stored
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
