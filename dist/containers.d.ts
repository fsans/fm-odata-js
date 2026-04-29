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
import type { EntityRef } from './entity.js';
import type { RequestOptions } from './types.js';
/** Result of a successful container download. */
export interface ContainerDownload {
    /** Binary contents as a `Blob` (works in browsers, Web Viewer, and Node 18+). */
    blob: Blob;
    /** MIME type reported by FMS (e.g. `image/png`); empty string if absent. */
    contentType: string;
    /** Filename parsed from `Content-Disposition`, when present. */
    filename?: string;
    /** Byte length. `0` indicates an empty container. */
    size: number;
}
/** Input accepted by `ContainerRef#upload`. */
export interface ContainerUploadInput {
    /** Binary payload. `fetch` accepts all three forms natively. */
    data: Blob | ArrayBuffer | Uint8Array;
    /**
     * Content-Type to send with the upload. Optional: when omitted, the library
     * sniffs the MIME from the payload's magic bytes (PNG, JPEG, GIF, TIFF, PDF).
     * Throws if it cannot detect a supported type.
     */
    contentType?: string;
    /**
     * Optional filename to store in the container. Surfaced on download via
     * `Content-Disposition: attachment; filename="…"`. When omitted, FMS stores
     * (and surfaces back) the auto-generated name `Untitled.png`.
     */
    filename?: string;
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
    encoding?: 'binary' | 'base64';
}
/**
 * MIME types FMS accepts for container fields. Other types (audio, video,
 * zip, docx, …) may upload but won't be classified as a media type and won't
 * preview correctly in FileMaker.
 */
export declare const FM_CONTAINER_SUPPORTED_MIME_TYPES: readonly ["image/png", "image/jpeg", "image/gif", "image/tiff", "application/pdf"];
export type FMContainerMimeType = (typeof FM_CONTAINER_SUPPORTED_MIME_TYPES)[number];
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
export declare function sniffContainerMime(bytes: Uint8Array): FMContainerMimeType | undefined;
/**
 * Handle to a single FileMaker container field on a specific record. Created
 * via `EntityRef#container(fieldName)`.
 */
export declare class ContainerRef {
    /** @internal */ readonly _entity: EntityRef<unknown>;
    readonly fieldName: string;
    constructor(entity: EntityRef<unknown>, fieldName: string);
    /**
     * Absolute URL of the container field itself
     * (`…/<EntitySet>(<key>)/<fieldName>`). This is the URL used by binary
     * `upload()`. Append `/$value` to download.
     */
    url(): string;
    /** @internal — `…/<field>/$value` for downloads. */
    private _valueUrl;
    /**
     * Download the container's contents and buffer them into a `Blob`. For
     * very large payloads prefer `getStream()` to avoid buffering in memory.
     */
    get(opts?: RequestOptions): Promise<ContainerDownload>;
    /**
     * Stream the container's contents without buffering. Useful for large files
     * (`pipeTo()` into a writable, forward to another `Response`, etc.).
     *
     * Throws if the underlying `Response` has no body.
     */
    getStream(opts?: RequestOptions): Promise<ReadableStream<Uint8Array>>;
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
    upload(input: ContainerUploadInput, opts?: RequestOptions): Promise<void>;
    /**
     * Clear the container value. FMS has no documented per-field DELETE for
     * record-level data, so the supported path is to PATCH the record with
     * `{ <fieldName>: null }`.
     */
    delete(opts?: RequestOptions): Promise<void>;
}
/**
 * One container value to embed in a JSON body, in raw byte form. Used by
 * `buildContainerJsonBody` and `EntityRef#patchContainers`.
 */
export interface ContainerJsonValue {
    /** Base64-encoded bytes (without `data:` prefix or whitespace). */
    data: string;
    /** REQUIRED MIME type. Stored as `@com.filemaker.odata.ContentType`. */
    contentType: string;
    /** Optional filename. Stored as `@com.filemaker.odata.Filename`. */
    filename?: string;
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
export declare function buildContainerJsonBody(containers: Record<string, ContainerJsonValue>, regularFields?: Record<string, unknown>): Record<string, unknown>;
/**
 * Parse the `filename` (or RFC 5987 `filename*`) from a `Content-Disposition`
 * header. Returns `undefined` when no filename parameter is present.
 *
 * Per RFC 6266 §4.3, `filename*` (with explicit charset) takes precedence
 * over `filename` when both are supplied.
 *
 * @internal
 */
export declare function parseContentDispositionFilename(value: string): string | undefined;
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
export declare function formatContentDisposition(filename: string): string;
/**
 * Encode bytes to a base64 string. Uses Node's `Buffer` when available, else
 * a chunked `btoa` fallback (avoids stack overflow on large arrays).
 *
 * @internal
 */
export declare function toBase64(bytes: Uint8Array): string;
//# sourceMappingURL=containers.d.ts.map