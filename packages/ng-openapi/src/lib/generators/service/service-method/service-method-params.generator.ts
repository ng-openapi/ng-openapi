import { OptionalKind, ParameterDeclarationStructure } from "ts-morph";
import {
    camelCase,
    CONTENT_TYPES,
    GeneratorConfig,
    getTypeScriptType,
    isDataTypeInterface,
    PathInfo,
    SwaggerDefinition,
    SwaggerParser,
} from "@ng-openapi/shared";

export class ServiceMethodParamsGenerator {
    private config: GeneratorConfig;
    private parser: SwaggerParser;

    constructor(config: GeneratorConfig, parser: SwaggerParser) {
        this.config = config;
        this.parser = parser;
    }

    generateMethodParameters(operation: PathInfo): OptionalKind<ParameterDeclarationStructure>[] {
        const params = this.generateApiParameters(operation);
        const optionsParam = this.addOptionsParameter(params);

        // Combine all parameters
        const combined = [...params, ...optionsParam];

        const seen = new Set<string>();
        const uniqueParams: OptionalKind<ParameterDeclarationStructure>[] = [];

        for (const param of combined) {
            if (!seen.has(param.name)) {
                seen.add(param.name);
                uniqueParams.push(param);
            }
        }

        return uniqueParams;
    }

    generateApiParameters(operation: PathInfo): OptionalKind<ParameterDeclarationStructure>[] {
        const params: OptionalKind<ParameterDeclarationStructure>[] = [];

        // Path parameters
        const pathParams = operation.parameters?.filter((p) => p.in === "path") || [];
        pathParams.forEach((param) => {
            params.push({
                name: param.name,
                type: getTypeScriptType(param.schema || param, this.config),
                hasQuestionToken: !param.required,
            });
        });

        const requestBody = operation.requestBody;

        if (requestBody) {
            const formDataContent = requestBody.content?.[CONTENT_TYPES.MULTIPART];
            const urlEncodedContent = requestBody.content?.[CONTENT_TYPES.FORM_URLENCODED];
            const jsonContent = requestBody.content?.[CONTENT_TYPES.JSON];

            // form parameters
            if (formDataContent) {
                const formParams = this.convertObjectToSingleParams(formDataContent.schema);
                params.push(...formParams);
            }

            // x-www-form-urlencoded parameters
            if (!jsonContent && urlEncodedContent) {
                const formParams = this.convertObjectToSingleParams(urlEncodedContent.schema);
                params.push(...formParams);
            }

            // body parameters
            if (jsonContent && !formDataContent) {
                const bodyType = this.getRequestBodyType(requestBody);
                const isInterface = isDataTypeInterface(bodyType);
                params.push({
                    name: isInterface ? camelCase(bodyType) : "requestBody",
                    type: bodyType,
                    hasQuestionToken: !requestBody.required,
                });
            }
        }

        // Query parameters
        const queryParams = operation.parameters?.filter((p) => p.in === "query") || [];
        queryParams.forEach((param) => {
            params.push({
                name: param.name,
                type: getTypeScriptType(param.schema || param, this.config),
                hasQuestionToken: !param.required,
            });
        });

        return params.sort((a, b) => Number(a.hasQuestionToken) - Number(b.hasQuestionToken));
    }

    addOptionsParameter(
        params: OptionalKind<ParameterDeclarationStructure>[]
    ): OptionalKind<ParameterDeclarationStructure>[] {
        return [
            {
                name: "observe",
                type: `'body' | 'events' | 'response'`,
                hasQuestionToken: true,
            },
            {
                name: "options",
                type: this.getHttpRequestOptionsParameter(params),
                hasQuestionToken: true,
            },
        ];
    }

    private getHttpRequestOptionsParameter(params: OptionalKind<ParameterDeclarationStructure>[]): string {
        const { response } = this.config.options.validation ?? {};
        // const parseRequest = request ? generateParseRequestTypeParams(params) : "";

        const additionalTypeParameters = [];
        if (response) {
            additionalTypeParameters.push("any");
        }
        // if (request && parseRequest) {
        //     additionalTypeParameters.push(parseRequest);
        // }

        if (additionalTypeParameters.length === 0) {
            return `RequestOptions<'arraybuffer' | 'blob' | 'json' | 'text'>`;
        }
        return `RequestOptions<'arraybuffer' | 'blob' | 'json' | 'text', ${additionalTypeParameters.join(", ")}>`;
    }

    private getRequestBodyType(requestBody: any): string {
        const content = requestBody.content || {};
        const jsonContent = content[CONTENT_TYPES.JSON];

        if (jsonContent?.schema) {
            return getTypeScriptType(jsonContent.schema, this.config, jsonContent.schema.nullable);
        }

        return "any";
    }

    private convertObjectToSingleParams(schema?: SwaggerDefinition): OptionalKind<ParameterDeclarationStructure>[] {
        const params: OptionalKind<ParameterDeclarationStructure>[] = [];
        let resolvedSchema = schema;

        if (schema?.$ref) {
            resolvedSchema = this.parser.resolveReference(schema.$ref);
        }

        // For multipart/form-data, add individual parameters for each field
        Object.entries(resolvedSchema?.properties ?? {}).forEach(([key, value]: [string, any]) => {
            params.push({
                name: key,
                type: getTypeScriptType(value, this.config, value.nullable),
                hasQuestionToken: !resolvedSchema?.required?.includes(key),
            });
        });

        return params;
    }
}
