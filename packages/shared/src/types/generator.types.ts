/**
 * Per-operation facts a method generator needs while emitting a body.
 * The normalizer precomputes all of these onto NormalizedOperation —
 * this shape survives for consumers that carry them separately.
 */
export interface MethodGenerationContext {
    pathParams: Array<{ name: string; in: string }>;
    queryParams: Array<{ name: string; in: string }>;
    hasBody: boolean;
    isMultipart: boolean;
    isUrlEncoded: boolean;
    formDataFields: string[];
    urlEncodedFields: string[];
    responseType: "json" | "blob" | "arraybuffer" | "text";
}

/**
 * Loose schema shape accepted by getTypeScriptType at boundaries where a
 * fully-typed SwaggerDefinition isn't available (e.g. Swagger 2.0 parameters
 * carrying type/format directly). The index signature admits raw spec JSON.
 */
export interface TypeSchema {
    type?: string;
    format?: string;
    $ref?: string;
    items?: TypeSchema | TypeSchema[];
    nullable?: boolean;
    enum?: Array<string | number>;

    [key: string]: unknown;
}

/** MethodGenerationContext subset that GET-only generation (http-resource) needs. */
export interface GetMethodGenerationContext {
    pathParams: Array<{ name: string; in: string }>;
    queryParams: Array<{ name: string; in: string }>;
    responseType: "json" | "blob" | "arraybuffer" | "text";
}
