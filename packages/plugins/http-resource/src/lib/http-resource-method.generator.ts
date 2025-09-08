import {
    ClassDeclaration,
    MethodDeclarationOverloadStructure,
    OptionalKind,
    ParameterDeclarationStructure,
} from "ts-morph";
import { HttpResourceMethodBodyGenerator, HttpResourceMethodParamsGenerator } from "./http-resource-method";
import { camelCase, GeneratorConfig, getResponseType, pascalCase, PathInfo } from "@ng-openapi/shared";

export class HttpResourceMethodGenerator {
    private config: GeneratorConfig;
    private bodyGenerator: HttpResourceMethodBodyGenerator;
    private paramsGenerator: HttpResourceMethodParamsGenerator;
    #responseType = "unknown";

    constructor(config: GeneratorConfig) {
        this.config = config;
        this.bodyGenerator = new HttpResourceMethodBodyGenerator(config);
        this.paramsGenerator = new HttpResourceMethodParamsGenerator(config);
    }

    addResourceMethod(serviceClass: ClassDeclaration, operation: PathInfo): void {
        const methodName = this.generateMethodName(operation);
        const parameters = this.paramsGenerator.generateMethodParameters(operation);
        const returnType = this.generateReturnType(operation);
        const overloads = this.generateMethodOverload(parameters);
        const methodBody = this.bodyGenerator.generateMethodBody(operation);

        serviceClass.addMethod({
            name: methodName,
            parameters: parameters,
            returnType: returnType,
            statements: methodBody,
            overloads: overloads,
            docs: operation.description ? [operation.description] : undefined,
        });
    }

    generateMethodName(operation: PathInfo): string {
        if (this.config.options.customizeMethodName) {
            if (operation.operationId == null) {
                throw new Error(
                    `Operation ID is required for method name customization of operation: (${operation.method}) ${operation.path}`
                );
            }
            return this.config.options.customizeMethodName(operation.operationId);
        } else {
            return this.defaultNameGenerator(operation);
        }
    }

    defaultNameGenerator(operation: PathInfo): string {
        if (operation.operationId) {
            return camelCase(operation.operationId);
        }

        const method = pascalCase(operation.method.toLowerCase());
        const pathParts = operation.path.split("/").map((str) => {
            return pascalCase(pascalCase(str).replace(/[^a-zA-Z0-9]/g, ""));
        });
        const resource = pathParts.join("") || "resource";

        return `${camelCase(resource)}${method}`;
    }

    generateReturnType(operation: PathInfo): string {
        const response = operation.responses?.["200"] || operation.responses?.["201"] || operation.responses?.["204"];

        if (!response) {
            return "any";
        }

        this.#responseType = getResponseType(response, this.config);
        return `HttpResourceRef<${this.#responseType} | undefined>`;
    }

    generateMethodOverload(
        methodParams: OptionalKind<ParameterDeclarationStructure>[]
    ): OptionalKind<MethodDeclarationOverloadStructure>[] {
        const _methodParams = structuredClone(methodParams);
        const params = _methodParams.slice(0, -2).map((p) => {
            if (p.hasQuestionToken) {
                p.hasQuestionToken = false;
                p.type += " | undefined";
            }
            return p;
        });
        const optionParams = _methodParams.slice(-2).map((p) => {
            if (p.name === "resourceOptions") {
                p.hasQuestionToken = false;
                p.type += ` & { defaultValue: NoInfer<${this.#responseType}> }`;
            }
            return p;
        });
        return [
            {
                parameters: [...params, ...optionParams],
                returnType: `HttpResourceRef<${this.#responseType}>`,
            },
            {
                parameters: methodParams,
                returnType: `HttpResourceRef<${this.#responseType} | undefined>`,
            },
        ];
    }
}
