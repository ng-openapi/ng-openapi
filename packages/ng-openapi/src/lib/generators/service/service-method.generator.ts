import { ClassDeclaration, OptionalKind, ParameterDeclarationStructure } from "ts-morph";
import {
    RequestObjectEntry,
    ServiceMethodBodyGenerator,
    ServiceMethodOverloadsGenerator,
    ServiceMethodParamsGenerator,
    ServiceMethodRequestObjectGenerator,
} from "./service-method";
import { emitDocs, getOperationMethodName, MethodGenOptions, NormalizedOperation } from "@ng-openapi/shared";

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
            docs: emitDocs(operation.description),
        });
    }

    generateSingleRequestParameters(requestObject: RequestObjectEntry): OptionalKind<ParameterDeclarationStructure>[] {
        return [
            ServiceMethodRequestObjectGenerator.toRequestParameter(requestObject),
            ...this.paramsGenerator.addOptionsParameter(requestObject.parameters),
        ];
    }

    generateMethodName(operation: NormalizedOperation): string {
        return getOperationMethodName(operation, this.config);
    }

    generateReturnType(): string {
        return "Observable<any>";
    }
}
