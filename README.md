<div align="center">

# fm-odata-js

**A tiny, type-safe OData v4 client built for FileMaker Server.**

Zero runtime dependencies · ~4.6 KB gzipped · One ES module · Web Viewer / Browser / Node 18+

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![OData](https://img.shields.io/badge/OData-v4-0078D4?logo=data&logoColor=white)](https://www.odata.org/)
[![FileMaker](https://img.shields.io/badge/FileMaker-19.0--22.0-FF6B00?logo=filemaker&logoColor=white)](https://www.claris.com/filemaker/)
[![Bundle](https://img.shields.io/badge/gzip-~4.6%20KB-brightgreen)](#)
[![Deps](https://img.shields.io/badge/runtime%20deps-0-blue)](#)
[![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)](#)
[![License](https://img.shields.io/badge/license-MIT-black)](./LICENSE)

</div>

---

## Why fm-odata-js?

FileMaker Server speaks OData v4, but the spec has sharp corners and FMS has quirks. `fm-odata-js` smooths both — so you can forget about URL-encoding `$filter` predicates and focus on your data.

> **Battle-tested in production.** I've been using this library heavily to let FileMaker Web Viewer instances talk to the *same* hosted database they live in — and the performance has been genuinely impressive. Queries that used to require round-tripping through scripts and set-field loops now resolve in a single OData call, with noticeably lower latency and a much cleaner code path. If you're building rich Web Viewer UIs backed by FMS, this is the fastest route I've found.

- **Tiny.** Single ES module, zero runtime dependencies, ~4.6 KB gzipped.
- **Type-safe.** Fluent, chainable query builder with full TS inference.
- **Runs anywhere.** Drop it into a FileMaker Web Viewer, a browser, or Node 18+.
- **FMS-aware.** Handles the documented FMS OData deviations for you.
- **Scripts built in.** Invoke FileMaker scripts at database, entity-set, or record scope with a single call.
- **Containers built in.** Upload, download, stream, or clear container fields with typed helpers — `Blob`, `ArrayBuffer`, and `Uint8Array` all accepted.
- **Resilient.** Basic/Bearer auth with 401 retry, `AbortSignal`, and timeouts built in.
- **Honest errors.** Every failure becomes a normalized `FMODataError` (or `FMScriptError` for script failures).

## Status

| Milestone   | Scope                                                             | State |
| ----------- | ----------------------------------------------------------------- | :---: |
| **M1–M3**   | Query builder · collection GET · single-entity CRUD · auth · errors | Done |
| **M4 · 1/4**| Script execution (database / entity-set / record scope)            | Done (v0.1.4) |
| **M4 · 2/4**| Containers (binary upload / download / stream)                     | Done (v0.1.5) |
| **M4 · 3/4**| `$metadata` (schema introspection)                                 | Planned |
| **M4 · 4/4**| `$batch` (multipart with changesets)                               | Planned |

Full roadmap and changes live in [`CHANGELOG.md`](./CHANGELOG.md).

## Install

> **Not yet published to npm.** Until the first release hits the registry, install directly from GitHub or a local checkout.

From GitHub:

```bash
npm install github:fsans/fm-odata-js
```

From a local clone:

```bash
npm install /path/to/fm-odata-js
```

Once published, the canonical install will be:

```bash
npm install fm-odata-js
```

Local dev:

```bash
npm install
npm test          # 100 unit tests, offline
```

## Quick start

```ts
import { FMOData, basicAuth } from 'fm-odata-js'

const db = new FMOData({
  host: 'https://fms.example.com',
  database: 'Contacts',
  token: basicAuth('admin', 'secret'), // FMS OData requires Basic auth
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

## FileMaker scripts

Invoke FMS-side FileMaker scripts at three scopes. The optional `parameter`
becomes `Get(ScriptParameter)` inside the script; the script's text result is
returned as `scriptResult`.

```ts
// Database scope
const { scriptResult } = await db.script('Ping', { parameter: 'hello' })

// Entity-set scope (script runs with the table as context)
await db.from('contact').script('RebuildIndex')

// Single-record scope (script's current record is set to this row)
await db.from('contact').byKey(42).script('Archive')
```

A non-zero `scriptError` becomes an `FMScriptError` (subclass of
`FMODataError`), so existing error handlers keep working:

```ts
import { FMScriptError } from 'fm-odata-js'

try {
  await db.script('Risky')
} catch (err) {
  if (err instanceof FMScriptError) {
    console.error(`FM script error ${err.scriptError}: ${err.scriptResult}`)
  } else {
    throw err
  }
}
```

## Container fields

Container fields expose their bytes through `EntityRef#container(fieldName)`.
The handle gives you three I/O shapes plus a clear operation:

```ts
const photo = db.from('contact').byKey(42).container('photo')

// Upload (default: binary mode — image / PDF only per FMS)
await photo.upload({
  data: new Uint8Array(await file.arrayBuffer()),
  contentType: 'image/png',
  filename: 'profile.png',
})

// Upload any file type (zip, docx, …) via base64 encoding
await photo.upload({
  data: zipBytes,
  contentType: 'application/zip',
  filename: 'archive.zip',
  encoding: 'base64',
})

// Download into memory (good for thumbnails, small assets)
const { blob, contentType, filename, size } = await photo.get()

// Or stream it (good for large files — no buffering)
const stream = await photo.getStream()
await stream.pipeTo(someWritable)

// Clear the container
await photo.delete()
```

Under the hood the library uses the two FMS-documented wire formats:
binary mode `PATCH`es `…/<field>` with raw bytes; base64 mode `PATCH`es the
parent record with `<field>@com.filemaker.odata.ContentType` /
`…Filename` annotations. `delete()` clears the value via `PATCH` with
`{ <field>: null }` (FMS has no per-field DELETE for record data).

The `Content-Disposition` filename is parsed for you on download, including
RFC 5987 `filename*=UTF-8''…` for non-ASCII names. On upload, non-ASCII
filenames are emitted in both plain and RFC 5987 form automatically.

## Live integration tests

Copy `.env.sample` to `.env` and fill in real FMS credentials:

```bash
npm run probe                                  # quick connectivity check
FM_ODATA_LIVE=1 npm test -- tests/integration  # full CRUD against real FMS
```

> Using self-signed certs on a LAN box? Set `FM_ODATA_INSECURE_TLS=1` in `.env`.

## Docs

- [`docs/README.md`](./docs/README.md) — API reference and deeper guides
- [`docs/filemaker-quirks.md`](./docs/filemaker-quirks.md) — the three FMS deviations and how this library works around them
- [`examples/`](./examples) — runnable sample projects
  - [`consumer-node/`](./examples/consumer-node) — Node CLI consuming the library
  - [`webviewer/`](./examples/webviewer) — **standalone HTML page** ready to drop into a FileMaker Web Viewer
- [`examples/Contacts.fmp12`](./examples/Contacts.fmp12) — ready-to-host FileMaker test database matching the examples. **Credentials: `admin` / `admin`** (dev use only — change before exposing to any network).

## Contributing

Issues and PRs are welcome. Please run `npm test` and `npm run typecheck` before opening a PR.

## License

[MIT](./LICENSE) © fm-odata-js contributors
