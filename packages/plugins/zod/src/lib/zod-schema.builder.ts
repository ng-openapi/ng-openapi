import { emitObjectKey, escapeSingleQuoted, quoteLiteral, NormalizedSpec, pascalCase, SwaggerDefinition, TypeMappingConfig } from "@ng-openapi/shared";
import { BuildOptions, ZodPluginOptions } from "./utils/types";
import { isReferenceObject } from "./utils/is-reference-object";

export class ZodSchemaBuilder {
    private spec: NormalizedSpec;
    private config: TypeMappingConfig;
    private options: ZodPluginOptions;

    constructor(spec: NormalizedSpec, config: TypeMappingConfig, options: ZodPluginOptions) {
        this.spec = spec;
        this.config = config;
        this.options = options;
    }

    async buildSchema(
        schema: SwaggerDefinition | { $ref: string },
        name: string,
        buildOptions: BuildOptions = {},
    ): Promise<string> {
        if (isReferenceObject(schema)) {
            const resolved = this.spec.resolveReference(schema.$ref);
            return this.buildSchema(resolved as SwaggerDefinition, name, buildOptions);
        }

        // Handle readOnly removal for request bodies
        if (buildOptions.removeReadOnly && schema.properties) {
            schema = this.removeReadOnlyProperties(schema);
        }

        const type = this.resolveSchemaType(schema);
        const nullable = schema.nullable || (Array.isArray(schema.type) && schema.type.includes("null"));

        let zodSchema = "";

        switch (type) {
            case "string":
                zodSchema = await this.buildStringSchema(schema, buildOptions);
                break;
            case "number":
            case "integer":
                zodSchema = this.buildNumberSchema(schema, buildOptions);
                break;
            case "boolean":
                zodSchema = this.buildBooleanSchema(schema, buildOptions);
                break;
            case "array":
                zodSchema = await this.buildArraySchema(schema, name, buildOptions);
                break;
            case "object":
                zodSchema = await this.buildObjectSchema(schema, name, buildOptions);
                break;
            default:
                zodSchema = "z.any()";
        }

        // Handle nullable, optional, and default values
        if (!buildOptions.required && schema.default !== undefined) {
            const defaultValue = this.generateDefaultValue(schema.default);
            zodSchema = `${zodSchema}.default(${defaultValue})`;
        } else if (!buildOptions.required && nullable) {
            zodSchema = `${zodSchema}.nullish()`;
        } else if (nullable) {
            zodSchema = `${zodSchema}.nullable()`;
        } else if (!buildOptions.required) {
            zodSchema = `${zodSchema}.optional()`;
        }

        // Typed, not merely truthy: a description is untrusted JSON and nothing
        // schema-validates it, so `"description": 42` reaches here and threw a
        // raw TypeError out of the whole run.
        if (typeof schema.description === "string" && schema.description) {
            zodSchema = `${zodSchema}.describe('${escapeSingleQuoted(schema.description)}')`;
        }

        return zodSchema;
    }

    private async buildStringSchema(schema: SwaggerDefinition, buildOptions: BuildOptions): Promise<string> {
        // Handle enums
        if (schema.enum && schema.enum.every((v) => typeof v === "string")) {
            const enumValues = schema.enum.map((v) => emitEnumMember(v)).join(", ");
            return `z.enum([${enumValues}])`;
        }

        // Handle format
        if (schema.format) {
            switch (schema.format) {
                case "date":
                    if (this.config.options?.dateType === "Date") {
                        return buildOptions.coerce ? "z.coerce.date()" : "z.date()";
                    }
                    return buildOptions.coerce ? "z.coerce.string().date()" : "z.string().date()";
                case "date-time": {
                    if (this.config.options?.dateType === "Date") {
                        return buildOptions.coerce ? "z.coerce.date()" : "z.date()";
                    }
                    const datetimeOptions = this.options.dateTime ? `, ${JSON.stringify(this.options.dateTime)}` : "";
                    return buildOptions.coerce
                        ? `z.coerce.string().datetime(${datetimeOptions})`
                        : `z.string().datetime(${datetimeOptions})`;
                }
                case "time": {
                    const timeOptions = this.options.time ? `, ${JSON.stringify(this.options.time)}` : "";
                    return buildOptions.coerce
                        ? `z.coerce.string().time(${timeOptions})`
                        : `z.string().time(${timeOptions})`;
                }
                case "email":
                    return buildOptions.coerce ? "z.coerce.string().email()" : "z.string().email()";
                case "uri":
                case "url":
                case "hostname":
                    return buildOptions.coerce ? "z.coerce.string().url()" : "z.string().url()";
                case "uuid":
                    return buildOptions.coerce ? "z.coerce.string().uuid()" : "z.string().uuid()";
                case "binary":
                    return "z.instanceof(File)";
            }
        }

        let zodString = buildOptions.coerce ? "z.coerce.string()" : "z.string()";

        // Add constraints
        if (typeof schema.minLength === "number" && Number.isFinite(schema.minLength)) {
            zodString += `.min(${schema.minLength})`;
        }
        if (typeof schema.maxLength === "number" && Number.isFinite(schema.maxLength)) {
            zodString += `.max(${schema.maxLength})`;
        }
        if (typeof schema.pattern === "string") {
            // escapeRegex doubled backslashes but left quotes alone, so a
            // pattern containing one closed the literal.
            zodString += `.regex(new RegExp(${quoteLiteral(stripRegexDelimiters(schema.pattern))}))`;
        }

        return zodString;
    }

    private buildNumberSchema(schema: SwaggerDefinition, buildOptions: BuildOptions): string {
        // Handle enums
        if (schema.enum) {
            if (schema.enum.length === 1) {
                return `z.literal(${schema.enum[0]})`;
            }
            const literals = schema.enum.map((v) => `z.literal(${v})`).join(", ");
            return `z.union([${literals}])`;
        }

        let zodNumber = buildOptions.coerce ? "z.coerce.number()" : "z.number()";

        // Add constraints
        if (typeof schema.minimum === "number" && Number.isFinite(schema.minimum)) {
            zodNumber += `.min(${schema.minimum})`;
        }
        if (typeof schema.maximum === "number" && Number.isFinite(schema.maximum)) {
            zodNumber += `.max(${schema.maximum})`;
        }
        if (typeof schema.multipleOf === "number" && Number.isFinite(schema.multipleOf)) {
            zodNumber += `.multipleOf(${schema.multipleOf})`;
        }
        if (schema.type === "integer") {
            zodNumber += ".int()";
        }

        return zodNumber;
    }

    private buildBooleanSchema(schema: SwaggerDefinition, buildOptions: BuildOptions): string {
        if (schema.enum) {
            if (schema.enum.length === 1) {
                return `z.literal(${schema.enum[0]})`;
            }
            const literals = schema.enum.map((v) => `z.literal(${v})`).join(", ");
            return `z.union([${literals}])`;
        }

        return buildOptions.coerce ? "z.coerce.boolean()" : "z.boolean()";
    }

    private async buildArraySchema(
        schema: SwaggerDefinition,
        name: string,
        buildOptions: BuildOptions,
    ): Promise<string> {
        if (!schema.items) {
            return "z.array(z.any())";
        }

        const itemSchema = await this.buildSchema(schema.items as SwaggerDefinition | { $ref: string }, `${name}Item`, {
            ...buildOptions,
            required: true,
        });

        let zodArray = `z.array(${itemSchema})`;

        // Add constraints
        if (typeof schema.minItems === "number" && Number.isFinite(schema.minItems)) {
            zodArray += `.min(${schema.minItems})`;
        }
        if (typeof schema.maxItems === "number" && Number.isFinite(schema.maxItems)) {
            zodArray += `.max(${schema.maxItems})`;
        }

        return zodArray;
    }

    private async buildObjectSchema(
        schema: SwaggerDefinition,
        name: string,
        buildOptions: BuildOptions,
    ): Promise<string> {
        // Handle allOf, oneOf, anyOf
        if (schema.allOf) {
            const schemas = await Promise.all(
                schema.allOf.map((s) => this.buildSchema(s, name, { ...buildOptions, required: true })),
            );
            if (schemas.length === 1) {
                return schemas[0];
            }
            return schemas.reduce((acc, curr) => {
                if (!acc) return curr;
                return `${acc}.and(${curr})`;
            }, "");
        }

        if (schema.oneOf || schema.anyOf) {
            const schemas = await Promise.all(
                (schema.oneOf || schema.anyOf || []).map((s) =>
                    this.buildSchema(s, name, { ...buildOptions, required: true }),
                ),
            );
            if (schemas.length === 1) {
                return schemas[0];
            }
            return `z.union([${schemas.join(", ")}])`;
        }

        // Handle additionalProperties
        if (schema.additionalProperties) {
            const valueSchema =
                typeof schema.additionalProperties === "boolean"
                    ? "z.any()"
                    : await this.buildSchema(schema.additionalProperties, `${name}Value`, {
                          ...buildOptions,
                          required: true,
                      });
            return `z.record(z.string(), ${valueSchema})`;
        }

        // Handle properties
        if (schema.properties) {
            const properties: string[] = [];

            for (const [propName, propSchema] of Object.entries(schema.properties)) {
                const isRequired = schema.required?.includes(propName) || false;
                const propZodSchema = await this.buildSchema(
                    propSchema as SwaggerDefinition | { $ref: string },
                    `${name}${pascalCase(propName)}`,
                    { ...buildOptions, required: isRequired },
                );
                // Computed key: see zod-schema.generator.ts — a "__proto__"
                // property key mutates the prototype instead of being a key.
                properties.push(`  ${emitObjectKey(propName)}: ${propZodSchema}`);
            }

            let objectSchema = `z.object({\n${properties.join(",\n")}\n})`;

            if (buildOptions.strict) {
                objectSchema += ".strict()";
            }

            return objectSchema;
        }

        return "z.object({})";
    }

    private removeReadOnlyProperties(schema: SwaggerDefinition): SwaggerDefinition {
        if (!schema.properties) {
            return schema;
        }

        const filtered = { ...schema };
        filtered.properties = Object.entries(schema.properties).reduce<Record<string, SwaggerDefinition>>(
            (acc, [key, value]) => {
                if (!value.readOnly) {
                    acc[key] = value;
                }
                return acc;
            },
            {},
        );

        return filtered;
    }

    private resolveSchemaType(schema: SwaggerDefinition): string {
        if (Array.isArray(schema.type)) {
            const nonNullType = schema.type.find((t) => t !== "null");
            return nonNullType || "any";
        }
        return schema.type || "any";
    }

    /**
     * A default value as a zod `.default(...)` literal.
     *
     * Recursive, because a default is arbitrary JSON: object keys are spec text
     * and went into the literal raw (`{ my-key: 1 }` is a syntax error, a
     * `__proto__` key is the setter), and nested values went through
     * `String()`, which emits `[object Object]` into source. Not
     * `emitEnumMember`: that helper serializes an unknown value as a *string*
     * because a z.enum member must be one, which turned `default: ["x", null]`
     * into `['x', 'null']`.
     */
    private generateDefaultValue(defaultValue: unknown): string {
        if (typeof defaultValue === "string") {
            return quoteLiteral(defaultValue);
        }
        if (typeof defaultValue === "boolean" || (typeof defaultValue === "number" && Number.isFinite(defaultValue))) {
            return String(defaultValue);
        }
        if (defaultValue === null) {
            return "null";
        }
        if (Array.isArray(defaultValue)) {
            return `[${defaultValue.map((item) => this.generateDefaultValue(item)).join(", ")}]`;
        }
        if (typeof defaultValue === "object") {
            const entries = Object.entries(defaultValue)
                .map(([key, value]) => `${emitObjectKey(key)}: ${this.generateDefaultValue(value)}`)
                .join(", ");
            return `{ ${entries} }`;
        }
        return "undefined";
    }

}
/** Strips the `/.../` delimiters some specs wrap a pattern in. */
function stripRegexDelimiters(pattern: string): string {
    return pattern.replace(/^\/|\/$/g, "");
}

/**
 * An enum member as a zod literal.
 *
 * Enum values are untrusted JSON: `String(v)` of an object emitted
 * `[object Object]` straight into the source, and of a crafted string put the
 * value in expression position. Strings are quoted, finite numbers and booleans
 * pass through, and anything else becomes its JSON form as a string.
 */
function emitEnumMember(value: unknown): string {
    if (typeof value === "string") {
        return quoteLiteral(value);
    }
    if (typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) {
        return String(value);
    }
    return quoteLiteral(JSON.stringify(value) ?? String(value));
}
