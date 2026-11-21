import { OptionalKind, ParameterDeclarationStructure } from "ts-morph";
import {
    ArgumentNames,
    MethodGenOptions,
    getRequestBodyType,
    getTypeScriptType,
    NormalizedOperation,
    resolveArgumentNames,
    SERVICE_ARGUMENT_PROFILE,
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
        const argumentNames = resolveArgumentNames(operation, this.config, SERVICE_ARGUMENT_PROFILE);

        // Path parameters
        operation.pathParams.forEach((param) => {
            params.push({
                name: argumentNames.of(param.name),
                // Swagger 2.0 puts type/format/enum on the parameter itself; the
                // spread (vs passing param directly) is needed because Parameter
                // lacks TypeSchema's index signature — a fresh literal satisfies it.
                type: getTypeScriptType(param.schema || { ...param }, this.config),
                hasQuestionToken: !param.required,
            });
        });

        const requestBody = operation.requestBody;

        // form parameters
        if (operation.bodyKind === "multipart") {
            params.push(...this.convertObjectToSingleParams(operation.formDataSchema, argumentNames));
        }

        // x-www-form-urlencoded parameters
        if (operation.bodyKind === "urlencoded") {
            params.push(...this.convertObjectToSingleParams(operation.urlEncodedSchema, argumentNames));
        }

        // body parameters. The name comes from the resolver, not from the
        // body type directly: it shares the method scope with the query
        // params, so a `request_body` query param must not land on it.
        if (operation.bodyKind === "json" && requestBody && argumentNames.body) {
            params.push({
                name: argumentNames.body,
                type: getRequestBodyType(requestBody, this.config),
                hasQuestionToken: !requestBody.required,
            });
        }

        // Query parameters
        operation.queryParams.forEach((param) => {
            params.push({
                name: argumentNames.of(param.name),
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

    /** `schema` arrives ref-resolved from the normalizer (formData/urlEncoded schema). */
    private convertObjectToSingleParams(
        schema: SwaggerDefinition | undefined,
        argumentNames: ArgumentNames,
    ): OptionalKind<ParameterDeclarationStructure>[] {
        const params: OptionalKind<ParameterDeclarationStructure>[] = [];

        // For multipart/form-data, add individual parameters for each field.
        // A field name is a wire name, not an identifier — `user-name` is a
        // legal form field and used to reach the signature verbatim (#125).
        Object.entries(schema?.properties ?? {}).forEach(([key, value]) => {
            params.push({
                name: argumentNames.of(key),
                type: getTypeScriptType(value, this.config, value.nullable),
                hasQuestionToken: !schema?.required?.includes(key),
            });
        });

        return params;
    }
}
