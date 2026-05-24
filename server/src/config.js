import { config as loadEnv } from 'dotenv'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
loadEnv({ path: join(__dirname, '..', '.env') })

const GOOGLE_CONFIG = loadGoogleConfig()

export const PORT = Number(process.env.PORT || 4000)
export const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173'
export const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret'
export const QR_TTL_SECONDS = 30
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || GOOGLE_CONFIG?.client_id || ''
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || GOOGLE_CONFIG?.client_secret || ''
export const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI ||
  GOOGLE_CONFIG?.redirect_uris?.[0] ||
  `http://localhost:${PORT}/api/auth/google/callback`

function loadGoogleConfig() {
  try {
    const rootDir = join(__dirname, '..', '..')
    const file = readdirSync(rootDir).find((name) => name.startsWith('client_secret') && name.endsWith('.json'))
    if (!file) return null
    const parsed = JSON.parse(readFileSync(join(rootDir, file), 'utf8'))
    return parsed.web || parsed.installed || null
  } catch {
    return null
  }
}
