// Tiny .env loader (no dependencies). Only reads KEY=VALUE lines, ignores
// comments and blank lines. Values are NOT shell-expanded; quotes are
// optional and stripped.
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')

export function loadEnvFile(path = resolve(repoRoot, '.env')) {
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch (e) {
    if (e.code === 'ENOENT') return {}
    throw e
  }
  const out = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[key] = value
    // Populate process.env only if not already set (process env wins).
    if (process.env[key] === undefined) process.env[key] = value
  }
  return out
}

/**
 * Load `.env` and return a typed config object. Missing required fields throw.
 */
export function loadFmConfig() {
  loadEnvFile()
  const required = ['FM_ODATA_HOST', 'FM_ODATA_DATABASE', 'FM_ODATA_USER', 'FM_ODATA_PASSWORD']
  const missing = required.filter((k) => !process.env[k])
  if (missing.length) {
    throw new Error(
      `Missing required env vars: ${missing.join(', ')}. Copy .env.sample to .env and fill them in.`,
    )
  }
  return {
    host: process.env.FM_ODATA_HOST.replace(/\/+$/, ''),
    database: process.env.FM_ODATA_DATABASE,
    user: process.env.FM_ODATA_USER,
    password: process.env.FM_ODATA_PASSWORD,
    live: process.env.FM_ODATA_LIVE === '1',
    insecureTls: process.env.FM_ODATA_INSECURE_TLS === '1',
    tables: {
      contact: process.env.FM_ODATA_TABLE_CONTACT ?? 'contact',
      address: process.env.FM_ODATA_TABLE_ADDRESS ?? 'address',
      email: process.env.FM_ODATA_TABLE_EMAIL ?? 'email',
      phone: process.env.FM_ODATA_TABLE_PHONE ?? 'phone',
    },
  }
}
