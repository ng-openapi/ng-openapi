import { OptionalKind, ParameterDeclarationStructure } from "ts-morph";
import { isDataTypeInterface } from "./is-data-type-interface";

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
