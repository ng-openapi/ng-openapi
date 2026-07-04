import { OptionalKind, ParameterDeclarationStructure, PropertySignatureStructure } from "ts-morph";

/**
 * Describes the single request object of an operation when
 * `options.useSingleRequestParameter` is enabled. Built once per operation by
 * the RequestParamsGenerator and consumed by the params, overloads and method
 * generators so the interface, signature and method body can never drift apart.
 */
export interface RequestObjectEntry {
    interfaceName: string;
    /** Deduped API parameters (path, body/form fields, query) backing the interface properties. */
    parameters: OptionalKind<ParameterDeclarationStructure>[];
    /** Local identifier of the request parameter, collision-safe against the property names. */
    varName: string;
    /** True when every property is optional, making the request object itself optional. */
    isOptional: boolean;
}

export class ServiceMethodRequestObjectGenerator {
    /** First-occurrence-wins dedupe, shared by the flat and single-request parameter builders. */
    static dedupe(params: OptionalKind<ParameterDeclarationStructure>[]): OptionalKind<ParameterDeclarationStructure>[] {
        const seen = new Set<string>();
        return params.filter((param) => {
            if (seen.has(param.name)) {
                return false;
            }
            seen.add(param.name);
            return true;
        });
    }

    static createEntry(
        interfaceName: string,
        parameters: OptionalKind<ParameterDeclarationStructure>[],
    ): RequestObjectEntry {
        return {
            interfaceName,
            parameters,
            varName: this.resolveVarName(parameters),
            isOptional: parameters.every((param) => param.hasQuestionToken),
        };
    }

    static toRequestParameter(entry: RequestObjectEntry): OptionalKind<ParameterDeclarationStructure> {
        return {
            name: entry.varName,
            type: entry.interfaceName,
            hasQuestionToken: entry.isOptional,
        };
    }

    static toInterfaceProperties(entry: RequestObjectEntry): OptionalKind<PropertySignatureStructure>[] {
        return entry.parameters.map((param) => ({
            name: param.name,
            type: param.type as string,
            hasQuestionToken: param.hasQuestionToken,
        }));
    }

    /**
     * The destructuring statement placed at the top of the method body so the
     * existing body templates keep referencing plain local identifiers.
     */
    static toDestructureStatement(entry: RequestObjectEntry): string {
        const names = entry.parameters.map((param) => param.name).join(", ");
        const source = entry.isOptional ? `${entry.varName} ?? {}` : entry.varName;
        return `const { ${names} } = ${source};`;
    }

    /** Destructured properties share the method scope, so the request variable must not collide with them. */
    private static resolveVarName(parameters: OptionalKind<ParameterDeclarationStructure>[]): string {
        const used = new Set(parameters.map((param) => param.name));
        for (const candidate of ["request", "requestParams", "requestParameters"]) {
            if (!used.has(candidate)) {
                return candidate;
            }
        }
        let suffix = 2;
        while (used.has(`requestParameters${suffix}`)) {
            suffix++;
        }
        return `requestParameters${suffix}`;
    }
}
