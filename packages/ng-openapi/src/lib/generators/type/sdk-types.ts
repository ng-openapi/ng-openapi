import { TypeGenOptions } from "@ng-openapi/shared";
import { OptionalKind, PropertySignatureStructure, StatementStructures, StructureKind } from "ts-morph";

/** Builds the `RequestOptions` SDK interface emitted alongside the models. */
export function buildSdkTypes(config: TypeGenOptions): StatementStructures[] {
    const { response } = config.options.validation ?? {};

    const typeParameters = ["TResponseType extends 'arraybuffer' | 'blob' | 'json' | 'text'"];
    const properties: OptionalKind<PropertySignatureStructure>[] = [
        {
            name: "headers",
            type: "HttpHeaders",
            hasQuestionToken: true,
        },
        {
            name: "reportProgress",
            type: "boolean",
            hasQuestionToken: true,
        },
        {
            name: "responseType",
            type: "TResponseType",
            hasQuestionToken: true,
        },
        {
            name: "withCredentials",
            type: "boolean",
            hasQuestionToken: true,
        },
        {
            name: "context",
            type: "HttpContext",
            hasQuestionToken: true,
        },
    ];

    if (response) {
        properties.push({
            name: "parse",
            type: "(response: unknown) => TReturnType",
            hasQuestionToken: true,
        });
        typeParameters.push("TReturnType");
    }

    return [
        {
            kind: StructureKind.Interface,
            name: "RequestOptions",
            isExported: true,
            typeParameters: typeParameters,
            properties: properties,
            docs: ["Request Options for Angular HttpClient requests"],
        },
    ];
}
