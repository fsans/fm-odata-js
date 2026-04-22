<div align="center">

# ⚡ fm-odata-js

**A tiny, type-safe OData v4 client built for FileMaker Server.**

Zero runtime dependencies · ~3 KB gzipped · One ES module · Web Viewer / Browser / Node 18+

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bundle](https://img.shields.io/badge/gzip-~3%20KB-brightgreen)](#)
[![Deps](https://img.shields.io/badge/runtime%20deps-0-blue)](#)
[![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)](#)
[![License](https://img.shields.io/badge/license-MIT-black)](./LICENSE)

</div>

---

## ✨ Why fm-odata-js?

FileMaker Server speaks OData v4, but the spec has sharp corners and FMS has quirks. `fm-odata-js` smooths both — so you can forget about URL-encoding `$filter` predicates and focus on your data.

> 🧪 **Battle-tested in production.** I've been using this library heavily to let FileMaker Web Viewer instances talk to the *same* hosted database they live in — and the performance has been genuinely impressive. Queries that used to require round-tripping through scripts and set-field loops now resolve in a single OData call, with noticeably lower latency and a much cleaner code path. If you're building rich Web Viewer UIs backed by FMS, this is the fastest route I've found.

- 🪶 **Tiny.** Single ES module, zero runtime dependencies, ~3 KB gzipped.
- 🧠 **Type-safe.** Fluent, chainable query builder with full TS inference.
- 🔌 **Runs anywhere.** Drop it into a FileMaker Web Viewer, a browser, or Node 18+.
- 🛡️ **FMS-aware.** Handles the three documented FMS OData deviations for you.
- 🔁 **Resilient.** Basic/Bearer auth with 401 retry, `AbortSignal`, and timeouts built in.
- 🎯 **Honest errors.** Every failure becomes a normalized `FMODataError`.

## 🚦 Status

| Milestone | Scope                                                             | State |
| --------- | ----------------------------------------------------------------- | :---: |
| **M1–M3** | Query builder · collection GET · single-entity CRUD · auth · errors | ✅    |
| **M4–M6** | Containers · scripts · `$metadata` · `$batch`                      | 🚧    |

Full roadmap and changes live in [`CHANGELOG.md`](./CHANGELOG.md).

## 📦 Install

```bash
npm install fm-odata-js
```

Local dev:

```bash
npm install
npm test          # 100 unit tests, offline
```

## 🚀 Quick start

```ts
import { FMOData, basicAuth } from 'fm-odata-js'

const db = new FMOData({
  host: 'https://fms.example.com',
  database: 'Contacts',
  token: basicAuth('admin', 'secret'), // FMS OData requires Basic auth
  timeoutMs: 15_000,
})

// 🔎 Collection read
const { value, count } = await db
  .from('contact')
  .select('id', 'first_name', 'last_name')
  .filter((f) => f.eq('last_name', 'Smith'))
  .orderby('last_name')
  .top(50)
  .count()
  .get()

// ➕ Create
const created = await db.from('contact').create({
  first_name: 'Alice',
  last_name: 'Liddell',
})

// 👁️  Read / ✏️  update / 🗑️  delete a single row
const row = await db.from('contact').byKey(created.id).get()
await db.from('contact').byKey(row.id).patch({ first_name: 'A.' })
await db.from('contact').byKey(row.id).delete()
```

## 🧪 Live integration tests

Copy `.env.sample` to `.env` and fill in real FMS credentials:

```bash
npm run probe                                  # quick connectivity check
FM_ODATA_LIVE=1 npm test -- tests/integration  # full CRUD against real FMS
```

> Using self-signed certs on a LAN box? Set `FM_ODATA_INSECURE_TLS=1` in `.env`.

## 📚 Docs

- [`docs/README.md`](./docs/README.md) — API reference and deeper guides
- [`docs/filemaker-quirks.md`](./docs/filemaker-quirks.md) — the three FMS deviations and how this library works around them
- [`examples/`](./examples) — runnable sample projects
  - [`consumer-node/`](./examples/consumer-node) — Node CLI consuming the library
  - [`webviewer/`](./examples/webviewer) — **standalone HTML page** ready to drop into a FileMaker Web Viewer
- [`examples/Contacts.fmp12`](./examples/Contacts.fmp12) — ready-to-host FileMaker test database matching the examples. **Credentials: `admin` / `admin`** (dev use only — change before exposing to any network).

## 🤝 Contributing

Issues and PRs are welcome. Please run `npm test` and `npm run typecheck` before opening a PR.

## 📄 License

[MIT](./LICENSE) © fm-odata-js contributors
