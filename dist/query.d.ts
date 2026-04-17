/**
 * Fluent OData query builder.
 *
 * `Query` accumulates `$select`, `$filter`, `$expand`, `$orderby`, `$top`,
 * `$skip`, `$count`, and `$search` options and serializes them into an absolute
 * URL via `toURL()`. Actual HTTP execution (`.get()`) lands in M3 alongside
 * auth, error handling, and the mock server.
 */
import type { FMOData } from './client.js';
import { EntityRef } from './entity.js';
import type { RequestOptions } from './types.js';
import { type ODataLiteral } from './url.js';
/**
 * Opaque filter expression produced by `filterFactory`. Use `.and()`, `.or()`,
 * `.not()` to compose; pass to `Query#filter`.
 */
export declare class Filter {
    readonly expr: string;
    constructor(expr: string);
    toString(): string;
    and(other: Filter | string): Filter;
    or(other: Filter | string): Filter;
    not(): Filter;
    /** @internal */
    static coerce(x: Filter | string): string;
}
/** Factory passed to callback-form `Query#filter(f => ...)`. */
export interface FilterFactory {
    eq(field: string, value: ODataLiteral): Filter;
    ne(field: string, value: ODataLiteral): Filter;
    gt(field: string, value: ODataLiteral): Filter;
    ge(field: string, value: ODataLiteral): Filter;
    lt(field: string, value: ODataLiteral): Filter;
    le(field: string, value: ODataLiteral): Filter;
    startswith(field: string, value: string): Filter;
    endswith(field: string, value: string): Filter;
    contains(field: string, value: string): Filter;
    and(a: Filter | string, b: Filter | string): Filter;
    or(a: Filter | string, b: Filter | string): Filter;
    not(a: Filter | string): Filter;
    /** Escape hatch: embed a raw OData filter fragment verbatim. */
    raw(expr: string): Filter;
}
export declare const filterFactory: FilterFactory;
export type FilterInput = Filter | string | ((f: FilterFactory) => Filter | string);
export type OrderDir = 'asc' | 'desc';
/** @internal */
export interface QueryOptionsState {
    select?: string[];
    filter?: string;
    expand?: Array<{
        name: string;
        options?: QueryOptionsState;
    }>;
    orderby?: Array<{
        field: string;
        dir: OrderDir;
    }>;
    top?: number;
    skip?: number;
    count?: boolean;
    search?: string;
}
/**
 * Fluent query builder. Methods mutate and return `this` for chaining.
 */
/** Result envelope returned by `Query#get()`. */
export interface QueryResult<T> {
    value: T[];
    /** Present when `.count()` was enabled on the query. */
    count?: number;
    /** Server-driven paging link. */
    nextLink?: string;
}
export declare class Query<T = Record<string, unknown>> {
    /** @internal */ readonly _state: QueryOptionsState;
    /** @internal */ readonly _baseUrl: string;
    /** @internal */ readonly _entitySet: string;
    /** @internal */ readonly _client: FMOData | undefined;
    constructor(baseUrl: string, entitySet: string, client?: FMOData);
    select(...fields: string[]): this;
    filter(input: FilterInput): this;
    or(input: FilterInput): this;
    expand(name: string, build?: (q: Query) => Query | void): this;
    orderby(field: string, dir?: OrderDir): this;
    top(n: number): this;
    skip(n: number): this;
    count(enabled?: boolean): this;
    search(term: string): this;
    /** Build the absolute request URL for this query. */
    toURL(): string;
    /**
     * Get a handle to a single entity by its primary key. Subsequent operations
     * (`.get()`, `.patch()`, `.delete()`) hit `/<EntitySet>(<key>)`.
     */
    byKey(key: string | number): EntityRef<T>;
    /**
     * `POST` a new entity to the collection. Returns the created row (FMS echoes
     * it by default).
     */
    create(body: Partial<T> | Record<string, unknown>, opts?: RequestOptions): Promise<T>;
    /**
     * Execute the query. Returns the parsed OData collection envelope.
     */
    get(opts?: RequestOptions): Promise<QueryResult<T>>;
}
/**
 * Serialize query options either as a top-level querystring (percent-encoded)
 * or as a nested `$expand` option block (semicolon-joined, unencoded — the
 * outer param encoder will encode the whole block once).
 *
 * @internal
 */
export declare function serializeOptions(s: QueryOptionsState, opts: {
    topLevel: boolean;
}): string;
//# sourceMappingURL=query.d.ts.map