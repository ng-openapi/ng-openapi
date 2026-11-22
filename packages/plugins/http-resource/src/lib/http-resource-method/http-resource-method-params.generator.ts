import { OptionalKind, ParameterDeclarationStructure } from "ts-morph";
import {
    ArgumentNames,
    resolveArgumentNames,
    RESOURCE_ARGUMENT_PROFILE,
    getBodyArgumentType,
    getQueryStringArgumentType,
    getResponseType,
    getTypeScriptType,
    MethodGenOptions,
    NormalizedOperation,
    SwaggerDefinition,
} from "@ng-openapi/shared";

export class HttpResourceMethodParamsGenerator {
    private config: MethodGenOptions;

    constructor(config: MethodGenOptions) {
        this.config = config;
    }

    generateMethodParameters(operation: NormalizedOperation): OptionalKind<ParameterDeclarationStructure>[] {
        const params = this.generateApiParameters(operation);
        const responseType = this.getApiReturnType(operation);
        const optionsParam = this.addOptionsParameter(responseType, operation);

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

    generateApiParameters(operation: NormalizedOperation): OptionalKind<ParameterDeclarationStructure>[] {
        const params: OptionalKind<ParameterDeclarationStructure>[] = [];
        const argumentNames = resolveArgumentNames(operation, this.config, RESOURCE_ARGUMENT_PROFILE);

        // Path parameters
        operation.pathParams.forEach((param) => {
            // Swagger 2.0 puts type/format/enum on the parameter itself; the
            // spread (vs passing param directly) is needed because Parameter
            // lacks TypeSchema's index signature — a fresh literal satisfies it.
            const paramType = getTypeScriptType(param.schema || { ...param }, this.config);
            params.push(this.signalParameter(argumentNames.of(param.name), paramType, !!param.required));
        });

        // Body arguments, in the order the core service declares them: form
        // fields, then the JSON body, each ahead of the query parameters.
        // Only a QUERY operation reaches here with a body — the normalizer
        // keeps one off every GET.
        if (operation.bodyKind === "multipart") {
            params.push(...this.formFieldParameters(operation.formDataSchema, argumentNames));
        }
        if (operation.bodyKind === "urlencoded") {
            params.push(...this.formFieldParameters(operation.urlEncodedSchema, argumentNames));
        }
        const bodyType = getBodyArgumentType(operation, this.config);
        if (bodyType !== undefined && argumentNames.body) {
            params.push(this.signalParameter(argumentNames.body, bodyType, !!operation.requestBody?.required));
        }

        // Query parameters
        operation.queryParams.forEach((param) => {
            const paramType = getTypeScriptType(param.schema || { ...param }, this.config);
            params.push(this.signalParameter(argumentNames.of(param.name), paramType, !!param.required));
        });

        // The one argument that is the whole query string (never next to the above)
        if (operation.queryString && argumentNames.queryString) {
            params.push(
                this.signalParameter(
                    argumentNames.queryString,
                    getQueryStringArgumentType(operation.queryString, this.config),
                    operation.queryString.required,
                ),
            );
        }

        return params.sort((a, b) => Number(a.hasQuestionToken) - Number(b.hasQuestionToken));
    }

    addOptionsParameter(
        responseType: string,
        operation: NormalizedOperation,
    ): OptionalKind<ParameterDeclarationStructure>[] {
        const rawDataType = this.getResourceRawDataType(responseType);
        // What the method computes itself is not the caller's to pass. `body`
        // joins the list only where the method binds one, so a resource
        // without a body keeps the signature it has always had.
        const computed = ["method", "url", "params", ...(operation.bodyKind ? ["body"] : [])];
        return [
            {
                name: "resourceOptions",
                type: `HttpResourceOptions<${responseType}, ${rawDataType}>`,
                hasQuestionToken: true,
            },
            {
                name: "requestOptions",
                type: `Omit<HttpResourceRequest, ${computed.map((key) => `"${key}"`).join(" | ")}>`,
                hasQuestionToken: true,
            },
        ];
    }

    /** Every resource argument may be a signal, so the resource re-fetches when it changes. */
    private signalParameter(
        name: string,
        type: string,
        required: boolean,
    ): OptionalKind<ParameterDeclarationStructure> {
        const signalType = required ? `Signal<${type}>` : `Signal<${type} | undefined>`;
        return { name, type: `${signalType} | ${type}`, hasQuestionToken: !required };
    }

    /**
     * One argument per form field. A field name is a wire name, not an
     * identifier, so it goes through the resolver (#125); `schema` arrives
     * ref-resolved from the normalizer.
     */
    private formFieldParameters(
        schema: SwaggerDefinition | undefined,
        argumentNames: ArgumentNames,
    ): OptionalKind<ParameterDeclarationStructure>[] {
        return Object.entries(schema?.properties ?? {}).map(([field, fieldSchema]) =>
            this.signalParameter(
                argumentNames.of(field),
                getTypeScriptType(fieldSchema, this.config, fieldSchema.nullable),
                !!schema?.required?.includes(field),
            ),
        );
    }

    private getApiReturnType(operation: NormalizedOperation): string {
        const successResponses = ["200", "201", "202", "204", "206"];

        for (const statusCode of successResponses) {
            const response = operation.responses?.[statusCode];
            if (!response) continue;

            return getResponseType(response, this.config);
        }

        return "unknown";
    }

    private getResourceRawDataType(responseType: string): "string" | "Blob" | "ArrayBuffer" | "unknown" {
        if (responseType !== "Blob" && responseType !== "ArrayBuffer" && responseType !== "string") {
            return "unknown";
        }
        return responseType as "string" | "Blob" | "ArrayBuffer";
    }
}
