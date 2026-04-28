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
