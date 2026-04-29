/**
 * FileMaker container field I/O.
 *
 * FMS exposes three container operations over OData v4 — see
 * `docs/filemaker-odata-container-guide.md` for the full reference. The
 * library maps to them as follows:
 *
 *   GET   /<EntitySet>(<key>)/<field>/$value   → ContainerRef#get / getStream
 *   PATCH /<EntitySet>(<key>)/<field>          → ContainerRef#upload({ encoding: 'binary' }) — DEFAULT
 *   PATCH /<EntitySet>(<key>) (JSON body)      → ContainerRef#upload({ encoding: 'base64' })
 *   POST  /<EntitySet>           (JSON body)   → Query#create({ … }) with container annotation keys
 *
 * Supported MIME types per the Claris guide:
 *   image/png, image/jpeg, image/gif, image/tiff, application/pdf
 *
 * Clearing a container is not in the Claris guide. The library PATCHes the
 * record with `{ <field>: null }`.
 */

import type { EntityRef } from './entity.js'
import { executeRequest } from './http.js'
import type { RequestOptions } from './types.js'
import { encodePathSegment } from './url.js'

/** Result of a successful container download. */
export interface ContainerDownload {
  /** Binary contents as a `Blob` (works in browsers, Web Viewer, and Node 18+). */
  blob: Blob
  /** MIME type reported by FMS (e.g. `image/png`); empty string if absent. */
  contentType: string
  /** Filename parsed from `Content-Disposition`, when present. */
  filename?: string
  /** Byte length. `0` indicates an empty container. */
  size: number
}

/** Input accepted by `ContainerRef#upload`. */
export interface ContainerUploadInput {
  /** Binary payload. `fetch` accepts all three forms natively. */
  data: Blob | ArrayBuffer | Uint8Array
  /**
   * Content-Type to send with the upload. Optional: when omitted, the library
   * sniffs the MIME from the payload's magic bytes (PNG, JPEG, GIF, TIFF, PDF).
   * Throws if it cannot detect a supported type.
   */
  contentType?: string
  /**
   * Optional filename to store in the container. Surfaced on download via
   * `Content-Disposition: attachment; filename="…"`. When omitted, FMS stores
   * (and surfaces back) the auto-generated name `Untitled.png`.
   */
  filename?: string
  /**
   * Wire format:
   *
   * - `'binary'` (default): PATCH `…/<field>` with raw bytes. Restricted to
   *   PNG, JPEG, GIF, TIFF, and PDF.
   * - `'base64'`: PATCH `…/<EntitySet>(<key>)` with a JSON body containing
   *   the file as a base64 string plus `@com.filemaker.odata.…` annotations.
   *   Use this when you need to update multiple container fields (or mix
   *   container and regular field updates) in a single request.
   */
  encoding?: 'binary' | 'base64'
}

/**
 * MIME types FMS accepts for container fields. Other types (audio, video,
 * zip, docx, …) may upload but won't be classified as a media type and won't
 * preview correctly in FileMaker.
 */
export const FM_CONTAINER_SUPPORTED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/tiff',
  'application/pdf',
] as const

export type FMContainerMimeType = (typeof FM_CONTAINER_SUPPORTED_MIME_TYPES)[number]

/** @internal — strict mime check (case-insensitive, ignores parameters). */
function normalizeMime(value: string): string {
  return (value.split(';')[0] ?? '').trim().toLowerCase()
}

function isSupportedContainerMime(value: string): boolean {
  const normalized = normalizeMime(value)
  return (FM_CONTAINER_SUPPORTED_MIME_TYPES as readonly string[]).includes(normalized)
}

/**
 * Sniff the MIME type from the magic bytes of an uploaded payload. Returns
 * `undefined` when none of the supported signatures match.
 *
 * Signatures:
 *   PNG  — 89 50 4E 47 0D 0A 1A 0A
 *   JPEG — FF D8 FF
 *   GIF  — 47 49 46 38 (`GIF8`)
 *   TIFF — 49 49 2A 00 (little-endian) | 4D 4D 00 2A (big-endian)
 *   PDF  — 25 50 44 46 (`%PDF`)
 *
 * @internal
 */
export function sniffContainerMime(bytes: Uint8Array): FMContainerMimeType | undefined {
  if (bytes.length >= 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return 'image/png'
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (bytes.length >= 4 &&
      bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return 'image/gif'
  }
  if (bytes.length >= 4 &&
      ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00) ||
       (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a))) {
    return 'image/tiff'
  }
  if (bytes.length >= 4 &&
      bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return 'application/pdf'
  }
  return undefined
}

/**
 * Handle to a single FileMaker container field on a specific record. Created
 * via `EntityRef#container(fieldName)`.
 */
export class ContainerRef {
  /** @internal */ readonly _entity: EntityRef<unknown>
  readonly fieldName: string

  constructor(entity: EntityRef<unknown>, fieldName: string) {
    if (!fieldName) {
      throw new TypeError('ContainerRef: fieldName is required')
    }
    this._entity = entity
    this.fieldName = fieldName
  }

  /**
   * Absolute URL of the container field itself
   * (`…/<EntitySet>(<key>)/<fieldName>`). This is the URL used by binary
   * `upload()`. Append `/$value` to download.
   */
  url(): string {
    return `${this._entity.toURL()}/${encodePathSegment(this.fieldName)}`
  }

  /** @internal — `…/<field>/$value` for downloads. */
  private _valueUrl(): string {
    return `${this.url()}/$value`
  }

  /**
   * Download the container's contents and buffer them into a `Blob`. For
   * very large payloads prefer `getStream()` to avoid buffering in memory.
   */
  async get(opts: RequestOptions = {}): Promise<ContainerDownload> {
    const res = await executeRequest(this._entity._client._ctx, this._valueUrl(), {
      method: 'GET',
      // FMS quirk: `Accept: application/octet-stream` makes `$value` return the
      // stored filename string as `text/plain` instead of the binary. Use the
      // wildcard so FMS returns the actual bytes with a sniffed Content-Type.
      // See `docs/filemaker-quirks.md`.
      accept: 'none',
      ...(opts.signal ? { signal: opts.signal } : {}),
    })

    const contentType = res.headers.get('content-type') ?? ''
    const disposition = res.headers.get('content-disposition')
    const filename = disposition ? parseContentDispositionFilename(disposition) : undefined

    const blob = await res.blob()
    const out: ContainerDownload = {
      blob,
      contentType,
      size: blob.size,
    }
    if (filename !== undefined) out.filename = filename
    return out
  }

  /**
   * Stream the container's contents without buffering. Useful for large files
   * (`pipeTo()` into a writable, forward to another `Response`, etc.).
   *
   * Throws if the underlying `Response` has no body.
   */
  async getStream(opts: RequestOptions = {}): Promise<ReadableStream<Uint8Array>> {
    const res = await executeRequest(this._entity._client._ctx, this._valueUrl(), {
      method: 'GET',
      // See note in `get()` — Accept: */* avoids the FMS `octet-stream` quirk.
      accept: 'none',
      ...(opts.signal ? { signal: opts.signal } : {}),
    })
    if (!res.body) {
      throw new TypeError('ContainerRef.getStream: response has no body')
    }
    return res.body
  }

  /**
   * Upload binary contents to the container. Replaces any existing value.
   *
   * Default `encoding: 'binary'` PATCHes `…/<field>` with raw bytes and a
   * `Content-Type` header. Restricted to PNG / JPEG / GIF / TIFF / PDF.
   *
   * `encoding: 'base64'` PATCHes `…/<EntitySet>(<key>)` with a JSON body
   * containing base64 data plus `@com.filemaker.odata.…` annotations. Use
   * this when updating multiple container fields (or mixing container and
   * regular fields) in a single round-trip.
   *
   * `contentType` is optional — when omitted, the library sniffs the MIME
   * from the payload's magic bytes. Throws if no supported signature matches.
   */
  async upload(input: ContainerUploadInput, opts: RequestOptions = {}): Promise<void> {
    const encoding = input.encoding ?? 'binary'

    // Resolve contentType: caller-supplied takes precedence; otherwise sniff.
    const bytes = await toUint8Array(input.data)
    let contentType = input.contentType
    if (!contentType) {
      const sniffed = sniffContainerMime(bytes)
      if (!sniffed) {
        throw new TypeError(
          'ContainerRef.upload: contentType is required and could not be sniffed from the payload. ' +
            `Pass a contentType explicitly (one of ${FM_CONTAINER_SUPPORTED_MIME_TYPES.join(', ')}).`,
        )
      }
      contentType = sniffed
    }

    if (encoding === 'binary') {
      if (!isSupportedContainerMime(contentType)) {
        throw new TypeError(
          `ContainerRef.upload (binary): contentType "${contentType}" is not a FileMaker-supported container type. ` +
            `Use one of ${FM_CONTAINER_SUPPORTED_MIME_TYPES.join(', ')}, or switch to { encoding: 'base64' }.`,
        )
      }
      const headers: Record<string, string> = {
        'Content-Type': contentType,
      }
      if (input.filename) {
        headers['Content-Disposition'] = formatContentDisposition(input.filename)
      }
      // Normalize to a fresh ArrayBuffer so every fetch implementation (undici,
      // browser, FM Web Viewer) sends raw bytes rather than relying on
      // Uint8Array serialization quirks. Copying also rules out SharedArrayBuffer.
      const body = new ArrayBuffer(bytes.byteLength)
      new Uint8Array(body).set(bytes)
      await executeRequest(this._entity._client._ctx, this.url(), {
        method: 'PATCH',
        headers,
        body,
        accept: 'none',
        ...(opts.signal ? { signal: opts.signal } : {}),
      })
      return
    }

    // base64 mode: PATCH the record with FileMaker annotations.
    const body = buildContainerJsonBody({
      [this.fieldName]: {
        data: toBase64(bytes),
        contentType,
        ...(input.filename ? { filename: input.filename } : {}),
      },
    })
    await executeRequest(this._entity._client._ctx, this._entity.toURL(), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(body),
      accept: 'none',
      ...(opts.signal ? { signal: opts.signal } : {}),
    })
  }

  /**
   * Clear the container value. FMS has no documented per-field DELETE for
   * record-level data, so the supported path is to PATCH the record with
   * `{ <fieldName>: null }`.
   */
  async delete(opts: RequestOptions = {}): Promise<void> {
    const body: Record<string, unknown> = { [this.fieldName]: null }
    await executeRequest(this._entity._client._ctx, this._entity.toURL(), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(body),
      accept: 'none',
      ...(opts.signal ? { signal: opts.signal } : {}),
    })
  }
}

// ---------------------------------------------------------------------------
// JSON-body annotation helpers (shared with multi-container PATCH and POST)
// ---------------------------------------------------------------------------

/**
 * One container value to embed in a JSON body, in raw byte form. Used by
 * `buildContainerJsonBody` and `EntityRef#patchContainers`.
 */
export interface ContainerJsonValue {
  /** Base64-encoded bytes (without `data:` prefix or whitespace). */
  data: string
  /** REQUIRED MIME type. Stored as `@com.filemaker.odata.ContentType`. */
  contentType: string
  /** Optional filename. Stored as `@com.filemaker.odata.Filename`. */
  filename?: string
}

/**
 * Build a JSON body for a POST/PATCH that updates one or more container
 * fields (and optionally regular fields). Inserts the FileMaker annotation
 * keys for every container value.
 *
 * @example
 * buildContainerJsonBody(
 *   {
 *     photo: { data: '<base64>', contentType: 'image/png', filename: 'p.png' },
 *     contract: { data: '<base64>', contentType: 'application/pdf' },
 *   },
 *   { website: 'https://example.com' },
 * )
 */
export function buildContainerJsonBody(
  containers: Record<string, ContainerJsonValue>,
  regularFields: Record<string, unknown> = {},
): Record<string, unknown> {
  const body: Record<string, unknown> = { ...regularFields }
  for (const [field, value] of Object.entries(containers)) {
    if (!value.contentType) {
      throw new TypeError(`buildContainerJsonBody: "${field}".contentType is required`)
    }
    body[field] = value.data
    body[`${field}@com.filemaker.odata.ContentType`] = value.contentType
    if (value.filename) {
      body[`${field}@com.filemaker.odata.Filename`] = value.filename
    }
  }
  return body
}

// ---------------------------------------------------------------------------
// Content-Disposition helpers
// ---------------------------------------------------------------------------

/**
 * Parse the `filename` (or RFC 5987 `filename*`) from a `Content-Disposition`
 * header. Returns `undefined` when no filename parameter is present.
 *
 * Per RFC 6266 §4.3, `filename*` (with explicit charset) takes precedence
 * over `filename` when both are supplied.
 *
 * @internal
 */
export function parseContentDispositionFilename(value: string): string | undefined {
  // RFC 5987: filename*=charset'lang'percent-encoded-value
  const ext = value.match(/filename\*\s*=\s*([^']+)'[^']*'([^;]+)/i)
  if (ext) {
    const charset = ext[1]!.trim().toLowerCase()
    const encoded = ext[2]!.trim()
    try {
      const decoded = decodeURIComponent(encoded)
      // We only honour utf-8; for any other charset return the percent-decoded
      // bytes verbatim (best effort — non-utf8 in headers is exceptionally rare).
      return charset === 'utf-8' || charset === 'utf8' ? decoded : decoded
    } catch {
      // fall through to the plain `filename`
    }
  }

  // Plain `filename="..."` or `filename=...` (unquoted, up to `;` or end).
  const plain = value.match(/filename\s*=\s*("([^"\\]*(?:\\.[^"\\]*)*)"|([^;]+))/i)
  if (plain) {
    const quoted = plain[2]
    if (quoted !== undefined) return quoted.replace(/\\(.)/g, '$1').trim()
    const unquoted = plain[3]
    if (unquoted !== undefined) return unquoted.trim()
  }
  return undefined
}

/**
 * Build a `Content-Disposition` value for an upload. The disposition-type is
 * `inline` to match the example in the Claris OData docs.
 *
 * The Claris doc example uses the **unquoted** form
 * (`filename=ALFKI.png`); FMS has been observed to mis-parse the RFC 6266
 * quoted form on some deployments. So when the filename is composed of
 * RFC 7230 token characters this function emits the unquoted form, falls
 * back to a quoted form when the name contains spaces or other separator
 * characters, and additionally emits an RFC 5987 `filename*=UTF-8''…`
 * parameter for non-ASCII names.
 *
 * @internal
 */
export function formatContentDisposition(filename: string): string {
  // RFC 7230 token = 1*tchar; tchar excludes separators and CTLs.
  const TOKEN_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/
  // eslint-disable-next-line no-control-regex
  const needsRfc5987 = /[^\x00-\x7F]/.test(filename)

  let base: string
  if (TOKEN_RE.test(filename)) {
    base = `inline; filename=${filename}`
  } else {
    const safeAscii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '\\"')
    base = `inline; filename="${safeAscii}"`
  }
  if (!needsRfc5987) return base
  return `${base}; filename*=UTF-8''${encodeURIComponent(filename)}`
}

/** Coerce a `Blob | ArrayBuffer | Uint8Array` to a `Uint8Array`. */
async function toUint8Array(
  data: Blob | ArrayBuffer | Uint8Array,
): Promise<Uint8Array> {
  if (data instanceof Uint8Array) return data
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  // Treat anything else with an `arrayBuffer()` method (e.g. Blob) generically.
  const ab = await (data as Blob).arrayBuffer()
  return new Uint8Array(ab)
}

/**
 * Encode bytes to a base64 string. Uses Node's `Buffer` when available, else
 * a chunked `btoa` fallback (avoids stack overflow on large arrays).
 *
 * @internal
 */
export function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64')
  }
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk)),
    )
  }
  // eslint-disable-next-line no-restricted-globals
  return btoa(bin)
}
