import { GeneratorConfig, SwaggerDefinition, SwaggerResponse } from "../../types";
import { getTypeScriptType } from "../type.utils";

export function getResponseTypeFromResponse(
    response: SwaggerResponse,
    responseTypeMapping?: { [p: string]: "json" | "blob" | "arraybuffer" | "text" }
): "json" | "blob" | "arraybuffer" | "text" {
    const content = response.content || {};

    if (Object.keys(content).length === 0) {
        return "json"; // default for empty content
    }

    const responseTypes: Array<{
        type: "json" | "blob" | "arraybuffer" | "text";
        priority: number;
        contentType: string;
        isPrimitive?: boolean;
    }> = [];

    for (const [contentType, mediaType] of Object.entries(content)) {
        const schema = mediaType?.schema;

        // If there's no schema, we can only infer from content type
        if (!schema) {
            responseTypes.push({
                type: inferResponseTypeFromContentType(contentType),
                priority: 3,
                contentType,
            });
            continue;
        }

        // --- CORE FIX: Use a type guard before accessing schema properties ---
        if (!('$ref' in schema)) {
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
            if (schema.format === "binary" || schema.format === "byte") {
                responseTypes.push({
                    type: "blob",
                    priority: 2,
                    contentType,
                });
                continue;
            }

            // Check if schema type indicates binary
            if (schema.type === "string" && (schema.format === "binary" || schema.format === "byte")) {
                responseTypes.push({
                    type: "blob",
                    priority: 2,
                    contentType,
                });
                continue;
            }

            const isPrimitive = isPrimitiveType(schema);
            const inferredType = inferResponseTypeFromContentType(contentType);

            let priority = 3; // default priority
            let finalType = inferredType;

            // Special handling for JSON content types with primitive schemas
            if (inferredType === "json" && isPrimitive) {
                finalType = "text";
                priority = 2;
            } else if (inferredType === "json") {
                priority = 2;
            }

            responseTypes.push({
                type: finalType,
                priority,
                contentType,
                isPrimitive,
            });
        } else {
            // It's a reference, we can only infer from content type
            responseTypes.push({
                type: inferResponseTypeFromContentType(contentType),
                priority: 3,
                contentType,
            });
        }
    }

    if (responseTypes.length === 0) {
        return "json";
    }

    responseTypes.sort((a, b) => a.priority - b.priority);
    return responseTypes[0].type;
}

export function isPrimitiveType(schema: SwaggerDefinition | undefined): boolean {
    if (!schema) return false;

    const primitiveTypes = ["string", "number", "integer", "boolean"];
    if (typeof schema.type === 'string' && primitiveTypes.includes(schema.type)) {
        return true;
    }

    return false;
}

export function inferResponseTypeFromContentType(contentType: string): "json" | "blob" | "arraybuffer" | "text" {
    // Normalize content type (remove parameters like charset)
    const normalizedType = contentType.split(";")[0].trim().toLowerCase();

    if (
        normalizedType.includes("json") ||
        normalizedType.endsWith("+json")
    ) {
        return "json";
    }

    if (
        normalizedType.includes("xml") ||
        normalizedType.endsWith("+xml")
    ) {
        return "text";
    }

    if (normalizedType.startsWith("text/")) {
        return "text";
    }

    if (normalizedType.includes("octet-stream")) {
        return "arraybuffer";
    }

    if (
        normalizedType.startsWith("image/") ||
        normalizedType.startsWith("audio/") ||
        normalizedType.startsWith("video/") ||
        normalizedType === "application/pdf" ||
        normalizedType === "application/zip"
    ) {
        return "blob";
    }

    // Fallback for other application/* types that aren't json or binary
    if (normalizedType.startsWith("application/")) {
        return "text";
    }

    return "blob";
}

export function getResponseType(response: SwaggerResponse, config: GeneratorConfig): string {
    const responseType = getResponseTypeFromResponse(response, config.options.responseTypeMapping);
    const content = response.content || {};

    for (const [, mediaType] of Object.entries(content)) {
        if (mediaType?.schema) {
            // --- CORE FIX (Final error) ---
            const isNullable = !('$ref' in mediaType.schema) ? mediaType.schema.nullable : undefined;
            return getTypeScriptType(mediaType.schema, config, isNullable);
        }
    }

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
