import { EnumValueObject, SwaggerDefinition, TypeGenOptions, pascalCase } from "@ng-openapi/shared";
import {
    EnumMemberStructure,
    OptionalKind,
    StatementStructures,
    StructureKind,
    VariableDeclarationKind,
} from "ts-morph";
import { escapeString } from "./type-resolver";

export function toEnumKey(value: string | number): string {
    const str = value.toString();
    const hasLeadingMinus = str.startsWith("-");
    const pascalCased = pascalCase(str);
    return hasLeadingMinus ? pascalCased.replace(/^([0-9])/, "_n$1") : pascalCased.replace(/^([0-9])/, "_$1");
}

/**
 * Builds TS enum or union-type structures for swagger enum definitions,
 * honoring `enumStyle` and `generateEnumBasedOnDescription`.
 */
export class EnumBuilder {
    private readonly config: TypeGenOptions;

    constructor(config: TypeGenOptions) {
        this.config = config;
    }

    build(name: string, definition: SwaggerDefinition): StatementStructures[] {
        if (!definition.enum?.length) return [];
        const docs =
            !this.config.options.generateEnumBasedOnDescription && definition.description
                ? [definition.description]
                : undefined;

        if (this.config.options.enumStyle === "enum") {
            return this.buildEnumAsEnum(name, definition, docs);
        } else {
            return this.buildEnumAsUnion(name, definition, docs);
        }
    }

    private buildEnumAsEnum(name: string, definition: SwaggerDefinition, docs?: string[]): StatementStructures[] {
        if (!definition.enum?.length) throw Error("Enum definition has no values");
        const statements: StatementStructures[] = [];
        const isStringEnum = definition.enum.some((value) => typeof value === "string");

        if (isStringEnum) {
            const members: OptionalKind<EnumMemberStructure>[] = definition.enum.map((value) => ({
                name: toEnumKey(value),
                value: `${String(value)}`,
            }));

            statements.push({
                kind: StructureKind.Enum,
                name,
                isExported: true,
                docs,
                members,
            });
        } else {
            const members = this.buildEnumMembers(definition);

            statements.push({
                kind: StructureKind.Enum,
                name,
                isExported: true,
                docs,
                members,
            });
        }

        return statements;
    }

    private buildEnumAsUnion(name: string, definition: SwaggerDefinition, docs?: string[]): StatementStructures[] {
        if (!definition.enum?.length) throw Error("Enum definition has no values");
        const statements: StatementStructures[] = [];
        const objectProperties: string[] = [];
        const unionType = definition.enum
            .map((value) => {
                const key = toEnumKey(value);
                const val =
                    typeof value === "string"
                        ? `'${escapeString(value)}'`
                        : isNaN(value)
                          ? `'${value}'`
                          : `${value}`;
                objectProperties.push(`${key}: ${val} as ${name}`);
                return val;
            })
            .join(" | ");

        statements.push({
            kind: StructureKind.TypeAlias,
            name,
            type: unionType,
            isExported: true,
            docs,
        });

        statements.push({
            kind: StructureKind.VariableStatement,
            declarationKind: VariableDeclarationKind.Const,
            isExported: true,
            declarations: [
                {
                    name,
                    initializer: `{ ${objectProperties.join(",\n")} }`,
                },
            ],
        });

        return statements;
    }

    private buildEnumMembers(definition: SwaggerDefinition) {
        if (definition.description && this.config.options.generateEnumBasedOnDescription) {
            try {
                const enumValueObjects = JSON.parse(definition.description) as EnumValueObject[];
                return enumValueObjects.map((obj) => ({
                    name: obj.Name,
                    value: obj.Value,
                }));
            } catch {
                // Fall through to default handling
            }
        }

        return definition.enum?.map((value) => ({
            name: toEnumKey(value),
            value: value as string | number,
        }));
    }
}
