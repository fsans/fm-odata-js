import { type HttpClientContext, type HttpRequestOptions } from './http.js';
import { Query } from './query.js';
import type { FMODataOptions, RequestOptions } from './types.js';
/**
 * `FMOData` is the entrypoint for all OData operations against a FileMaker
 * Server database. As of M3, collection `.get()` and single-entity CRUD
 * (`byKey().get/patch/delete`) are implemented. Containers, scripts, metadata,
 * and batch arrive in later milestones.
 */
export declare class FMOData {
    readonly host: string;
    readonly database: string;
    readonly baseUrl: string;
    readonly timeoutMs: number | undefined;
    /** @internal */ readonly _ctx: HttpClientContext;
    constructor(options: FMODataOptions);
    /**
     * Start a query against the given entity set (FileMaker layout name).
     */
    from<T = Record<string, unknown>>(entitySet: string): Query<T>;
    /**
     * Low-level escape hatch: execute a raw request against a path relative to
     * the database base URL (or an absolute URL). Returns the parsed JSON body.
     *
     * @example
     * ```ts
     * const body = await db.request<{ value: unknown[] }>('/contact?$top=1')
     * ```
     */
    request<T = unknown>(pathOrUrl: string, opts?: HttpRequestOptions): Promise<T>;
    /**
     * Low-level escape hatch: execute a raw request and return the `Response`
     * object directly (useful for binary / streaming responses).
     */
    rawRequest(pathOrUrl: string, opts?: HttpRequestOptions): Promise<Response>;
    /** @internal */
    _resolveUrl(pathOrUrl: string): string;
}
export type { RequestOptions };
//# sourceMappingURL=client.d.ts.map