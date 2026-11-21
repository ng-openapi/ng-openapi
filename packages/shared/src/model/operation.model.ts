import type { Parameter, PathInfo, SwaggerDefinition } from "../types/swagger.types";

export type ResponseKind = "json" | "blob" | "arraybuffer" | "text";

/**
 * The request bodies a generated method can bind arguments for and send: a
 * value serialized as JSON, a form sent field by field, a string, or a Blob.
 */
export type RequestBodyKind = "json" | "multipart" | "urlencoded" | "text" | "binary";

/**
 * A spec operation with everything the generators need precomputed once at
 * normalization time. Generators must not re-derive any of these fields or
 * resolve $refs during emission — that is exactly the duplication this model
 * exists to remove.
 */
export interface NormalizedOperation extends PathInfo {
    /** parameters with in === "path" */
    pathParams: Parameter[];
    /** parameters with in === "query" */
    queryParams: Parameter[];
    hasBody: boolean;
    /**
     * The body a generated request actually carries, and so the arguments its
     * method takes for one. Narrower than `hasBody`: unset when the operation
     * declares no body, declares only a content type the generators do not
     * bind, or declares a form that lists no fields. Every client reads this
     * instead of re-deriving it from the three flags around it.
     */
    bodyKind?: RequestBodyKind;
    /**
     * The `Content-Type` a request with the bound body declares: the content
     * key it is declared under, as written in the spec
     * (`application/merge-patch+json`, `text/plain; charset=utf-8`). For a
     * JSON body that key is also where its schema is.
     *
     * Unset when no body is bound, and when the type is not the spec's to
     * state: a multipart body, whose header the browser writes; and a body
     * declared as a range (`image/*`) or as several binary types, where the
     * value sent says what it is.
     */
    bodyContentType?: string;
    isMultipart: boolean;
    /** urlencoded body without a JSON alternative */
    isUrlEncoded: boolean;
    /** ref-resolved multipart body schema (set only when isMultipart) */
    formDataSchema?: SwaggerDefinition;
    /** field names of formDataSchema's properties */
    formDataFields: string[];
    /** ref-resolved urlencoded body schema (set only when isUrlEncoded) */
    urlEncodedSchema?: SwaggerDefinition;
    /** field names of urlEncodedSchema's properties */
    urlEncodedFields: string[];
    /** derived from the first success response (200/201/202/204/206) */
    responseType: ResponseKind;
    /**
     * Accept header value derived from the same success response: its content
     * types that agree with responseType (unset when none are declared).
     */
    acceptHeader?: string;
}
