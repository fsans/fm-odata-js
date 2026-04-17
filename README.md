# fm-odata-js

A zero-runtime-dependency TypeScript client for the FileMaker Server OData v4
API. Ships as a single ES module (~3 KB gzipped) that drops into FileMaker Web
Viewers, modern browsers, or Node 18+.

> **Status:** M1-M3 complete. Query builder, collection GET, single-entity
> CRUD, Basic/Bearer auth with 401 retry, `AbortSignal`/timeout, and normalized
> `FMODataError` are all implemented and tested live against FMS. Containers,
> scripts, `$metadata`, and `$batch` land in M4-M6 — see `CHANGELOG.md`.

## Install (local dev)

```bash
npm install
npm test                # 100 unit tests, offline
```

## Usage

```ts
import { FMOData, basicAuth } from 'fm-odata-js'

const db = new FMOData({
  host: 'https://fms.example.com',
  database: 'Contacts',
  token: basicAuth('admin', 'secret'),  // FMS OData needs Basic auth
  timeoutMs: 15_000,
})

// Collection read
const { value, count } = await db
  .from('contact')
  .select('id', 'first_name', 'last_name')
  .filter((f) => f.eq('last_name', 'Smith'))
  .orderby('last_name')
  .top(50)
  .count()
  .get()

// Create
const created = await db.from('contact').create({
  first_name: 'Alice',
  last_name: 'Liddell',
})

// Read / update / delete a single row
const row = await db.from('contact').byKey(created.id).get()
await db.from('contact').byKey(row.id).patch({ first_name: 'A.' })
await db.from('contact').byKey(row.id).delete()
```

## Live integration tests

Copy `.env.sample` to `.env` and fill in real FMS credentials:

```bash
npm run probe                                  # quick connectivity check
FM_ODATA_LIVE=1 npm test -- tests/integration  # full CRUD against real FMS
```

Self-signed certs on LAN boxes: set `FM_ODATA_INSECURE_TLS=1` in `.env`. See
`docs/filemaker-quirks.md` for the three FMS deviations the library works around.
