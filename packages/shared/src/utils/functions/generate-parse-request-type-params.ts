import { OptionalKind, ParameterDeclarationStructure } from "ts-morph";
import { isDataTypeInterface } from "./is-data-type-interface";

/**
 * Type-parameter expression for request-validation overloads: the request
 * body's interface type (with `| undefined` when optional), or "" when the
 * method has no interface-typed body parameter.
 */
export function generateParseRequestTypeParams(params: OptionalKind<ParameterDeclarationStructure>[]): string {
    const bodyParam = params.find((param) => {
        return typeof param.type === "string" && isDataTypeInterface(param.type);
    });

    if (bodyParam) {
        const optional = bodyParam.hasQuestionToken ? " | undefined" : "";
        return `${bodyParam.type}${optional}`;
    }
    return "";
}
