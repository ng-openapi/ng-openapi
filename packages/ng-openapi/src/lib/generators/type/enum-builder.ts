import { EnumValueObject, SwaggerDefinition, TypeGenOptions, pascalCaseForEnums } from "@ng-openapi/shared";
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
    // pascalCaseForEnums (not pascalCase) so characters like "+" become
    // separators too: "+1" must not survive into an object-literal key
    const pascalCased = pascalCaseForEnums(str);
    return hasLeadingMinus ? pascalCased.replace(/^_([0-9])/, "_n$1") : pascalCased;
}

/**
 * Builds TS enum or union-type structures for swagger enum definitions,
 * honoring `enumStyle` and `generateEnumBasedOnDescription`.
 */
export class EnumBuilder {
    private readonly config: TypeGenOptions;
    private readonly onWarning?: (message: string) => void;

    constructor(config: TypeGenOptions, onWarning?: (message: string) => void) {
        this.config = config;
        this.onWarning = onWarning;
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
            const members = this.buildEnumMembers(name, definition);

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

    private buildEnumMembers(name: string, definition: SwaggerDefinition) {
        if (definition.description && this.config.options.generateEnumBasedOnDescription) {
            try {
                const enumValueObjects = JSON.parse(definition.description) as EnumValueObject[];
                return enumValueObjects.map((obj) => ({
                    name: obj.Name,
                    value: obj.Value,
                }));
            } catch {
                // Prose descriptions are expected to land here silently; only a
                // description that looks like the JSON payload warrants a warning
                if (/^\s*[[{]/.test(definition.description)) {
                    this.onWarning?.(
                        `Enum "${name}": description looks like JSON (generateEnumBasedOnDescription) but could not be used — falling back to raw enum values`,
                    );
                }
            }
        }

        return definition.enum?.map((value) => ({
            name: toEnumKey(value),
            value: value as string | number,
        }));
    }
}
