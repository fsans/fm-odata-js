/**
 * Single-entity handle returned by `Query#byKey(key)`. Supports `.get()`,
 * `.patch()`, `.delete()`, and `.script()` (record-scope FileMaker script
 * invocation, v0.1.4+). Containers land later in M4.
 */

import type { FMOData } from './client.js'
import { executeJson, executeRequest } from './http.js'
import { runScriptAtEntity, type ScriptOptions, type ScriptResult } from './scripts.js'
import type { RequestOptions } from './types.js'
import {
  encodePathSegment,
  escapeStringLiteral,
  type ODataLiteral,
} from './url.js'

/** Options accepted by mutating entity operations. */
export interface EntityWriteOptions extends RequestOptions {
  /**
   * Optional `If-Match` precondition. Pass an ETag returned from a prior read
   * to enable optimistic concurrency.
   */
  ifMatch?: string
  /**
   * Whether the server should return the updated representation. Defaults to
   * `false` (`Prefer: return=minimal`) to match FMS behaviour; set to `true`
   * to request `Prefer: return=representation`.
   */
  returnRepresentation?: boolean
}

/**
 * Format an OData primary-key literal for embedding in a URL path
 * (`EntitySet(<key>)`).
 */
function formatKey(key: ODataLiteral): string {
  if (typeof key === 'number') {
    if (!Number.isFinite(key)) {
      throw new TypeError('EntityRef: key must be a finite number')
    }
    return String(key)
  }
  if (typeof key === 'string') return `'${escapeStringLiteral(key)}'`
  if (typeof key === 'boolean') return key ? 'true' : 'false'
  throw new TypeError('EntityRef: unsupported key type')
}

/**
 * Handle to a single OData entity. Holds the client, entity-set name, and the
 * primary key; every method builds a URL of the form
 * `<baseUrl>/<EntitySet>(<key>)` and delegates to the shared HTTP executor.
 */
export class EntityRef<T = Record<string, unknown>> {
  readonly entitySet: string
  readonly key: ODataLiteral

  /** @internal */ readonly _client: FMOData

  constructor(client: FMOData, entitySet: string, key: ODataLiteral) {
    this._client = client
    this.entitySet = entitySet
    this.key = key
  }

  /** Absolute URL for this entity. */
  toURL(): string {
    return `${this._client.baseUrl}/${encodePathSegment(this.entitySet)}(${formatKey(this.key)})`
  }

  /** `GET` the entity. Returns the parsed JSON row. */
  async get(opts: RequestOptions = {}): Promise<T> {
    const json = await executeJson<T>(this._client._ctx, this.toURL(), {
      method: 'GET',
      accept: 'json',
      ...(opts.signal ? { signal: opts.signal } : {}),
    })
    return json
  }

  /**
   * `PATCH` the entity with partial values. Returns the updated row when the
   * server echoes one (OData `Prefer: return=representation`), otherwise
   * `undefined` on `204 No Content`.
   */
  async patch(
    body: Partial<T> | Record<string, unknown>,
    opts: EntityWriteOptions = {},
  ): Promise<T | undefined> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Prefer: opts.returnRepresentation ? 'return=representation' : 'return=minimal',
    }
    if (opts.ifMatch) headers['If-Match'] = opts.ifMatch

    const json = await executeJson<T | undefined>(this._client._ctx, this.toURL(), {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
      accept: 'json',
      ...(opts.signal ? { signal: opts.signal } : {}),
    })
    return json
  }

  /** `DELETE` the entity. Resolves on success; throws `FMODataError` otherwise. */
  async delete(opts: EntityWriteOptions = {}): Promise<void> {
    const headers: Record<string, string> = {}
    if (opts.ifMatch) headers['If-Match'] = opts.ifMatch

    await executeRequest(this._client._ctx, this.toURL(), {
      method: 'DELETE',
      headers,
      accept: 'none',
      ...(opts.signal ? { signal: opts.signal } : {}),
    })
  }

  /**
   * Invoke a FileMaker script in the context of this single record. FMS sets
   * the script's current record to this entity before running it.
   */
  async script(name: string, opts: ScriptOptions = {}): Promise<ScriptResult> {
    return runScriptAtEntity(this._client, this.entitySet, this.key, name, opts)
  }
}

