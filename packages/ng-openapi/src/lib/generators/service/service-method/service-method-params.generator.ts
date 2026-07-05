import { OptionalKind, ParameterDeclarationStructure } from "ts-morph";
import {
    camelCase,
    CONTENT_TYPES,
    MethodGenOptions,
    getTypeScriptType,
    isDataTypeInterface,
    NormalizedOperation,
    RequestBody,
    SwaggerDefinition,
} from "@ng-openapi/shared";
import { ServiceMethodRequestObjectGenerator } from "./service-method-request-object.generator";

export class ServiceMethodParamsGenerator {
    private config: MethodGenOptions;

    constructor(config: MethodGenOptions) {
        this.config = config;
    }

    generateMethodParameters(operation: NormalizedOperation): OptionalKind<ParameterDeclarationStructure>[] {
        const params = this.generateApiParameters(operation);
        const optionsParam = this.addOptionsParameter(params);

        // Combine all parameters
        return ServiceMethodRequestObjectGenerator.dedupe([...params, ...optionsParam]);
    }

    generateApiParameters(operation: NormalizedOperation): OptionalKind<ParameterDeclarationStructure>[] {
        const params: OptionalKind<ParameterDeclarationStructure>[] = [];

        // Path parameters
        operation.pathParams.forEach((param) => {
            params.push({
                name: camelCase(param.name),
                // Swagger 2.0 puts type/format/enum on the parameter itself; the
                // spread (vs passing param directly) is needed because Parameter
                // lacks TypeSchema's index signature — a fresh literal satisfies it.
                type: getTypeScriptType(param.schema || { ...param }, this.config),
                hasQuestionToken: !param.required,
            });
        });

        const requestBody = operation.requestBody;

        if (requestBody) {
            const jsonContent = requestBody.content?.[CONTENT_TYPES.JSON];

            // form parameters
            if (operation.isMultipart) {
                params.push(...this.convertObjectToSingleParams(operation.formDataSchema));
            }

            // x-www-form-urlencoded parameters
            if (operation.isUrlEncoded) {
                params.push(...this.convertObjectToSingleParams(operation.urlEncodedSchema));
            }

            // body parameters
            if (jsonContent && !operation.isMultipart) {
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
        operation.queryParams.forEach((param) => {
            params.push({
                name: camelCase(param.name),
                type: getTypeScriptType(param.schema || { ...param }, this.config),
                hasQuestionToken: !param.required,
            });
        });

        return params.sort((a, b) => Number(a.hasQuestionToken) - Number(b.hasQuestionToken));
    }

    addOptionsParameter(
        params: OptionalKind<ParameterDeclarationStructure>[],
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

    private getRequestBodyType(requestBody: RequestBody): string {
        const content = requestBody.content || {};
        const jsonContent = content[CONTENT_TYPES.JSON];

        if (jsonContent?.schema) {
            return getTypeScriptType(jsonContent.schema, this.config, jsonContent.schema.nullable);
        }

        return "any";
    }

    /** `schema` arrives ref-resolved from the normalizer (formData/urlEncoded schema). */
    private convertObjectToSingleParams(schema?: SwaggerDefinition): OptionalKind<ParameterDeclarationStructure>[] {
        const params: OptionalKind<ParameterDeclarationStructure>[] = [];

        // For multipart/form-data, add individual parameters for each field
        Object.entries(schema?.properties ?? {}).forEach(([key, value]) => {
            params.push({
                name: key,
                type: getTypeScriptType(value, this.config, value.nullable),
                hasQuestionToken: !schema?.required?.includes(key),
            });
        });

        return params;
    }
}
