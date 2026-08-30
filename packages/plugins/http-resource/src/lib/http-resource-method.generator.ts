import {
    ClassDeclaration,
    MethodDeclarationOverloadStructure,
    OptionalKind,
    ParameterDeclarationStructure,
} from "ts-morph";
import { HttpResourceMethodBodyGenerator, HttpResourceMethodParamsGenerator } from "./http-resource-method";
import { emitDocs, getOperationMethodName, getResponseType, MethodGenOptions, NormalizedOperation } from "@ng-openapi/shared";

export class HttpResourceMethodGenerator {
    private config: MethodGenOptions;
    private bodyGenerator: HttpResourceMethodBodyGenerator;
    private paramsGenerator: HttpResourceMethodParamsGenerator;
    #responseType = "unknown";

    constructor(config: MethodGenOptions) {
        this.config = config;
        this.bodyGenerator = new HttpResourceMethodBodyGenerator(config);
        this.paramsGenerator = new HttpResourceMethodParamsGenerator(config);
    }

    addResourceMethod(serviceClass: ClassDeclaration, operation: NormalizedOperation): void {
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
            docs: emitDocs(operation.description),
        });
    }

    generateMethodName(operation: NormalizedOperation): string {
        return getOperationMethodName(operation, this.config);
    }

    generateReturnType(operation: NormalizedOperation): string {
        const response = operation.responses?.["200"] || operation.responses?.["201"] || operation.responses?.["204"];

        if (!response) {
            return "any";
        }

        this.#responseType = getResponseType(response, this.config);
        return `HttpResourceRef<${this.#responseType} | undefined>`;
    }

    generateMethodOverload(
        methodParams: OptionalKind<ParameterDeclarationStructure>[],
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
