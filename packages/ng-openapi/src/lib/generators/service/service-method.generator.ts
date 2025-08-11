import { ClassDeclaration } from "ts-morph";
import {
    ServiceMethodBodyGenerator,
    ServiceMethodOverloadsGenerator,
    ServiceMethodParamsGenerator,
} from "./service-method";
import { GeneratorConfig, PathInfo } from "@ng-openapi/shared";
import { camelCase, pascalCase } from "@ng-openapi/shared";

export class ServiceMethodGenerator {
    private config: GeneratorConfig;
    private bodyGenerator: ServiceMethodBodyGenerator;
    private overloadsGenerator: ServiceMethodOverloadsGenerator;
    private paramsGenerator: ServiceMethodParamsGenerator;

    constructor(config: GeneratorConfig) {
        this.config = config;
        this.bodyGenerator = new ServiceMethodBodyGenerator(config);
        this.overloadsGenerator = new ServiceMethodOverloadsGenerator(config);
        this.paramsGenerator = new ServiceMethodParamsGenerator(config);
    }

    addServiceMethod(serviceClass: ClassDeclaration, operation: PathInfo): void {
        const methodName = this.generateMethodName(operation);
        const parameters = this.paramsGenerator.generateMethodParameters(operation);
        const returnType = this.generateReturnType();
        const methodBody = this.bodyGenerator.generateMethodBody(operation);
        const methodOverLoads = this.overloadsGenerator.generateMethodOverloads(operation);

        serviceClass.addMethod({
            name: methodName,
            parameters: parameters,
            returnType: returnType,
            statements: methodBody,
            overloads: methodOverLoads,
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

    generateReturnType(): string {
        return "Observable<any>";
    }

    defaultNameGenerator(operation: PathInfo): string {
        if (operation.operationId) {
            return camelCase(operation.operationId);
        }

        const method = operation.method.toLowerCase();
        const pathParts = operation.path.split("/").filter((p) => p && !p.startsWith("{"));
        const resource = pathParts[pathParts.length - 1] || "resource";

        return `${method}${pascalCase(resource)}`;
    }
}
