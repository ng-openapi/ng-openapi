import { MethodDeclarationOverloadStructure, OptionalKind, ParameterDeclarationStructure } from "ts-morph";
import {
    GeneratorConfig,
    getResponseType,
    getResponseTypeFromResponse,
    PathInfo,
    SwaggerParser,
} from "@ng-openapi/shared";
import { ServiceMethodParamsGenerator } from "./service-method-params.generator";
import { RequestObjectEntry, ServiceMethodRequestObjectGenerator } from "./service-method-request-object.generator";

export class ServiceMethodOverloadsGenerator {
    private config: GeneratorConfig;
    private paramsGenerator: ServiceMethodParamsGenerator;
    private responseDataType = "any";

    constructor(config: GeneratorConfig, parser: SwaggerParser) {
        this.config = config;
        this.paramsGenerator = new ServiceMethodParamsGenerator(config, parser);
    }

    generateMethodOverloads(
        operation: PathInfo,
        requestObject?: RequestObjectEntry,
    ): OptionalKind<MethodDeclarationOverloadStructure>[] {
        const observeTypes: ("body" | "response" | "events")[] = ["body", "response", "events"];
        const overloads: OptionalKind<MethodDeclarationOverloadStructure>[] = [];

        // Determine the actual response type for this operation
        const responseType = this.determineResponseTypeForOperation(operation);

        observeTypes.forEach((observe) => {
            const overload = this.generateMethodOverload(operation, observe, responseType, requestObject);
            if (overload) {
                overloads.push(overload);
            }
        });
        return overloads;
    }

    generateMethodOverload(
        operation: PathInfo,
        observe: "body" | "response" | "events",
        responseType: "json" | "blob" | "arraybuffer" | "text",
        requestObject?: RequestObjectEntry,
    ): OptionalKind<MethodDeclarationOverloadStructure> {
        this.responseDataType = this.generateOverloadResponseType(operation);
        const params = requestObject
            ? this.generateSingleRequestOverloadParameters(requestObject, observe, responseType)
            : this.generateOverloadParameters(operation, observe, responseType);
        const returnType = this.generateOverloadReturnType(observe);
        return {
            parameters: params,
            returnType: returnType,
        };
    }

    generateSingleRequestOverloadParameters(
        requestObject: RequestObjectEntry,
        observe: "body" | "response" | "events",
        responseType: "json" | "arraybuffer" | "blob" | "text",
    ): OptionalKind<ParameterDeclarationStructure>[] {
        return [
            ServiceMethodRequestObjectGenerator.toRequestParameter(requestObject),
            ...this.addOverloadOptionsParameter(requestObject.parameters, observe, responseType),
        ];
    }

    generateOverloadParameters(
        operation: PathInfo,
        observe: "body" | "response" | "events",
        responseType: "json" | "arraybuffer" | "blob" | "text",
    ): OptionalKind<ParameterDeclarationStructure>[] {
        const params = this.paramsGenerator.generateApiParameters(operation);
        const optionsParam = this.addOverloadOptionsParameter(params, observe, responseType);

        // Combine all parameters
        return ServiceMethodRequestObjectGenerator.dedupe([...params, ...optionsParam]);
    }

    addOverloadOptionsParameter(
        params: OptionalKind<ParameterDeclarationStructure>[],
        observe: "body" | "response" | "events",
        responseType: "json" | "arraybuffer" | "blob" | "text",
    ): OptionalKind<ParameterDeclarationStructure>[] {
        return [
            {
                name: "observe",
                type: `'${observe}'`,
                hasQuestionToken: true,
            },
            {
                name: "options",
                type: this.getHttpRequestOptionsParameter(params, responseType),
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

    generateOverloadReturnType(observe: "body" | "response" | "events"): string {
        switch (observe) {
            case "body":
                return `Observable<${this.responseDataType}>`;
            case "response":
                return `Observable<HttpResponse<${this.responseDataType}>>`;
            case "events":
                return `Observable<HttpEvent<${this.responseDataType}>>`;
            default:
                throw new Error(`Unsupported observe type: ${observe}`);
        }
    }

    private getHttpRequestOptionsParameter(
        params: OptionalKind<ParameterDeclarationStructure>[],
        responseType: "json" | "arraybuffer" | "blob" | "text",
    ): string {
        const { response } = this.config.options.validation ?? {};
        // const parseRequest = request ? generateParseRequestTypeParams(params) : "";

        const additionalTypeParameters = [];
        if (response) {
            additionalTypeParameters.push(this.responseDataType);
        }
        // if (request && parseRequest) {
        //     additionalTypeParameters.push(parseRequest);
        // }

        if (additionalTypeParameters.length === 0) {
            return `RequestOptions<'${responseType}'>`;
        }
        return `RequestOptions<'${responseType}', ${additionalTypeParameters.join(", ")}>`;
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
