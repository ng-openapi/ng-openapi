import type { SwaggerDefinition, SwaggerResponse } from "../../types/swagger.types";
import type { TypeMappingConfig } from "../../types/config.types";
import { getTypeScriptType } from "../type.utils";

/** Result of analyzing a response's content types once for both concerns. */
export interface ResponseTypeInfo {
    /** Angular `responseType` of the highest-priority content type. */
    responseType: "json" | "blob" | "arraybuffer" | "text";
    /**
     * Accept header value: the declared content types whose inferred kind
     * matches `responseType` (priority winner first, comma-joined, media type
     * parameters preserved). Unset when the response declares no content.
     */
    acceptHeader?: string;
}

/**
 * Angular `responseType` for a response: inspects every content type the
 * response declares and picks the highest-priority match (JSON-like content
 * beats text beats binary). `responseTypeMapping` lets the user config pin a
 * responseType per content type; empty content defaults to "json".
 */
export function getResponseTypeFromResponse(
    response: SwaggerResponse,
    responseTypeMapping?: { [p: string]: "json" | "blob" | "arraybuffer" | "text" },
): "json" | "blob" | "arraybuffer" | "text" {
    return getResponseInfoFromResponse(response, responseTypeMapping).responseType;
}

/**
 * Same content-type analysis as getResponseTypeFromResponse, additionally
 * deriving the Accept header value from the content types that agree with the
 * chosen responseType — advertising a type the method cannot parse would
 * invite a response Angular's HttpClient chokes on.
 */
export function getResponseInfoFromResponse(
    response: SwaggerResponse,
    responseTypeMapping?: { [p: string]: "json" | "blob" | "arraybuffer" | "text" },
): ResponseTypeInfo {
    const content = response.content || {};

    if (Object.keys(content).length === 0) {
        return { responseType: "json" }; // default for empty content
    }

    // Collect all possible response types with their priorities
    const responseTypes: Array<{
        type: "json" | "blob" | "arraybuffer" | "text";
        priority: number;
        contentType: string;
        isPrimitive?: boolean;
    }> = [];

    // Check each content type and its schema
    for (const [contentType, mediaType] of Object.entries(content)) {
        const schema = mediaType?.schema;

        // Check custom mappings first (highest priority)
        const mapping = responseTypeMapping || {};
        if (mapping[contentType]) {
            responseTypes.push({
                type: mapping[contentType],
                priority: 1, // highest priority
                contentType,
            });
            continue;
        }

        // Check schema format for binary indication
        if (schema?.format === "binary" || schema?.format === "byte") {
            responseTypes.push({
                type: "blob",
                priority: 2,
                contentType,
            });
            continue;
        }

        // Check if schema type indicates binary
        if (schema?.type === "string" && (schema?.format === "binary" || schema?.format === "byte")) {
            responseTypes.push({
                type: "blob",
                priority: 2,
                contentType,
            });
            continue;
        }

        // Check if this is a primitive type in JSON format
        const isPrimitive = isPrimitiveType(schema);
        const inferredType = inferResponseTypeFromContentType(contentType);

        let priority = 3; // default priority
        let finalType = inferredType;

        // Special handling for JSON content types with primitive schemas
        if (inferredType === "json" && isPrimitive) {
            // For primitive types, prefer text over json for efficiency
            finalType = "text";
            priority = 2; // Higher priority than regular JSON
        } else if (inferredType === "json") {
            // Regular JSON (objects, arrays) get normal priority
            priority = 2;
        }

        responseTypes.push({
            type: finalType,
            priority,
            contentType,
            isPrimitive,
        });
    }

    // Sort by priority (lower number = higher priority) and return the best match
    responseTypes.sort((a, b) => a.priority - b.priority);
    const responseType = responseTypes[0]?.type || "json";
    const acceptedContentTypes = responseTypes
        .filter((candidate) => candidate.type === responseType)
        .map((candidate) => candidate.contentType);

    return {
        responseType,
        acceptHeader: acceptedContentTypes.length > 0 ? acceptedContentTypes.join(", ") : undefined,
    };
}

/**
 * Whether a schema resolves to a bare primitive (string/number/integer/
 * boolean). Arrays, objects, $refs and compositions all count as complex.
 */
export function isPrimitiveType(schema: SwaggerDefinition | undefined): boolean {
    if (!schema) return false;

    // Direct primitive types
    const primitiveTypes = ["string", "number", "integer", "boolean"];
    if (schema.type && primitiveTypes.includes(schema.type)) {
        return true;
    }

    // Arrays of primitives are still considered complex
    if (schema.type === "array") {
        return false;
    }

    // Objects are complex
    if (schema.type === "object" || schema.properties) {
        return false;
    }

    // References are assumed to be complex types
    if (schema.$ref) {
        return false;
    }

    // allOf, oneOf, anyOf are complex
    if (schema.allOf || schema.oneOf || schema.anyOf) {
        return false;
    }

    return false;
}

/**
 * Maps a MIME type (parameters like charset stripped) to the Angular
 * `responseType` used when fetching it; unknown types are assumed binary.
 */
export function inferResponseTypeFromContentType(contentType: string): "json" | "blob" | "arraybuffer" | "text" {
    // Normalize content type (remove parameters like charset)
    const normalizedType = contentType.split(";")[0].trim().toLowerCase();

    // JSON types (highest priority for structured data)
    if (
        normalizedType.includes("json") ||
        normalizedType === "application/ld+json" ||
        normalizedType === "application/hal+json" ||
        normalizedType === "application/vnd.api+json"
    ) {
        return "json";
    }

    // XML can be treated as text for parsing
    if (
        normalizedType.includes("xml") ||
        normalizedType === "application/soap+xml" ||
        normalizedType === "application/atom+xml" ||
        normalizedType === "application/rss+xml"
    ) {
        return "text";
    }

    // Text types (but exclude certain binary-like text types)
    if (normalizedType.startsWith("text/")) {
        // These text types are better handled as blobs
        const binaryTextTypes = ["text/rtf", "text/cache-manifest", "text/vcard", "text/calendar"];

        if (binaryTextTypes.includes(normalizedType)) {
            return "blob";
        }

        return "text";
    }

    // Form data should be handled as text for parsing
    if (normalizedType === "CONTENT_TYPES.FORM_URLENCODED" || normalizedType === "multipart/form-data") {
        return "text";
    }

    // Specific text-like application types
    if (
        normalizedType === "application/javascript" ||
        normalizedType === "application/typescript" ||
        normalizedType === "application/css" ||
        normalizedType === "application/yaml" ||
        normalizedType === "application/x-yaml" ||
        normalizedType === "application/toml"
    ) {
        return "text";
    }

    // Binary types that should use arraybuffer for better performance
    if (
        normalizedType.startsWith("image/") ||
        normalizedType.startsWith("audio/") ||
        normalizedType.startsWith("video/") ||
        normalizedType === "application/pdf" ||
        normalizedType === "application/zip" ||
        normalizedType.includes("octet-stream")
    ) {
        return "arraybuffer";
    }

    // Everything else is likely binary and should be blob
    return "blob";
}

/**
 * TS type of a response body for generated signatures: schema-derived when
 * the response declares one, otherwise Blob/ArrayBuffer/string per the
 * detected responseType ("any" for schema-less JSON).
 */
export function getResponseType(response: SwaggerResponse, config: TypeMappingConfig): string {
    const responseType = getResponseTypeFromResponse(response);
    const content = response.content || {};

    // For any response type, if we have schema information, use it for TypeScript typing
    for (const [contentType, mediaType] of Object.entries(content)) {
        if (mediaType?.schema) {
            // Always use the schema's TypeScript type, regardless of HTTP response type
            return getTypeScriptType(mediaType.schema, config, mediaType.schema.nullable);
        }
    }

    // Fallback to HTTP response type mapping only if no schema is available
    switch (responseType) {
        case "blob":
            return "Blob";
        case "arraybuffer":
            return "ArrayBuffer";
        case "text":
            return "string";
        default:
            return "any";
    }
}
