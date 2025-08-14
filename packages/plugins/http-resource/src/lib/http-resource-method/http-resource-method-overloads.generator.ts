import { MethodDeclarationOverloadStructure, OptionalKind, ParameterDeclarationStructure } from "ts-morph";
import {
    GeneratorConfig,
    getResponseTypeFromResponse,
    getTypeScriptType,
    inferResponseTypeFromContentType,
    PathInfo,
    SwaggerResponse,
} from "@ng-openapi/shared";
import { HttpResourceMethodParamsGenerator } from "./http-resource-method-params.generator";

export class HttpResourceMethodOverloadsGenerator {
    private config: GeneratorConfig;
    private paramsGenerator: HttpResourceMethodParamsGenerator;

    constructor(config: GeneratorConfig) {
        this.config = config;
        this.paramsGenerator = new HttpResourceMethodParamsGenerator(config);
    }

    generateMethodOverloads(operation: PathInfo): OptionalKind<MethodDeclarationOverloadStructure>[] {
        const observeTypes: ("body" | "response" | "events")[] = ["body", "response", "events"];
        const overloads: OptionalKind<MethodDeclarationOverloadStructure>[] = [];

        // Determine the actual response type for this operation
        const responseType = this.determineResponseTypeForOperation(operation);

        observeTypes.forEach((observe) => {
            const overload = this.generateMethodOverload(operation, observe, responseType);
            if (overload) {
                overloads.push(overload);
            }
        });
        return overloads;
    }

    generateMethodOverload(
        operation: PathInfo,
        observe: "body" | "response" | "events",
        responseType: "json" | "blob" | "arraybuffer" | "text"
    ): OptionalKind<MethodDeclarationOverloadStructure> {
        const responseDataType = this.generateOverloadResponseType(operation);
        const params = this.generateOverloadParameters(operation, observe, responseType);
        const returnType = this.generateOverloadReturnType(responseDataType, observe);
        return {
            parameters: params,
            returnType: returnType,
        };
    }

    generateOverloadParameters(
        operation: PathInfo,
        observe: "body" | "response" | "events",
        responseType: "json" | "arraybuffer" | "blob" | "text"
    ): OptionalKind<ParameterDeclarationStructure>[] {
        const params = this.paramsGenerator.generateApiParameters(operation);
        const optionsParam = this.addOverloadOptionsParameter(observe, responseType);

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

    addOverloadOptionsParameter(
        observe: "body" | "response" | "events",
        responseType: "json" | "arraybuffer" | "blob" | "text"
    ): OptionalKind<ParameterDeclarationStructure>[] {
        return [
            {
                name: "observe",
                type: `'${observe}'`,
                hasQuestionToken: true,
            },
            {
                name: "options",
                type: `{ headers?: HttpHeaders; reportProgress?: boolean; responseType?: '${responseType}'; withCredentials?: boolean; context?: HttpContext; }`,
                hasQuestionToken: true,
            },
        ];
    }

    generateOverloadResponseType(operation: PathInfo): string {
        const response = operation.responses?.["200"] || operation.responses?.["201"] || operation.responses?.["204"];

        if (!response) {
            return "any";
        }

        return this.getResponseType(response);
    }

    generateOverloadReturnType(responseType: string, observe: "body" | "response" | "events"): string {
        switch (observe) {
            case "body":
                return `Observable<${responseType}>`;
            case "response":
                return `Observable<HttpResponse<${responseType}>>`;
            case "events":
                return `Observable<HttpEvent<${responseType}>>`;
            default:
                throw new Error(`Unsupported observe type: ${observe}`);
        }
    }

    getResponseType(response: SwaggerResponse): string {
        const responseType = getResponseTypeFromResponse(response);

        // Map response types to TypeScript types
        switch (responseType) {
            case "blob":
                return "Blob";
            case "arraybuffer":
                return "ArrayBuffer";
            case "text":
                return "string";
            case "json": {
                // For JSON, check if we have a schema to get specific type
                const content = response.content || {};
                for (const [contentType, mediaType] of Object.entries(content)) {
                    if (inferResponseTypeFromContentType(contentType) === "json" && mediaType?.schema) {
                        return getTypeScriptType(mediaType.schema, this.config, mediaType.schema.nullable);
                    }
                }
                return "any";
            }
            default:
                return "any";
        }
    }

    private determineResponseTypeForOperation(operation: PathInfo): "json" | "blob" | "arraybuffer" | "text" {
        const successResponses = ["200", "201", "202", "204", "206"];

        for (const statusCode of successResponses) {
            const response = operation.responses?.[statusCode];
            if (!response) continue;

            return getResponseTypeFromResponse(response);
        }

        return "json";
    }
}
