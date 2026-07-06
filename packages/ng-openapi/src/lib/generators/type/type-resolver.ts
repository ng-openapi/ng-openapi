import { getModelTypeName, SwaggerDefinition, TypeMappingConfig } from "@ng-openapi/shared";

export function escapeString(str: string): string {
    return str.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export function sanitizePropertyName(name: string): string {
    if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name)) {
        return `"${name}"`;
    }
    return name;
}

/**
 * Maps swagger/OpenAPI schemas to TypeScript type expressions.
 * Pure string output — no AST manipulation, no file emission.
 */
export class TypeResolver {
    private readonly config: TypeMappingConfig;
    private readonly onWarning?: (message: string) => void;
    private readonly resolutionCache = new WeakMap<SwaggerDefinition, string>();
    private readonly pascalCaseCache = new Map<string, string>();
    private readonly sanitizedNameCache = new Map<string, string>();
    private referenceSink: Set<string> | null = null;

    constructor(config: TypeMappingConfig, onWarning?: (message: string) => void) {
        this.config = config;
        this.onWarning = onWarning;
    }

    /**
     * Runs `fn` while recording the raw schema name of every `$ref` resolved
     * during its execution (allOf/oneOf/anyOf members, array items and inline
     * object properties all funnel through resolve()). Per-type model
     * generation uses this to compute cross-file imports without the
     * language service.
     */
    withReferenceTracking<T>(sink: Set<string>, fn: () => T): T {
        const previous = this.referenceSink;
        this.referenceSink = sink;
        try {
            return fn();
        } finally {
            this.referenceSink = previous;
        }
    }

    resolve(schema: SwaggerDefinition): string {
        // Record before the cache check so a cache hit still reports the reference
        if (schema.$ref && this.referenceSink) {
            const refName = schema.$ref.split("/").pop();
            if (refName) {
                this.referenceSink.add(refName);
            }
        }

        const cached = this.resolutionCache.get(schema);
        if (cached !== undefined) {
            return cached;
        }

        const result = this.resolveUncached(schema);
        this.resolutionCache.set(schema, result);
        return result;
    }

    pascalName(str: string): string {
        if (!this.pascalCaseCache.has(str)) {
            this.pascalCaseCache.set(str, getModelTypeName(str, this.config.options.naming?.models));
        }
        return this.pascalCaseCache.get(str) as string;
    }

    sanitizeName(name: string): string {
        if (!this.sanitizedNameCache.has(name)) {
            this.sanitizedNameCache.set(name, sanitizePropertyName(name));
        }
        return this.sanitizedNameCache.get(name) as string;
    }

    getArrayItemType(items: SwaggerDefinition | SwaggerDefinition[]): string {
        if (Array.isArray(items)) {
            const types = items.map((item) => this.resolve(item));
            return `[${types.join(", ")}]`;
        } else {
            return this.resolve(items);
        }
    }

    private resolveUncached(schema: SwaggerDefinition): string {
        if (schema.$ref) {
            return this.resolveReference(schema.$ref);
        }

        if (schema.enum) {
            return schema.enum
                .map((value) => (typeof value === "string" ? `'${escapeString(value)}'` : String(value)))
                .join(" | ");
        }

        if (schema.allOf) {
            return (
                schema.allOf
                    .map((def) => this.resolve(def))
                    .filter((type) => type !== "any" && type !== "unknown")
                    .join(" & ") || "Record<string, unknown>"
            );
        }

        if (schema.oneOf) {
            return (
                schema.oneOf
                    .map((def) => this.resolve(def))
                    .filter(
                        (type, index, array) => type !== "any" && type !== "unknown" && array.indexOf(type) === index,
                    )
                    .join(" | ") || "unknown"
            );
        }

        if (schema.anyOf) {
            return (
                schema.anyOf
                    .map((def) => this.resolve(def))
                    .filter((type) => type !== "any" && type !== "unknown")
                    .join(" | ") || "unknown"
            );
        }

        if (schema.type === "array") {
            const itemType = schema.items ? this.getArrayItemType(schema.items) : "unknown";
            return `Array<${itemType}>`;
        }

        if (schema.type === "object") {
            if (schema.properties) {
                return this.generateInlineObjectType(schema);
            }

            if (schema.additionalProperties) {
                const valueType =
                    typeof schema.additionalProperties === "object"
                        ? this.resolve(schema.additionalProperties)
                        : "unknown";
                return `Record<string, ${valueType}>`;
            }

            return "Record<string, unknown>";
        }

        return this.mapSwaggerTypeToTypeScript(schema.type, schema.format, schema.nullable);
    }

    private generateInlineObjectType(definition: SwaggerDefinition): string {
        if (!definition.properties) {
            if (definition.additionalProperties) {
                const additionalType =
                    typeof definition.additionalProperties === "object"
                        ? this.resolve(definition.additionalProperties)
                        : "unknown";
                return `Record<string, ${additionalType}>`;
            }
            return "Record<string, unknown>";
        }

        const properties = Object.entries(definition.properties)
            .map(([key, prop]) => {
                const isRequired = definition.required?.includes(key) ?? false;
                const questionMark = isRequired ? "" : "?";
                const sanitizedKey = this.sanitizeName(key);
                return `${sanitizedKey}${questionMark}: ${this.resolve(prop)}`;
            })
            .join("; ");

        return `{ ${properties} }`;
    }

    private resolveReference(ref: string): string {
        const refName = ref.split("/").pop();
        if (!refName) {
            this.onWarning?.(`Invalid reference format: ${ref}`);
            return "unknown";
        }

        return this.pascalName(refName);
    }

    private mapSwaggerTypeToTypeScript(type?: string, format?: string, isNullable?: boolean): string {
        switch (type) {
            case "string":
                if (format === "date" || format === "date-time") {
                    const dateType = this.config.options.dateType === "Date" ? "Date" : "string";
                    return this.nullableType(dateType, isNullable);
                }
                if (format === "binary") return "Blob";
                if (format === "uuid") return "string";
                if (format === "email") return "string";
                if (format === "uri") return "string";
                return this.nullableType("string", isNullable);
            case "number":
            case "integer":
                return this.nullableType("number", isNullable);
            case "boolean":
                return this.nullableType("boolean", isNullable);
            case "array":
                return this.nullableType("any[]", isNullable);
            case "object":
                return this.nullableType("Record<string, unknown>", isNullable);
            case "null":
                return this.nullableType("null", isNullable);
            default:
                if (Array.isArray(type)) {
                    const types = type.map((t) => this.mapSwaggerTypeToTypeScript(t, undefined, isNullable));
                    return this.nullableType(types.join(" | "), isNullable);
                }
                return this.nullableType("any", isNullable);
        }
    }

    private nullableType(type: string, isNullable?: boolean): string {
        return type + (isNullable ? " | null" : "");
    }
}
