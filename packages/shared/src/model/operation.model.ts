import type { Parameter, PathInfo, SwaggerDefinition } from "../types/swagger.types";
import type { SequenceFormat } from "../utils/functions/media-types";

export type ResponseKind = "json" | "blob" | "arraybuffer" | "text";

/**
 * The request bodies a generated method can bind arguments for and send: a
 * value serialized as JSON, a form sent field by field, a string, or a Blob.
 */
export type RequestBodyKind = "json" | "multipart" | "urlencoded" | "text" | "binary";

/**
 * A success response in a sequential media type: a series of items — one JSON
 * document per line, JSON text sequences, Server-Sent Events — rather than
 * one document. `HttpClient` has no parser for any of them, so it is fetched
 * as text and split by the generated client.
 */
export interface NormalizedResponseSequence {
    format: SequenceFormat;
    /** The content key it is declared under: the one type the request accepts. */
    contentType: string;
    /**
     * Schema of one item, from OpenAPI 3.2's `itemSchema`. Set, the response
     * is a stream: the method emits each item as it arrives. Unset, the
     * response is declared complete, with an array `schema`, and the method
     * emits that array once the response has ended.
     */
    itemSchema?: SwaggerDefinition;
}

/**
 * An OpenAPI 3.2 `in: querystring` parameter that is sent in one piece: its
 * value, serialized, is the entire query string (`/search?%7B%22q%22...%7D`).
 *
 * A form-encoded querystring is not one of these. Its properties are ordinary
 * `key=value` pairs, so the normalizer lists them in `queryParams` instead.
 */
export interface NormalizedQueryString {
    /** The parameter's name. It is never sent: it only names the argument. */
    name: string;
    /** `json`: the value's JSON text; `text`: the value itself, a string. Both percent-encoded. */
    kind: "json" | "text";
    required: boolean;
    /** Schema of the value, for a `json` one. */
    schema?: SwaggerDefinition;
    description?: string;
}

/**
 * A spec operation with everything the generators need precomputed once at
 * normalization time. Generators must not re-derive any of these fields or
 * resolve $refs during emission — that is exactly the duplication this model
 * exists to remove.
 */
export interface NormalizedOperation extends PathInfo {
    /** parameters with in === "path" */
    pathParams: Parameter[];
    /**
     * Everything sent as a `key=value` pair of the query string: parameters
     * with in === "query", and the top-level properties of a form-encoded
     * `in: querystring` parameter (OpenAPI 3.2).
     */
    queryParams: Parameter[];
    /** A querystring parameter sent in one piece; never set together with query parameters. */
    queryString?: NormalizedQueryString;
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
     * The content key the bound body is declared under, as written in the
     * spec (`application/merge-patch+json`, `*`/`*`): where its schema is.
     * Set whenever `bodyKind` is.
     */
    bodyContentKey?: string;
    /**
     * The `Content-Type` a request with the bound body declares: the content
     * key it is declared under (`application/merge-patch+json`,
     * `text/plain; charset=utf-8`).
     *
     * Unset when no body is bound, and when the type is not the spec's to
     * state: a multipart body, whose header the browser writes; and a body
     * declared as a range (`image/*`, `*`/`*`) or as several binary types,
     * where `HttpClient` declares what the value sent is. So it is not where
     * to look for the schema: that is `bodyContentKey`.
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
    /** Set when that response is a sequence of items; `responseType` is then "text". */
    responseSequence?: NormalizedResponseSequence;
}
