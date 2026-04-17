import { executeJson, executeRequest, type HttpClientContext, type HttpRequestOptions } from './http.js'
import { Query } from './query.js'
import type { FMODataOptions, RequestOptions } from './types.js'

/**
 * `FMOData` is the entrypoint for all OData operations against a FileMaker
 * Server database. As of M3, collection `.get()` and single-entity CRUD
 * (`byKey().get/patch/delete`) are implemented. Containers, scripts, metadata,
 * and batch arrive in later milestones.
 */
export class FMOData {
  readonly host: string
  readonly database: string
  readonly baseUrl: string
  readonly timeoutMs: number | undefined

  /** @internal */ readonly _ctx: HttpClientContext

  constructor(options: FMODataOptions) {
    if (!options.host) throw new TypeError('FMOData: `host` is required')
    if (!options.database) throw new TypeError('FMOData: `database` is required')
    if (options.token === undefined || options.token === null) {
      throw new TypeError('FMOData: `token` is required')
    }

    this.host = options.host.replace(/\/+$/, '')
    this.database = options.database
    this.baseUrl = `${this.host}/fmi/odata/v4/${encodeURIComponent(this.database)}`
    this.timeoutMs = options.timeoutMs

    this._ctx = {
      token: options.token,
      fetch: options.fetch ?? globalThis.fetch.bind(globalThis),
      timeoutMs: options.timeoutMs,
      ...(options.onUnauthorized ? { onUnauthorized: options.onUnauthorized } : {}),
    }
  }

  /**
   * Start a query against the given entity set (FileMaker layout name).
   */
  from<T = Record<string, unknown>>(entitySet: string): Query<T> {
    if (!entitySet) throw new TypeError('FMOData#from: entitySet is required')
    return new Query<T>(this.baseUrl, entitySet, this)
  }

  /**
   * Low-level escape hatch: execute a raw request against a path relative to
   * the database base URL (or an absolute URL). Returns the parsed JSON body.
   *
   * @example
   * ```ts
   * const body = await db.request<{ value: unknown[] }>('/contact?$top=1')
   * ```
   */
  async request<T = unknown>(pathOrUrl: string, opts: HttpRequestOptions = {}): Promise<T> {
    return executeJson<T>(this._ctx, this._resolveUrl(pathOrUrl), opts)
  }

  /**
   * Low-level escape hatch: execute a raw request and return the `Response`
   * object directly (useful for binary / streaming responses).
   */
  async rawRequest(pathOrUrl: string, opts: HttpRequestOptions = {}): Promise<Response> {
    return executeRequest(this._ctx, this._resolveUrl(pathOrUrl), opts)
  }

  /** @internal */
  _resolveUrl(pathOrUrl: string): string {
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
    if (pathOrUrl.startsWith('/')) return `${this.baseUrl}${pathOrUrl}`
    return `${this.baseUrl}/${pathOrUrl}`
  }
}

// Re-export for ergonomic imports in callers (`import { RequestOptions } …`).
export type { RequestOptions }
