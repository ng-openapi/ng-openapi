// packages/plugins/zod/src/lib/zod-schema.generator.ts
import {
    SwaggerParser,
    GeneratorConfig,
    PathInfo,
    SwaggerDefinition,
    Parameter,
    RequestBody,
    SwaggerResponse,
    getTypeScriptType,
    camelCase,
    pascalCase
} from "@ng-openapi/shared";
import { ZodPluginOptions } from "./zod.generator";
import { ZodSchemaBuilder } from "./zod-schema.builder";

// Helper function to check if an object is a reference
function isReferenceObject(obj: any): obj is { $ref: string } {
    return obj && typeof obj === 'object' && '$ref' in obj;
}

export class ZodSchemaGenerator {
    private parser: SwaggerParser;
    private config: GeneratorConfig;
    private options: ZodPluginOptions;
    private schemaBuilder: ZodSchemaBuilder;

    constructor(parser: SwaggerParser, config: GeneratorConfig, options: ZodPluginOptions) {
        this.parser = parser;
        this.config = config;
        this.options = options;
        this.schemaBuilder = new ZodSchemaBuilder(parser, config, options);
    }

    async generateParametersValidator(
        parameters: Parameter[],
        operationName: string,
        suffix: string
    ): Promise<string> {
        const properties: Record<string, string> = {};
        const requiredFields: string[] = [];

        for (const param of parameters) {
            const schema = this.resolveParameterSchema(param);
            const zodSchema = await this.schemaBuilder.buildSchema(
                schema,
                camelCase(`${operationName}-${param.name}`),
                {
                    required: param.required || false,
                    coerce: this.shouldCoerce(param.in as 'path' | 'query' | 'header'),
                    strict: this.isStrict(param.in as 'path' | 'query' | 'header')
                }
            );

            properties[param.name] = zodSchema;
            if (param.required) {
                requiredFields.push(param.name);
            }
        }

        return this.generateObjectValidator(operationName + suffix, properties);
    }

    async generateBodyValidator(
        operation: PathInfo,
        operationName: string
    ): Promise<string[]> {
        const statements: string[] = [];

        if (!operation.requestBody) {
            return statements;
        }

        const requestBody = this.resolveRequestBody(operation.requestBody);
        const content = requestBody.content?.['application/json'] ||
            requestBody.content?.['multipart/form-data'];

        if (!content?.schema) {
            return statements;
        }

        const schema = this.resolveSchema(content.schema);
        const bodyName = `${operationName}Body`;

        // Check if it's an array
        if (schema.type === 'array' && schema.items) {
            const itemSchema = this.resolveSchema(schema.items as SwaggerDefinition);
            const itemValidator = await this.schemaBuilder.buildSchema(
                itemSchema,
                `${bodyName}Item`,
                {
                    required: true,
                    coerce: this.shouldCoerce('body'),
                    strict: this.isStrict('body')
                }
            );

            statements.push(`export const ${bodyName}Item = ${itemValidator};`);

            let arrayValidator = `z.array(${bodyName}Item)`;
            if (schema.minItems !== undefined) {
                arrayValidator += `.min(${schema.minItems})`;
            }
            if (schema.maxItems !== undefined) {
                arrayValidator += `.max(${schema.maxItems})`;
            }

            statements.push(`export const ${bodyName} = ${arrayValidator};`);
            statements.push(`export type ${pascalCase(bodyName)} = z.infer<typeof ${bodyName}>;`);
        } else {
            const validator = await this.schemaBuilder.buildSchema(
                schema,
                bodyName,
                {
                    required: true,
                    coerce: this.shouldCoerce('body'),
                    strict: this.isStrict('body'),
                    removeReadOnly: true
                }
            );

            statements.push(`export const ${bodyName} = ${validator};`);
            statements.push(`export type ${pascalCase(bodyName)} = z.infer<typeof ${bodyName}>;`);
        }

        return statements;
    }

    async generateResponseValidators(
        operation: PathInfo,
        operationName: string
    ): Promise<string[]> {
        const statements: string[] = [];

        if (!operation.responses) {
            return statements;
        }

        const responsesToGenerate = Object.entries(operation.responses);

        for (const [statusCode, response] of responsesToGenerate) {
            if (!response) continue;

            const resolvedResponse = this.resolveResponse(response);
            const content = resolvedResponse.content?.['application/json'];

            if (!content?.schema) continue;

            const schema = this.resolveSchema(content.schema);
            const responseName = statusCode
                ? `${operationName}${statusCode}Response`
                : `${operationName}Response`;

            // Check if it's an array
            if (schema.type === 'array' && schema.items) {
                const itemSchema = this.resolveSchema(schema.items as SwaggerDefinition);
                const itemValidator = await this.schemaBuilder.buildSchema(
                    itemSchema,
                    `${responseName}Item`,
                    {
                        required: true,
                        coerce: this.shouldCoerce('response'),
                        strict: this.isStrict('response')
                    }
                );

                statements.push(`export const ${responseName}Item = ${itemValidator};`);

                let arrayValidator = `z.array(${responseName}Item)`;
                if (schema.minItems !== undefined) {
                    arrayValidator += `.min(${schema.minItems})`;
                }
                if (schema.maxItems !== undefined) {
                    arrayValidator += `.max(${schema.maxItems})`;
                }

                statements.push(`export const ${responseName} = ${arrayValidator};`);
                statements.push(`export type ${pascalCase(responseName)} = z.infer<typeof ${responseName}>;`);
            } else {
                const validator = await this.schemaBuilder.buildSchema(
                    schema,
                    responseName,
                    {
                        required: true,
                        coerce: this.shouldCoerce('response'),
                        strict: this.isStrict('response')
                    }
                );

                statements.push(`export const ${responseName} = ${validator};`);
                statements.push(`export type ${pascalCase(responseName)} = z.infer<typeof ${responseName}>;`);
            }
        }

        return statements;
    }

    private generateObjectValidator(name: string, properties: Record<string, string>): string {
        if (Object.keys(properties).length === 0) {
            return `export const ${name} = z.object({});`;
        }

        const props = Object.entries(properties)
            .map(([key, schema]) => `  "${key}": ${schema}`)
            .join(',\n');

        const statements = [
            `export const ${name} = z.object({`,
            props,
            '});',
            `export type ${pascalCase(name)} = z.infer<typeof ${name}>;`
        ];

        return statements.join('\n');
    }

    private resolveParameterSchema(parameter: Parameter): SwaggerDefinition {
        if (parameter.schema) {
            return this.resolveSchema(parameter.schema);
        }

        // For OpenAPI 2.0, parameter properties are directly on the parameter
        return {
            type: parameter.type,
            format: parameter.format
        } as SwaggerDefinition;
    }

    private resolveRequestBody(requestBody: RequestBody): RequestBody {
        if (isReferenceObject(requestBody)) {
            const resolved = this.parser.resolveReference(requestBody.$ref);
            return resolved as RequestBody;
        }
        return requestBody;
    }

    private resolveResponse(response: SwaggerResponse): SwaggerResponse {
        if (isReferenceObject(response)) {
            const resolved = this.parser.resolveReference(response.$ref);
            return resolved as SwaggerResponse;
        }
        return response;
    }

    private resolveSchema(schema: SwaggerDefinition | { $ref: string }): SwaggerDefinition {
        if (isReferenceObject(schema)) {
            const resolved = this.parser.resolveReference(schema.$ref);
            return resolved as SwaggerDefinition;
        }
        return schema as SwaggerDefinition;
    }

    private shouldCoerce(type: 'path' | 'query' | 'header' | 'body' | 'response'): boolean {
        const typeMap = {
            'path': 'param',
            'query': 'query',
            'header': 'header',
            'body': 'body',
            'response': 'response'
        };

        const mappedType = typeMap[type] || type;

        if (typeof this.options.coerce === 'boolean') {
            return this.options.coerce;
        }
        return this.options.coerce?.[mappedType as keyof typeof this.options.coerce] || false;
    }

    private isStrict(type: 'path' | 'query' | 'header' | 'body' | 'response'): boolean {
        const typeMap = {
            'path': 'param',
            'query': 'query',
            'header': 'header',
            'body': 'body',
            'response': 'response'
        };

        const mappedType = typeMap[type] || type;

        if (typeof this.options.strict === 'boolean') {
            return this.options.strict;
        }
        return this.options.strict?.[mappedType as keyof typeof this.options.strict] || false;
    }
}