import { OptionalKind, ParameterDeclarationStructure } from "ts-morph";
import { GeneratorConfig, getResponseType, getTypeScriptType, PathInfo } from "@ng-openapi/shared";

export class HttpResourceMethodParamsGenerator {
    private config: GeneratorConfig;

    constructor(config: GeneratorConfig) {
        this.config = config;
    }

    generateMethodParameters(operation: PathInfo): OptionalKind<ParameterDeclarationStructure>[] {
        const params = this.generateApiParameters(operation);
        const responseType = this.getApiReturnType(operation);
        const optionsParam = this.addOptionsParameter(responseType);

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
            const paramType = getTypeScriptType(param.schema || param, this.config);
            const signalParamType = param.required ? `Signal<${paramType}>` : `Signal<${paramType} | undefined>`;
            params.push({
                name: param.name,
                type: `${signalParamType} | ${paramType}`,
                hasQuestionToken: !param.required,
            });
        });

        // Query parameters
        const queryParams = operation.parameters?.filter((p) => p.in === "query") || [];
        queryParams.forEach((param) => {
            const paramType = getTypeScriptType(param.schema || param, this.config);
            const signalParamType = param.required ? `Signal<${paramType}>` : `Signal<${paramType} | undefined>`;
            params.push({
                name: param.name,
                type: `${signalParamType} | ${paramType}`,
                hasQuestionToken: !param.required,
            });
        });

        return params.sort((a, b) => Number(a.hasQuestionToken) - Number(b.hasQuestionToken));
    }

    addOptionsParameter(responseType: string): OptionalKind<ParameterDeclarationStructure>[] {
        const rawDataType = this.getResourceRawDataType(responseType);
        return [
            {
                name: "resourceOptions",
                type: `HttpResourceOptions<${responseType}, ${rawDataType}>`,
                hasQuestionToken: true,
            },
            {
                name: "requestOptions",
                type: `Omit<HttpResourceRequest, "method" | "url" | "params">`,
                hasQuestionToken: true,
            },
        ];
    }

    private getApiReturnType(operation: PathInfo): string {
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
