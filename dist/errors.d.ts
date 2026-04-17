/**
 * Normalized error thrown by all fm-odata-js operations.
 */
export declare class FMODataError extends Error {
    readonly status: number;
    readonly code: string | undefined;
    readonly odataError: unknown;
    readonly request: {
        url: string;
        method: string;
    } | undefined;
    constructor(message: string, init: {
        status: number;
        code?: string;
        odataError?: unknown;
        request?: {
            url: string;
            method: string;
        };
    });
}
/**
 * Parse an error Response body into a `FMODataError`. Handles both stock OData
 * JSON envelopes (`{ error: { code, message } }`) and FileMaker's XML envelope
 * (`<m:error><m:code>212</m:code><m:message>...</m:message></m:error>`).
 *
 * @internal
 */
export declare function parseErrorResponse(res: Response, request: {
    url: string;
    method: string;
}): Promise<FMODataError>;
//# sourceMappingURL=errors.d.ts.map