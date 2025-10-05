import { GeneratorConfig, TypeSchema } from "../types";
import { pascalCase } from "./string.utils";

/**
 * Convert OpenAPI/Swagger types to TypeScript types
 * @param schemaOrType - Either a schema object or a type string
 * @param config - generator configuration
 * @param formatOrNullable - Either format string (if first param is string) or nullable boolean
 * @param isNullable - Nullable boolean (only used if first param is string)
 * @param context - Whether this is for type generation or service generation
 */
export function getTypeScriptType(
    schemaOrType: TypeSchema | string | undefined,
    config: GeneratorConfig,
    formatOrNullable?: string | boolean,
    isNullable?: boolean,
    context: "type" | "service" = "type"
): string {
    // Handle the two different call signatures
    let schema: TypeSchema;
    let nullable: boolean | undefined;

    if (typeof schemaOrType === "string" || schemaOrType === undefined) {
        // Called with separate parameters (old mapSwaggerTypeToTypeScript style)
        schema = {
            type: schemaOrType,
            format: typeof formatOrNullable === "string" ? formatOrNullable : undefined,
        };
        nullable = typeof formatOrNullable === "boolean" ? formatOrNullable : isNullable;
    } else {
        // Called with schema object (current getTypeScriptType style)
        schema = schemaOrType;
        nullable = typeof formatOrNullable === "boolean" ? formatOrNullable : schema.nullable;
    }

    if (!schema) {
        return "any";
    }

    // Handle references
    if (schema.$ref) {
        const refName = schema.$ref.split("/").pop();
        return nullableType(pascalCase(refName!), nullable);
    }

    // Handle arrays
    if (schema.type === "array") {
        const itemType = schema.items
            ? getTypeScriptType(schema.items, config, undefined, undefined, context)
            : "unknown";
        return nullable ? `(${itemType}[] | null)` : `${itemType}[]`;
    }

    // Handle specific types
    switch (schema.type) {
        case "string":
            if (schema.enum) {
                return schema.enum
                    .map((value) => (typeof value === "string" ? `'${escapeString(value)}'` : String(value)))
                    .join(" | ");
            }

            // Date handling
            if (schema.format === "date" || schema.format === "date-time") {
                const dateType = config.options.dateType === "Date" ? "Date" : "string";
                return nullableType(dateType, nullable);
            }

            // Binary handling
            if (schema.format === "binary") {
                // Use Blob for type generation (interfaces)
                // Use File for service parameters (uploads)
                // Use Blob for service responses (downloads)
                const binaryType = context === "type" ? "Blob" : "File";
                return nullableType(binaryType, nullable);
            }

            // Other string formats
            if (
                schema.format === "uuid" ||
                schema.format === "email" ||
                schema.format === "uri" ||
                schema.format === "hostname" ||
                schema.format === "ipv4" ||
                schema.format === "ipv6"
            ) {
                return nullableType("string", nullable);
            }

            return nullableType("string", nullable);

        case "number":
        case "integer":
            return nullableType("number", nullable);

        case "boolean":
            return nullableType("boolean", nullable);

        case "object":
            // Use more specific type for type generation
            return nullableType(context === "type" ? "Record<string, any>" : "any", nullable);

        case "null":
            return "null";

        default:
            if (Array.isArray(schema.type)) {
                const types = schema.type.map((t) => getTypeScriptType(t, config, undefined, undefined, context));
                return nullableType(types.join(" | "), nullable);
            }
            return nullableType("any", nullable);
    }
}

export function nullableType(type: string, isNullable?: boolean): string {
    return type + (isNullable ? " | null" : "");
}

export function escapeString(str: string): string {
    return str.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
