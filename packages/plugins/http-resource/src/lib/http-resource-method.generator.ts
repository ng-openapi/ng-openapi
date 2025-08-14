import { ClassDeclaration } from "ts-morph";
import { HttpResourceMethodBodyGenerator, HttpResourceMethodParamsGenerator } from "./http-resource-method";
import { camelCase, GeneratorConfig, getResponseType, pascalCase, PathInfo } from "@ng-openapi/shared";

export class HttpResourceMethodGenerator {
    private config: GeneratorConfig;
    private bodyGenerator: HttpResourceMethodBodyGenerator;
    private paramsGenerator: HttpResourceMethodParamsGenerator;

    constructor(config: GeneratorConfig) {
        this.config = config;
        this.bodyGenerator = new HttpResourceMethodBodyGenerator(config);
        this.paramsGenerator = new HttpResourceMethodParamsGenerator(config);
    }

    addResourceMethod(serviceClass: ClassDeclaration, operation: PathInfo): void {
        const methodName = this.generateMethodName(operation);
        const parameters = this.paramsGenerator.generateMethodParameters(operation);
        const returnType = this.generateReturnType(operation);
        const methodBody = this.bodyGenerator.generateMethodBody(operation);

        serviceClass.addMethod({
            name: methodName,
            parameters: parameters,
            returnType: returnType,
            statements: methodBody,
        });
    }

    generateMethodName(operation: PathInfo): string {
        if (operation.operationId) {
            return camelCase(operation.operationId);
        }

        const method = operation.method.toLowerCase();
        const pathParts = operation.path.split("/").filter((p) => p && !p.startsWith("{"));
        const resource = pathParts[pathParts.length - 1] || "resource";

        return `${method}${pascalCase(resource)}`;
    }

    generateReturnType(operation: PathInfo): string {
        const responseType = getResponseType(operation, this.config);
        return `HttpResourceRef<${responseType}>`;
    }
}
