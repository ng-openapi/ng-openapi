import type { Parameter, PathInfo, SwaggerDefinition } from "../types/swagger.types";

export type ResponseKind = "json" | "blob" | "arraybuffer" | "text";

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
}
