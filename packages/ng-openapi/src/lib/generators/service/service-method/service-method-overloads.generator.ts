import { MethodDeclarationOverloadStructure, OptionalKind, ParameterDeclarationStructure } from "ts-morph";
import { GeneratorConfig, PathInfo } from "../../../types";
import { getResponseType, getResponseTypeFromResponse } from "../service-method.generator";
import { generateApiParameters } from "./service-method-params.generator";

export function generateMethodOverloads(
    operation: PathInfo,
    config: GeneratorConfig
): OptionalKind<MethodDeclarationOverloadStructure>[] {
    const observeTypes: ("body" | "response" | "events")[] = ["body", "response", "events"];
    const overloads: OptionalKind<MethodDeclarationOverloadStructure>[] = [];

    // Determine the actual response type for this operation
    const responseType = determineResponseTypeForOperation(operation, config);

    observeTypes.forEach((observe) => {
        const overload = generateMethodOverload(operation, config, observe, responseType);
        if (overload) {
            overloads.push(overload);
        }
    });
    return overloads;
}

function determineResponseTypeForOperation(
    operation: PathInfo,
    config: GeneratorConfig
): "json" | "blob" | "arraybuffer" | "text" {
    const successResponses = ["200", "201", "202", "204", "206"];

    for (const statusCode of successResponses) {
        const response = operation.responses?.[statusCode];
        if (!response) continue;

        return getResponseTypeFromResponse(response, config);
    }

    return "json";
}

export function generateMethodOverload(
    operation: PathInfo,
    config: GeneratorConfig,
    observe: "body" | "response" | "events",
    responseType: "json" | "blob" | "arraybuffer" | "text"
): OptionalKind<MethodDeclarationOverloadStructure> {
    const responseDataType = generateOverloadResponseType(operation);
    const params = generateOverloadParameters(operation, config, observe, responseType);
    const returnType = generateOverloadReturnType(responseDataType, observe);
    return {
        parameters: params,
        returnType: returnType,
    };
}

export function generateOverloadParameters(
    operation: PathInfo,
    config: GeneratorConfig,
    observe: "body" | "response" | "events",
    responseType: "json" | "arraybuffer" | "blob" | "text"
): OptionalKind<ParameterDeclarationStructure>[] {
    const params = generateApiParameters(operation, config);
    const optionsParam = addOverloadOptionsParameter(observe, responseType);

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

export function addOverloadOptionsParameter(
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

export function generateOverloadResponseType(operation: PathInfo): string {
    const response = operation.responses?.["200"] || operation.responses?.["201"] || operation.responses?.["204"];

    if (!response) {
        return "any";
    }

    return getResponseType(response);
}

export function generateOverloadReturnType(responseType: string, observe: "body" | "response" | "events"): string {
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
