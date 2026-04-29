# Container Field Download Problem — Investigation Notes

**Date:** 2026-04-28  
**Status:** **Resolved 2026-04-29** — see Resolution section below  
**Field under test:** `photo_content` (on the `contact` table of the `Contacts` solution)  
**Server:** FMS 22, `https://192.168.0.24`

## Resolution (2026-04-29)

Root cause was a single FMS quirk on the **download** side: `GET /<field>/$value`
returns the stored filename as `text/plain;charset=utf-8` whenever the request
sends `Accept: application/octet-stream`. Any other `Accept` value — `*/*`,
`image/*`, `image/png`, `application/json`, or no header at all — returns the
correct binary with the sniffed `Content-Type`.

The library was sending `accept: 'binary'` from `ContainerRef.get()` and
`getStream()`, which `src/http.ts` mapped to `Accept: application/octet-stream`.
Every previous probe was therefore broken in the same way, leading to the
incorrect "filename causes file reference" hypothesis below.

**Fix:** swap to `accept: 'none'` (which maps to `Accept: */*`) in both call
sites. Filenames work fine and round-trip via
`Content-Disposition: attachment; filename="…"` on the response.

The investigation notes below are kept as a breadcrumb for anyone googling the
`text/plain;charset=utf-8` symptom.

---

---

## Symptom

The live integration test `uploads, reads and clears a container field` fails with:

```
expected 'text/plain;charset=utf-8' to contain 'image/'
```

`ContainerRef.get()` receives `content-type: text/plain;charset=utf-8` and a body of 12 bytes containing the ASCII string `Untitled.png` (or whatever filename was last stored). The binary PNG data is never returned.

---

## What the Claris guide says should work

**Operation 2 — Binary PATCH** (`PATCH /<EntitySet>(<key>)/<field>`):

```bash
curl --request PATCH \
  "https://<host>/fmi/odata/v4/<db>/contact(4218)/photo_content" \
  --header 'Content-Type: image/png' \
  --header 'Content-Disposition: inline; filename=pixel.png' \
  --header 'Authorization: Basic ...' \
  --header 'OData-Version: 4.0' \
  --header 'OData-MaxVersion: 4.0' \
  --data-binary '@pixel.png'
```

Expected response: `200 OK`, then `GET …/$value` returns `image/png` binary.

**Operation 3 — Base64 JSON PATCH** (`PATCH /<EntitySet>(<key>)` with JSON body):

```json
{
  "photo_content": "<base64>",
  "photo_content@com.filemaker.odata.ContentType": "image/png"
}
```

Expected response: `204 No Content`, then `GET …/$value` returns `image/png` binary.

**Download** (`GET /<EntitySet>(<key>)/<field>/$value`):

Expected to return raw binary bytes with `Content-Type: image/png`.

---

## What actually happens (live probed 2026-04-28)

All three upload approaches return HTTP success (200 or 204), but `GET …/$value` **always** returns `text/plain;charset=utf-8` with a plain-text filename string — never binary bytes.

| Upload approach | PATCH status | $value content-type | $value size | $value body |
|---|---|---|---|---|
| Binary PATCH, no `Content-Disposition` | 200 OK | `text/plain;charset=utf-8` | 12 bytes | `Untitled.png` |
| Binary PATCH, with `Content-Disposition: inline; filename=pixel.png` | 200 OK | `text/plain;charset=utf-8` | 9 bytes | `pixel.png` |
| Base64 JSON PATCH, `@ContentType` only, no `@Filename` | 204 No Content | `text/plain;charset=utf-8` | 12 bytes | `Untitled.png` |
| Base64 JSON PATCH, `@ContentType` + `@Filename: pixel.png` | 204 No Content | `text/plain;charset=utf-8` | 9 bytes | `pixel.png` |

### Key observations

1. **When a filename is provided** (via `Content-Disposition` or `@Filename`), `$value` returns that exact filename as `text/plain`. Body = filename string.
2. **When no filename is provided**, FMS auto-generates `Untitled.png` and returns that string as `text/plain`. Body = `"Untitled.png"` (12 bytes).
3. **OData-Version headers make no difference** — tested with and without `OData-Version: 4.0` / `OData-MaxVersion: 4.0`, same result.
4. **Key format makes no difference** — tested numeric key (`contact(4218)`) and compound key (`contact(4218,'uuid','uuid')`), same result.
5. **Fresh vs. existing record makes no difference** — all tests above used freshly created records (via `POST` in the same probe run).

---

## Hypothesis

The `photo_content` field on this particular FMS instance is configured to store container data **as an external file reference** rather than embedded binary. In that storage mode:

- FMS stores the *reference* (filename + path) in the database record.
- The actual binary is written to an external folder on the FMS host filesystem.
- `GET …/$value` returns the **reference value** (the filename string), not the binary bytes, because the OData endpoint exposes the internal container value rather than resolving and streaming the external file.

This would explain why every upload succeeds (FMS accepts the bytes and writes the external file) but every download returns a filename string.

### Alternative hypothesis

`photo_content` is typed as `Edm.Binary` in the OData `$metadata`, **not** `Edm.Stream`. OData `$value` semantics for `Edm.Binary` may differ from `Edm.Stream` on FMS — the endpoint might return the property's stored value (the filename/reference string) rather than streaming the underlying binary.

---

## What was NOT tested

- **A field configured as internal (embedded) container storage** — if a different container field stores data embedded in the database (not externally), `$value` may return binary correctly. The `photo_content` field may simply be configured for external storage.
- **Downloading a container that was populated via the FileMaker client** (not OData). If a user or script stores a file via the FileMaker GUI/API, does `$value` return binary? This would confirm whether the issue is upload-side or field-configuration-side.
- **`GET /<EntitySet>(<key>)/<field>` without `/$value`** — the field URL without the `$value` suffix. On `Edm.Binary` fields this might return the base64 representation of the data in a JSON envelope rather than raw bytes.
- **A different container field** — if another field on the same table works correctly, it would isolate the issue to `photo_content`'s configuration.

---

## Probe script

The following inline Node.js probe was used to verify the behaviour (run from the repo root):

```bash
node --input-type=module << 'EOF'
import { loadFmConfig } from './scripts/env.mjs'
import { createFetch } from './scripts/insecure-fetch.mjs'
import { readFileSync } from 'node:fs'

const cfg = loadFmConfig()
const fetch = createFetch({ insecureTls: cfg.insecureTls })
const basic = `Basic ${Buffer.from(`${cfg.user}:${cfg.password}`).toString('base64')}`
const base = `${cfg.host}/fmi/odata/v4/${encodeURIComponent(cfg.database)}`
const table = cfg.tables.contact
const field = process.env.FM_ODATA_CONTAINER_FIELD || 'photo_content'
const pngBytes = new Uint8Array(readFileSync('./tests/fixtures/pixel.png'))
const b64 = Buffer.from(pngBytes).toString('base64')

// Create fresh record
const cr = await fetch(`${base}/${table}`, {
  method: 'POST',
  headers: { Authorization: basic, 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify({ first_name: 'probe', last_name: `test-${Date.now()}` }),
})
const created = await cr.json()
const pk = created.id ?? created.ID ?? Object.values(created).find(v => typeof v === 'number')
const recordUrl = `${base}/${table}(${pk})`
const fieldUrl = `${recordUrl}/${field}`

// Binary PATCH, no Content-Disposition
await fetch(fieldUrl, {
  method: 'PATCH',
  headers: { Authorization: basic, 'Content-Type': 'image/png', Accept: '*/*' },
  body: pngBytes,
})
const g = await fetch(`${fieldUrl}/$value`, { headers: { Authorization: basic } })
const buf = await g.arrayBuffer()
console.log('content-type:', g.headers.get('content-type'), 'size:', buf.byteLength)
console.log('body:', new TextDecoder().decode(buf))

await fetch(recordUrl, { method: 'DELETE', headers: { Authorization: basic } })
EOF
```

---

## Current library state

The library currently:

- Defaults `encoding` to `'binary'` in `ContainerRef.upload()`.
- Sends `PATCH …/<field>` with `Content-Type: image/png` and no `Content-Disposition` (when no `filename` option is provided).
- Downloads via `GET …/<field>/$value`.

This is the correct interpretation of the Claris guide, but it does not work on this FMS instance for `photo_content`.

---

## Next steps to investigate

1. **Check the field's container storage setting in FileMaker** — open the solution in FileMaker Pro, go to File → Manage → Database → `contact` table → `photo_content` field → Options → Storage tab. If "Store container data externally" is checked, that is the root cause.

2. **Test with a field set to internal/embedded storage** — create or identify a container field with internal (embedded) storage and repeat the probe.

3. **Test download of a container populated via FileMaker client** — manually insert a PNG into `photo_content` via the FileMaker app, then probe `GET …/$value`. If that returns `image/png`, the upload method is wrong; if it also returns `text/plain`, the issue is in the download path or field type.

4. **Inspect the `$metadata` document** — compare the property type of `photo_content` (`Edm.Binary`) against any field that is known to work. Check if FMS exposes `Edm.Stream` for any container field.

5. **Try `GET /<field>` without `/$value`** — on `Edm.Binary` properties, OData may expose the value differently (e.g. as a base64 JSON property in the entity payload).
