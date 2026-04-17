/**
 * Opt-in live-integration suite. Runs only when `FM_ODATA_LIVE=1` in `.env`.
 *
 * Exercises collection GET + single-entity CRUD against a real FMS instance.
 * Reads connection info from `.env` (see `.env.sample`).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadFmConfig } from '../../scripts/env.mjs'
import { createFetch } from '../../scripts/insecure-fetch.mjs'
import { FMOData, basicAuth, FMODataError } from '../../src/index.js'

const cfg = loadFmConfig()
const live = cfg.live

// Entire suite is skipped unless FM_ODATA_LIVE=1. This lets `npm test` stay
// fast and offline; developers opt in when working against a real FMS.
describe.skipIf(!live)('live FMS integration', () => {
  const fetch = createFetch({ insecureTls: cfg.insecureTls })
  const db = new FMOData({
    host: cfg.host,
    database: cfg.database,
    token: basicAuth(cfg.user, cfg.password),
    fetch,
    timeoutMs: 15_000,
  })

  // Track rows created by this run so we can clean up even on failure.
  const createdContactKeys: Array<string | number> = []

  afterAll(async () => {
    for (const key of createdContactKeys) {
      try {
        await db.from(cfg.tables.contact).byKey(key).delete()
      } catch {
        // Best-effort cleanup.
      }
    }
  })

  it('reads the contact collection', async () => {
    const { value, count } = await db.from(cfg.tables.contact).top(3).count().get()
    expect(Array.isArray(value)).toBe(true)
    expect(typeof count === 'number' || count === undefined).toBe(true)
  })

  it('round-trips a full CRUD lifecycle on contact', async () => {
    // 1. CREATE
    const created = await db
      .from<Record<string, unknown>>(cfg.tables.contact)
      .create({
        first_name: 'fm-odata-js',
        last_name: `live-test-${Date.now()}`,
      })

    // FMS returns the new row with its generated key. We don't know the key
    // field name a priori, so discover it from the response.
    const pkField = findPrimaryKey(created)
    expect(pkField, 'created row must include a primary key').not.toBeNull()
    const key = created[pkField!] as string | number
    createdContactKeys.push(key)

    // 2. READ
    const readBack = await db.from(cfg.tables.contact).byKey(key).get()
    expect(readBack[pkField!]).toEqual(key)

    // 3. UPDATE
    await db.from(cfg.tables.contact).byKey(key).patch({
      first_name: 'fm-odata-js-updated',
    })
    const readAfterPatch = await db
      .from<Record<string, unknown>>(cfg.tables.contact)
      .byKey(key)
      .get()
    expect(readAfterPatch.first_name).toBe('fm-odata-js-updated')

    // 4. DELETE
    await db.from(cfg.tables.contact).byKey(key).delete()
    createdContactKeys.pop()

    // 5. VERIFY DELETE: follow-up GET should 404
    const err = await db
      .from(cfg.tables.contact)
      .byKey(key)
      .get()
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(FMODataError)
    expect((err as FMODataError).status).toBeGreaterThanOrEqual(400)
  })

  it('surfaces FMS error envelopes as FMODataError', async () => {
    const err = await db
      .from('definitely_not_a_table_xyz')
      .get()
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(FMODataError)
    expect((err as FMODataError).status).toBeGreaterThanOrEqual(400)
  })
})

// Emit a single advisory line so developers know why the suite didn't run.
if (!live) {
  // eslint-disable-next-line no-console
  console.log('[live] FM_ODATA_LIVE != 1 — skipping live FMS integration suite')
}

/**
 * Heuristically find the primary-key field in a newly-created row. FileMaker
 * solutions vary (`id`, `ID`, `contact_id`, `pk_contact`, …); pick whichever
 * scalar looks most like a key, preferring exact `id` / `ID` matches.
 */
function findPrimaryKey(row: Record<string, unknown>): string | null {
  const keys = Object.keys(row)
  const scalar = (k: string) => ['string', 'number'].includes(typeof row[k])
  for (const candidate of ['id', 'ID', 'pk', 'PK']) {
    if (candidate in row && scalar(candidate)) return candidate
  }
  const idLike = keys.find((k) => /^(id|pk(_|$))/i.test(k) && scalar(k))
  if (idLike) return idLike
  // Last resort: first scalar field.
  return keys.find(scalar) ?? null
}
