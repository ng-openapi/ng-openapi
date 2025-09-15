import { GeneratorConfig, pascalCase, SwaggerDefinition, SwaggerParser } from "@ng-openapi/shared";
import { BuildOptions, ZodPluginOptions } from "./utils/types";
import { isReferenceObject } from "./utils/is-reference-object";

export class ZodSchemaBuilder {
    private parser: SwaggerParser;
    private config: GeneratorConfig;
    private options: ZodPluginOptions;

    constructor(parser: SwaggerParser, config: GeneratorConfig, options: ZodPluginOptions) {
        this.parser = parser;
        this.config = config;
        this.options = options;
    }

    async buildSchema(
        schema: SwaggerDefinition | { $ref: string },
        name: string,
        buildOptions: BuildOptions = {}
    ): Promise<string> {
        if (isReferenceObject(schema)) {
            const resolved = this.parser.resolveReference(schema.$ref);
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

        // Add description if present
        if (schema.description) {
            zodSchema = `${zodSchema}.describe('${this.escapeString(schema.description)}')`;
        }

        return zodSchema;
    }

    private async buildStringSchema(schema: SwaggerDefinition, buildOptions: BuildOptions): Promise<string> {
        // Handle enums
        if (schema.enum && schema.enum.every((v: any) => typeof v === "string")) {
            const enumValues = schema.enum.map((v: any) => `'${this.escapeString(v)}'`).join(", ");
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
        if (schema.minLength !== undefined) {
            zodString += `.min(${schema.minLength})`;
        }
        if (schema.maxLength !== undefined) {
            zodString += `.max(${schema.maxLength})`;
        }
        if (schema.pattern) {
            const escapedPattern = this.escapeRegex(schema.pattern);
            zodString += `.regex(new RegExp('${escapedPattern}'))`;
        }

        return zodString;
    }

    private buildNumberSchema(schema: SwaggerDefinition, buildOptions: BuildOptions): string {
        // Handle enums
        if (schema.enum) {
            if (schema.enum.length === 1) {
                return `z.literal(${schema.enum[0]})`;
            }
            const literals = schema.enum.map((v: any) => `z.literal(${v})`).join(", ");
            return `z.union([${literals}])`;
        }

        let zodNumber = buildOptions.coerce ? "z.coerce.number()" : "z.number()";

        // Add constraints
        if (schema.minimum !== undefined) {
            zodNumber += `.min(${schema.minimum})`;
        }
        if (schema.maximum !== undefined) {
            zodNumber += `.max(${schema.maximum})`;
        }
        if (schema.multipleOf !== undefined) {
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
            const literals = schema.enum.map((v: any) => `z.literal(${v})`).join(", ");
            return `z.union([${literals}])`;
        }

        return buildOptions.coerce ? "z.coerce.boolean()" : "z.boolean()";
    }

    private async buildArraySchema(
        schema: SwaggerDefinition,
        name: string,
        buildOptions: BuildOptions
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
        if (schema.minItems !== undefined) {
            zodArray += `.min(${schema.minItems})`;
        }
        if (schema.maxItems !== undefined) {
            zodArray += `.max(${schema.maxItems})`;
        }

        return zodArray;
    }

    private async buildObjectSchema(
        schema: SwaggerDefinition,
        name: string,
        buildOptions: BuildOptions
    ): Promise<string> {
        // Handle allOf, oneOf, anyOf
        if (schema.allOf) {
            const schemas = await Promise.all(
                schema.allOf.map((s) => this.buildSchema(s, name, { ...buildOptions, required: true }))
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
                    this.buildSchema(s, name, { ...buildOptions, required: true })
                )
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
                    { ...buildOptions, required: isRequired }
                );
                properties.push(`  "${propName}": ${propZodSchema}`);
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
        filtered.properties = Object.entries(schema.properties).reduce<Record<string, any>>((acc, [key, value]) => {
            const propSchema = value as SwaggerDefinition;
            if (!propSchema.readOnly) {
                acc[key] = value;
            }
            return acc;
        }, {});

        return filtered;
    }

    private resolveSchemaType(schema: SwaggerDefinition): string {
        if (Array.isArray(schema.type)) {
            const nonNullType = schema.type.find((t) => t !== "null");
            return nonNullType || "any";
        }
        return schema.type || "any";
    }

    private generateDefaultValue(defaultValue: any): string {
        if (typeof defaultValue === "string") {
            return `'${this.escapeString(defaultValue)}'`;
        }
        if (typeof defaultValue === "number" || typeof defaultValue === "boolean") {
            return String(defaultValue);
        }
        if (defaultValue === null) {
            return "null";
        }
        if (Array.isArray(defaultValue)) {
            const items = defaultValue.map((item) =>
                typeof item === "string" ? `'${this.escapeString(item)}'` : String(item)
            );
            return `[${items.join(", ")}]`;
        }
        if (typeof defaultValue === "object") {
            const entries = Object.entries(defaultValue)
                .map(([key, value]) => {
                    const val = typeof value === "string" ? `'${this.escapeString(value)}'` : String(value);
                    return `${key}: ${val}`;
                })
                .join(", ");
            return `{ ${entries} }`;
        }
        return "undefined";
    }

    private escapeString(str: string): string {
        return str.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n");
    }

    private escapeRegex(pattern: string): string {
        const cleaned = pattern.replace(/^\/|\/$/g, "");
        return cleaned.replace(/\\/g, "\\\\");
    }
}
