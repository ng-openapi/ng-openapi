import { emitDocs, pascalCaseForEnums, SwaggerDefinition, TypeGenOptions } from "@ng-openapi/shared";
import {
    EnumMemberStructure,
    OptionalKind,
    StatementStructures,
    StructureKind,
    VariableDeclarationKind,
} from "ts-morph";
import { escapeString } from "./type-resolver";

type EnumValue = string | number;

export function toEnumKey(value: EnumValue): string {
    const str = value.toString();
    const hasLeadingMinus = str.startsWith("-");
    // pascalCaseForEnums (not pascalCase) so characters like "+" become
    // separators too: "+1" must not survive into an object-literal key
    const pascalCased = pascalCaseForEnums(str);
    return hasLeadingMinus ? pascalCased.replace(/^_([0-9])/, "_n$1") : pascalCased;
}

/**
 * Builds TS enum or union-type structures for swagger enum definitions,
 * honoring `enumStyle`. Members are named by the normalizer's
 * `enumMemberNames` when it resolved any, by their values otherwise.
 */
export class EnumBuilder {
    private readonly config: TypeGenOptions;

    constructor(config: TypeGenOptions) {
        this.config = config;
    }

    build(name: string, definition: SwaggerDefinition): StatementStructures[] {
        const values = definition.enum;
        if (!values?.length) return [];
        const names = definition.enumMemberNames ?? values.map((value) => toEnumKey(value));
        // With generateEnumBasedOnDescription the description is a JSON
        // payload of member names, not prose worth a doc comment.
        const docs = this.config.options.generateEnumBasedOnDescription ? undefined : emitDocs(definition.description);

        return this.config.options.enumStyle === "enum"
            ? this.buildEnumAsEnum(name, values, names, docs)
            : this.buildEnumAsUnion(name, values, names, docs);
    }

    private buildEnumAsEnum(
        name: string,
        values: EnumValue[],
        names: string[],
        docs?: string[],
    ): StatementStructures[] {
        // One string member makes the whole enum a string enum: TS allows
        // mixing, but the generated members have always been all-strings here.
        const isStringEnum = values.some((value) => typeof value === "string");
        const members: OptionalKind<EnumMemberStructure>[] = values.map((value, index) => ({
            name: names[index],
            value: isStringEnum ? String(value) : value,
        }));

        return [
            {
                kind: StructureKind.Enum,
                name,
                isExported: true,
                docs,
                members,
            },
        ];
    }

    private buildEnumAsUnion(
        name: string,
        values: EnumValue[],
        names: string[],
        docs?: string[],
    ): StatementStructures[] {
        const literals = values.map((value) =>
            typeof value === "string" ? `'${escapeString(value)}'` : isNaN(value) ? `'${value}'` : `${value}`,
        );
        const objectProperties = literals.map((literal, index) => `${names[index]}: ${literal} as ${name}`);

        return [
            {
                kind: StructureKind.TypeAlias,
                name,
                type: literals.join(" | "),
                isExported: true,
                docs,
            },
            {
                kind: StructureKind.VariableStatement,
                declarationKind: VariableDeclarationKind.Const,
                isExported: true,
                declarations: [
                    {
                        name,
                        initializer: `{ ${objectProperties.join(",\n")} }`,
                    },
                ],
            },
        ];
    }
}
