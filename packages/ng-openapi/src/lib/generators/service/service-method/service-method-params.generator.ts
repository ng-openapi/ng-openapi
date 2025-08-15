import { OptionalKind, ParameterDeclarationStructure } from "ts-morph";
import { camelCase, GeneratorConfig, getTypeScriptType, PathInfo } from "@ng-openapi/shared";

export class ServiceMethodParamsGenerator {
    private config: GeneratorConfig;

    constructor(config: GeneratorConfig) {
        this.config = config;
    }

    generateMethodParameters(operation: PathInfo): OptionalKind<ParameterDeclarationStructure>[] {
        const params = this.generateApiParameters(operation);
        const optionsParam = this.addOptionsParameter();

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

        // form parameters
        if (operation.requestBody && operation.requestBody?.content?.["multipart/form-data"]) {
            // For multipart/form-data, add individual parameters for each field
            Object.entries(operation.requestBody?.content?.["multipart/form-data"].schema?.properties ?? {}).forEach(
                ([key, value]: [string, any]) => {
                    params.push({
                        name: key,
                        type: getTypeScriptType(value, this.config, value.nullable),
                        hasQuestionToken: !value.required,
                    });
                }
            );
        }

        // body parameters
        if (operation.requestBody && operation.requestBody?.content?.["application/json"]) {
            const bodyType = this.getRequestBodyType(operation.requestBody);
            const isInterface = this.isDataTypeInterface(bodyType);
            params.push({
                name: isInterface ? camelCase(bodyType) : "requestBody",
                type: bodyType,
                hasQuestionToken: !operation.requestBody.required,
            });
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

    addOptionsParameter(): OptionalKind<ParameterDeclarationStructure>[] {
        return [
            {
                name: "observe",
                type: `'body' | 'events' | 'response'`,
                hasQuestionToken: true,
            },
            {
                name: "options",
                type: `{ headers?: HttpHeaders; params?: HttpParams; reportProgress?: boolean; responseType?: 'arraybuffer' | 'blob' | 'json' | 'text'; withCredentials?: boolean; context?: HttpContext; }`,
                hasQuestionToken: true,
            },
        ];
    }

    isDataTypeInterface(type: string): boolean {
        const invalidTypes = ["any", "File", "string", "number", "boolean", "object", "unknown", "[]", "Array"];
        return !invalidTypes.some((invalidType) => type.includes(invalidType));
    }

    private getRequestBodyType(requestBody: any): string {
        const content = requestBody.content || {};
        const jsonContent = content["application/json"];

        if (jsonContent?.schema) {
            return getTypeScriptType(jsonContent.schema, this.config, jsonContent.schema.nullable);
        }

        return "any";
    }
}
