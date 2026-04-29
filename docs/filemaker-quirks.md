# FileMaker Server OData quirks

Live-tested against FMS on `https://192.168.0.24` with the `Contacts` solution
(2026-04-17). Each entry documents a deviation from stock OData v4 and the
workaround the library applies.

## Authentication: HTTP Basic, not Data API bearer

FMS's OData endpoint authenticates with HTTP Basic using an FMS account's
username / password. The Data API bearer token (from
`POST /fmi/data/vLatest/databases/<db>/sessions`) is **not** accepted — you'll
get `401 Unauthorized` with FM error `212 (Invalid account/password)` even
though the same credentials minted the token seconds earlier.

**Workaround.** The library's `token: TokenProvider` is treated as the full
`Authorization` header value when it contains a scheme (e.g. `Basic xyz`), and
as a bearer token otherwise. Callers targeting FMS should pass
`` `Basic ${btoa(`${user}:${pass}`)}` ``.

## `/EntitySet/$count` returns 400

The suffix-form count endpoint is not implemented. Requests like
`GET /fmi/odata/v4/<db>/contact/$count` return `400 Bad Request`.

**Workaround.** Use inline counting:
`GET /<EntitySet>?$count=true&$top=0`, then read `@odata.count` from the JSON
envelope. The `Query.count()` builder always emits the inline form.

## Self-signed TLS certificates (common on LAN)

FMS often runs with a self-signed cert on internal IPs. Node's `fetch` refuses
these by default.

**Workaround for dev/tests.** Set `FM_ODATA_INSECURE_TLS=1` in `.env`. The
probe script and live test harness then flip
`process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'` for the current Node process.
Never enable this in production; supply a properly-rooted cert instead.

## Date / time formatting

FMS returns date-time values as UTC ISO-8601 strings. Both with and without
milliseconds are observed; the library parses either. When sending values in
`$filter`, millisecond precision is stripped to avoid round-trip issues.

## Container fields

Claris documents three (and only three) operations for container I/O over
OData v4. The OData spec's `PUT /<EntitySet>(<key>)/<field>/$value` is **not**
implemented — FMS responds `400 Bad Request — Unsupported OData operation -
only GET, POST, PATCH, and DELETE are supported`. `DELETE
/<EntitySet>(<key>)/<field>/$value` is also not implemented (the only
documented `DELETE …/<field>` endpoint is the schema-level one under
`…/FileMaker_Tables/<table>/<field>`, which **drops the column**).

The full reference for the three documented operations lives at
[`filemaker-odata-container-guide.md`](./filemaker-odata-container-guide.md).
Summary of what the library does:

| Operation | HTTP | URL | Body | Library API |
|---|---|---|---|---|
| Create record with container(s) | `POST` | `/<EntitySet>` | JSON, base64 + `@…Filename`, `@…ContentType` | `Query#create({ field: …, "field@com.filemaker.odata.Filename": … })` or `Query#createWithContainers()` |
| Update **one** container, raw binary | `PATCH` | `/<EntitySet>(<key>)/<field>` | Raw bytes | `ContainerRef#upload({ encoding: 'binary' })` |
| Update **one or more** containers (and/or regular fields) | `PATCH` | `/<EntitySet>(<key>)` | JSON, base64 + annotations | `ContainerRef#upload({ encoding: 'base64' })` or `EntityRef#patchContainers()` |
| Download | `GET` | `/<EntitySet>(<key>)/<field>/$value` | — | `ContainerRef#get()` / `getStream()` |
| Clear | `PATCH` | `/<EntitySet>(<key>)` | `{ "<field>": null }` | `ContainerRef#delete()` |

### `Accept: application/octet-stream` returns the stored reference, not the bytes

`GET /<EntitySet>(<key>)/<field>/$value` on an `Edm.Binary` container field
returns the *stored value* (the filename string) as `text/plain;charset=utf-8`
when the request sends `Accept: application/octet-stream`. Any other Accept
value — `*/*`, `image/*`, `image/png`, `application/json`, or no header at
all — returns the actual binary with the correct `Content-Type` (FMS sniffs
from the magic bytes). The library uses `Accept: */*` for container downloads.

This is the single quirk that broke v0.1.4's container downloads on FMS 22.
A previous theory — that supplying a filename caused FMS to store a file
reference instead of embedded binary — turned out to be a misdiagnosis: every
test was issued with the buggy Accept header. Filenames round-trip correctly
and surface back via `Content-Disposition: attachment; filename="…"`.

### `Untitled.png` is FMS's auto-generated filename for unnamed uploads

When an upload omits both `Content-Disposition` (binary mode) and
`@com.filemaker.odata.Filename` (base64 mode), FMS generates the filename
`Untitled.png` (regardless of the actual MIME) and surfaces it on subsequent
downloads via `Content-Disposition: attachment; filename="Untitled.png"`. The
binary itself is correct; only the displayed name is cosmetic. Pass an
explicit filename on upload to override.

### Supported MIME types

Per the Claris guide, **only** PNG, JPEG, GIF, and PDF are listed. Field
testing confirms TIFF also round-trips correctly, so the library accepts all
five. Other binaries (audio, video, ZIP, Office documents, …) may upload
successfully but FMS will not classify them as a media type and downloads
will report `text/plain` or `application/octet-stream`. For those, use the
FileMaker Data API or upload through a FileMaker client directly.

### `Content-Disposition` is unquoted

The Claris doc example uses `Content-Disposition: inline; filename=ALFKI.png`
(no quotes). FMS appears to mis-parse the RFC 6266 quoted form on some
deployments. The library emits the unquoted form for ASCII-only filenames and
falls back to RFC 5987 `filename*=UTF-8''…` for non-ASCII names.

### FileMaker-specific annotations

Container fields in JSON bodies are accompanied by two annotation keys in the
`com.filemaker.odata` namespace:

- `<Field>@com.filemaker.odata.Filename` — filename stored in the container.
- `<Field>@com.filemaker.odata.ContentType` — MIME type. FMS still sniffs the
  first bytes of the base64 data; if the sniffed type conflicts, the sniffed
  type wins.

Both are optional but recommended; without them the file is stored without a
filename and the displayed media type may default to `application/octet-stream`.

## `scriptResult` is always a string

Scripts invoked via `POST /<db>/Script.<name>` return their text result under
the `scriptResult` field of the JSON envelope. Regardless of whether the
script's `Exit Script [Text Result: ...]` expression evaluates to a number,
boolean, container, or text value, FMS serializes it as a **string** (numbers
become decimal strings, booleans become `"1"` / `"0"`, etc.).

**Workaround.** `ScriptResult.scriptResult` is typed as `string | undefined`.
Callers expecting a number/boolean must parse the string explicitly:

```ts
const { scriptResult } = await db.script('GetCount')
const count = Number(scriptResult)            // not auto-coerced
```

The `scriptError` field follows the same rule: even though it always carries
a numeric error code, it arrives as a string (e.g. `"0"`, `"101"`). The
library preserves that wire format on `FMScriptError#scriptError` to keep
exact-equality comparisons (`err.scriptError === '104'`) reliable.

## Field-tested observations

Behaviours observed against live FMS / FMC instances. Listed for orientation,
not as bugs to fix.

### `/$count` URL endpoint differs FMS vs FMC

FMS rejects `GET /<EntitySet>/$count` with `400 Bad Request` (documented
above). FileMaker Cloud appears to accept the suffix-form. Our `Query#count()`
always emits the inline `?$count=true&$top=0` form, which works on both.

### `OData-Version` headers are required per spec but not enforced in practice

The Claris guide mandates `OData-Version: 4.0` and `OData-MaxVersion: 4.0` on
every request. FMS 22 happily accepts requests without them. We send them per
the guide; harmless either way.

### `Edm.Stream` vs `Edm.Binary` for container fields

Some `$metadata` documents declare container properties as `$Type:
"Edm.Stream"`; FMS 22 (verified on `OData Engine 22.0.4`) actually emits
`Type="Edm.Binary"`. Either may appear depending on FMS version /
configuration. Tools relying on `$metadata` should accept both.

### Single-quote escaping in string primary keys

OData requires single quotes inside a string literal to be doubled
(`'O''Brien'`). The library's `escapeStringLiteral` in
[`src/url.ts`](../src/url.ts) handles it correctly. Hand-rolled clients
sometimes skip this step, which silently breaks any string key containing a
`'` character — worth checking if you're integrating against a different
implementation.
