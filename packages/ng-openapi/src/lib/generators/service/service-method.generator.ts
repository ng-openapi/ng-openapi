import { ClassDeclaration, OptionalKind, ParameterDeclarationStructure } from "ts-morph";
import {
    RequestObjectEntry,
    ServiceMethodBodyGenerator,
    ServiceMethodOverloadsGenerator,
    ServiceMethodParamsGenerator,
    ServiceMethodRequestObjectGenerator,
} from "./service-method";
import { camelCase, MethodGenOptions, NormalizedOperation, pascalCase } from "@ng-openapi/shared";

export class ServiceMethodGenerator {
    private config: MethodGenOptions;
    private bodyGenerator: ServiceMethodBodyGenerator;
    private overloadsGenerator: ServiceMethodOverloadsGenerator;
    private paramsGenerator: ServiceMethodParamsGenerator;

    constructor(config: MethodGenOptions) {
        this.config = config;
        this.bodyGenerator = new ServiceMethodBodyGenerator(config);
        this.overloadsGenerator = new ServiceMethodOverloadsGenerator(config);
        this.paramsGenerator = new ServiceMethodParamsGenerator(config);
    }

    addServiceMethod(
        serviceClass: ClassDeclaration,
        operation: NormalizedOperation,
        requestObject?: RequestObjectEntry,
    ): void {
        const methodName = this.generateMethodName(operation);
        const parameters = requestObject
            ? this.generateSingleRequestParameters(requestObject)
            : this.paramsGenerator.generateMethodParameters(operation);
        const returnType = this.generateReturnType();
        let methodBody = this.bodyGenerator.generateMethodBody(operation);
        if (requestObject) {
            methodBody = `${ServiceMethodRequestObjectGenerator.toDestructureStatement(requestObject)}\n${methodBody}`;
        }
        const methodOverLoads = this.overloadsGenerator.generateMethodOverloads(operation, requestObject);

        serviceClass.addMethod({
            name: methodName,
            parameters: parameters,
            returnType: returnType,
            statements: methodBody,
            overloads: methodOverLoads,
            docs: operation.description ? [operation.description] : undefined,
        });
    }

    generateSingleRequestParameters(requestObject: RequestObjectEntry): OptionalKind<ParameterDeclarationStructure>[] {
        return [
            ServiceMethodRequestObjectGenerator.toRequestParameter(requestObject),
            ...this.paramsGenerator.addOptionsParameter(requestObject.parameters),
        ];
    }

    generateMethodName(operation: NormalizedOperation): string {
        if (this.config.options.customizeMethodName) {
            if (operation.operationId == null) {
                throw new Error(
                    `Operation ID is required for method name customization of operation: (${operation.method}) ${operation.path}`,
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

    defaultNameGenerator(operation: NormalizedOperation): string {
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
}
