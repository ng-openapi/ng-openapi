import { MethodDeclarationOverloadStructure, OptionalKind, ParameterDeclarationStructure } from "ts-morph";
import { GeneratorConfig, getResponseType, getResponseTypeFromResponse, PathInfo } from "@ng-openapi/shared";
import { ServiceMethodParamsGenerator } from "./service-method-params.generator";

export class ServiceMethodOverloadsGenerator {
    private config: GeneratorConfig;
    private paramsGenerator: ServiceMethodParamsGenerator;

    constructor(config: GeneratorConfig) {
        this.config = config;
        this.paramsGenerator = new ServiceMethodParamsGenerator(config);
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

        return getResponseType(response, this.config);
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
