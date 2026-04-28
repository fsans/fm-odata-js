/**
 * Single-entity handle returned by `Query#byKey(key)`. Supports `.get()`,
 * `.patch()`, and `.delete()` in M3. Containers and scripts land in M4.
 */
import type { FMOData } from './client.js';
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
}
//# sourceMappingURL=entity.d.ts.map