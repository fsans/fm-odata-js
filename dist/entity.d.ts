/**
 * Single-entity handle returned by `Query#byKey(key)`. Supports `.get()`,
 * `.patch()`, `.delete()`, `.script()` (record-scope FileMaker script
 * invocation, v0.1.4+), and `.container(field)` (container-field binary
 * I/O, v0.1.5+).
 */
import type { FMOData } from './client.js';
import { ContainerRef, type ContainerJsonValue } from './containers.js';
import { type ScriptOptions, type ScriptResult } from './scripts.js';
import type { RequestOptions } from './types.js';
import { type ODataLiteral } from './url.js';
/** Options accepted by mutating entity operations. */
export interface EntityWriteOptions extends RequestOptions {
    /**
     * Optional `If-Match` precondition. Pass an ETag returned from a prior read
     * to enable optimistic concurrency.
     */
    ifMatch?: string;
    /**
     * Whether the server should return the updated representation. Defaults to
     * `false` (`Prefer: return=minimal`) to match FMS behaviour; set to `true`
     * to request `Prefer: return=representation`.
     */
    returnRepresentation?: boolean;
}
/**
 * Handle to a single OData entity. Holds the client, entity-set name, and the
 * primary key; every method builds a URL of the form
 * `<baseUrl>/<EntitySet>(<key>)` and delegates to the shared HTTP executor.
 */
export declare class EntityRef<T = Record<string, unknown>> {
    readonly entitySet: string;
    readonly key: ODataLiteral;
    /** @internal */ readonly _client: FMOData;
    constructor(client: FMOData, entitySet: string, key: ODataLiteral);
    /** Absolute URL for this entity. */
    toURL(): string;
    /** `GET` the entity. Returns the parsed JSON row. */
    get(opts?: RequestOptions): Promise<T>;
    /**
     * `GET` a single field's scalar value via the OData property URL
     * (`…/<EntitySet>(<key>)/<fieldName>`). FMS responds with the JSON envelope
     * `{ value: … }`; this method unwraps it and returns just the value.
     *
     * Useful when you only need one column without composing a `$select` query.
     * For container fields use `container(name).get()` instead.
     */
    fieldValue<V = unknown>(fieldName: string, opts?: RequestOptions): Promise<V>;
    /**
     * `PATCH` the entity with partial values. Returns the updated row when the
     * server echoes one (OData `Prefer: return=representation`), otherwise
     * `undefined` on `204 No Content`.
     */
    patch(body: Partial<T> | Record<string, unknown>, opts?: EntityWriteOptions): Promise<T | undefined>;
    /** `DELETE` the entity. Resolves on success; throws `FMODataError` otherwise. */
    delete(opts?: EntityWriteOptions): Promise<void>;
    /**
     * Invoke a FileMaker script in the context of this single record. FMS sets
     * the script's current record to this entity before running it.
     */
    script(name: string, opts?: ScriptOptions): Promise<ScriptResult>;
    /**
     * Get a typed handle to one of this record's container fields, exposing
     * `.get()`, `.getStream()`, `.upload(...)`, and `.delete()`.
     */
    container(fieldName: string): ContainerRef;
    /**
     * Update one or more container fields (and optionally regular fields) on
     * this record in a single base64 PATCH request. This maps to the Claris
     * "Operation 3" (`PATCH /<EntitySet>(<key>)` with JSON body containing
     * `<field>`, `<field>@com.filemaker.odata.ContentType`, and
     * `<field>@com.filemaker.odata.Filename`).
     *
     * Each container value's `data` must already be base64-encoded (use the
     * library's exported `toBase64()` helper or `Buffer.from(bytes).toString('base64')`).
     *
     * @example
     * await db.from('contact').byKey(7).patchContainers(
     *   {
     *     photo:    { data: photoB64,    contentType: 'image/png',       filename: 'p.png' },
     *     contract: { data: contractB64, contentType: 'application/pdf', filename: 'c.pdf' },
     *   },
     *   { website: 'https://example.com' },
     * )
     */
    patchContainers(containers: Record<string, ContainerJsonValue>, regularFields?: Record<string, unknown>, opts?: EntityWriteOptions): Promise<void>;
}
//# sourceMappingURL=entity.d.ts.map