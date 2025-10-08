import {
    EnumValueObject,
    GeneratorConfig,
    pascalCase,
    SwaggerDefinition,
    SwaggerParser,
    TYPE_GENERATOR_HEADER_COMMENT,
} from "@ng-openapi/shared";
import {
    EnumMemberStructure,
    OptionalKind,
    Project,
    SourceFile,
    StatementStructures,
    StructureKind,
    VariableDeclarationKind,
} from "ts-morph";

export class TypeGenerator {
    private readonly project: Project;
    private readonly parser: SwaggerParser;
    private sourceFile: SourceFile;
    private readonly generatedTypes = new Set<string>();
    private readonly config: GeneratorConfig;

    // Performance caches
    private readonly pascalCaseCache = new Map<string, string>();
    private readonly sanitizedNameCache = new Map<string, string>();
    private readonly typeResolutionCache = new Map<string, string>();

    // Batch collection for AST operations
    private readonly statements: StatementStructures[] = [];
    private readonly deferredTypes = new Map<string, SwaggerDefinition>();

    constructor(parser: SwaggerParser, project: Project, config: GeneratorConfig, outputRoot: string) {
        this.config = config;
        this.project = project;
        this.parser = parser;
        const outputPath = outputRoot + "/models/index.ts";
        this.sourceFile = this.project.createSourceFile(outputPath, "", { overwrite: true });
    }

    async generate() {
        try {
            const definitions = this.parser.getDefinitions();
            if (!definitions || Object.keys(definitions).length === 0) {
                console.warn("No definitions found in swagger file");
                return;
            }

            // Phase 1: Collect all type structures in memory (no AST manipulation yet)
            this.collectAllTypeStructures(definitions);

            // Phase 2: Add SDK types
            this.collectSdkTypes();

            // Phase 3: Single batch AST update
            this.applyBatchUpdates();

            // Phase 4: Format and save
            await this.finalize();
        } catch (error) {
            console.error("Error in generate():", error);
            throw new Error(`Failed to generate types: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }

    private collectAllTypeStructures(definitions: Record<string, SwaggerDefinition>): void {
        // First pass: Register all types to avoid forward reference issues
        Object.keys(definitions).forEach((name) => {
            const interfaceName = this.getCachedPascalCase(name);
            this.generatedTypes.add(interfaceName);
        });

        // Second pass: Generate structures
        Object.entries(definitions).forEach(([name, definition]) => {
            this.collectTypeStructure(name, definition);
        });

        // Third pass: Process any deferred types
        this.deferredTypes.forEach((definition, name) => {
            this.collectTypeStructure(name, definition);
        });
    }

    private collectTypeStructure(name: string, definition: SwaggerDefinition): void {
        const interfaceName = this.getCachedPascalCase(name) ?? "";

        if (definition.enum) {
            this.collectEnumStructure(interfaceName, definition);
        } else if (definition.allOf) {
            this.collectCompositeTypeStructure(interfaceName, definition);
        } else {
            this.collectInterfaceStructure(interfaceName, definition);
        }
    }

    private collectEnumStructure(name: string, definition: SwaggerDefinition): void {
        if (!definition.enum?.length) return;
        const docs =
            !this.config.options.generateEnumBasedOnDescription && definition.description
                ? [definition.description]
                : undefined;

        if (this.config.options.enumStyle === "enum") {
            const statement = this.buildEnumAsEnum(name, definition, docs);
            this.statements.push(...statement);
        } else {
            const statement = this.buildEnumAsUnion(name, definition, docs);
            this.statements.push(...statement);
        }
    }

    private buildEnumAsEnum(name: string, definition: SwaggerDefinition, docs?: string[]): StatementStructures[] {
        if (!definition.enum?.length) throw Error("Enum definition has no values");
        const statements: StatementStructures[] = [];
        const isStringEnum = definition.enum.some((value) => typeof value === "string");

        if (isStringEnum) {
            const members: OptionalKind<EnumMemberStructure>[] = definition.enum.map((value) => ({
                name: this.toEnumKey(value),
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
            // Create enum structure
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
                const key = this.toEnumKey(value);
                const val =
                    typeof value === "string"
                        ? `'${this.escapeString(value)}'`
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
            name: this.toEnumKey(value),
            value: value as string | number,
        }));
    }

    private collectCompositeTypeStructure(name: string, definition: SwaggerDefinition): void {
        let typeExpression = "";

        if (definition.allOf) {
            const types = definition.allOf
                .map((def) => this.resolveSwaggerTypeCached(def))
                .filter((type) => type !== "any" && type !== "unknown");
            typeExpression = types.length > 0 ? types.join(" & ") : "Record<string, unknown>";
        }

        this.statements.push({
            kind: StructureKind.TypeAlias,
            name,
            type: typeExpression,
            isExported: true,
            docs: definition.description ? [definition.description] : undefined,
        });
    }

    private collectInterfaceStructure(name: string, definition: SwaggerDefinition): void {
        const properties = this.buildInterfaceProperties(definition);

        this.statements.push({
            kind: StructureKind.Interface,
            name,
            isExported: true,
            docs: definition.description ? [definition.description] : undefined,
            properties,
            indexSignatures: this.buildIndexSignatures(definition),
        });
    }

    private buildInterfaceProperties(definition: SwaggerDefinition): any[] {
        if (!definition.properties) {
            return [];
        }

        return Object.entries(definition.properties).map(([propertyName, property]) => {
            const isRequired = definition.required?.includes(propertyName) ?? false;
            const isReadOnly = property.readOnly;
            const propertyType = this.resolveSwaggerTypeCached(property);
            const sanitizedName = this.getCachedSanitizedName(propertyName);

            return {
                name: sanitizedName,
                type: propertyType,
                isReadonly: isReadOnly,
                hasQuestionToken: !isRequired,
                docs: property.description ? [property.description] : undefined,
            };
        });
    }

    private buildIndexSignatures(definition: SwaggerDefinition): any[] {
        if (!definition.properties && definition.additionalProperties === false) {
            return [
                {
                    keyName: "key",
                    keyType: "string",
                    returnType: "never",
                },
            ];
        }

        if (!definition.properties && definition.additionalProperties === true) {
            return [
                {
                    keyName: "key",
                    keyType: "string",
                    returnType: "any",
                },
            ];
        }

        if (!definition.properties) {
            return [
                {
                    keyName: "key",
                    keyType: "string",
                    returnType: "unknown",
                },
            ];
        }

        return [];
    }

    private resolveSwaggerTypeCached(schema: SwaggerDefinition): string {
        const cacheKey = JSON.stringify(schema);

        if (this.typeResolutionCache.has(cacheKey)) {
            return this.typeResolutionCache.get(cacheKey) as string;
        }

        const result = this.resolveSwaggerType(schema);
        this.typeResolutionCache.set(cacheKey, result);
        return result;
    }

    private resolveSwaggerType(schema: SwaggerDefinition): string {
        if (schema.$ref) {
            return this.resolveReference(schema.$ref);
        }

        if (schema.enum) {
            return schema.enum
                .map((value) => (typeof value === "string" ? `'${this.escapeString(value)}'` : String(value)))
                .join(" | ");
        }

        if (schema.allOf) {
            return (
                schema.allOf
                    .map((def) => this.resolveSwaggerTypeCached(def))
                    .filter((type) => type !== "any" && type !== "unknown")
                    .join(" & ") || "Record<string, unknown>"
            );
        }

        if (schema.oneOf) {
            return (
                schema.oneOf
                    .map((def) => this.resolveSwaggerTypeCached(def))
                    .filter((type, index, array) => type !== "any" && type !== "unknown" && array.indexOf(type) === index)
                    .join(" | ") || "unknown"
            );
        }

        if (schema.anyOf) {
            return (
                schema.anyOf
                    .map((def) => this.resolveSwaggerTypeCached(def))
                    .filter((type) => type !== "any" && type !== "unknown")
                    .join(" | ") || "unknown"
            );
        }

        if (schema.type === "array") {
            const itemType = schema.items ? this.getArrayItemType(schema.items) : "unknown";
            return `Array<${itemType}>`;
        }

        if (schema.type === "object") {
            if (schema.properties) {
                return this.generateInlineObjectType(schema);
            }

            if (schema.additionalProperties) {
                const valueType =
                    typeof schema.additionalProperties === "object"
                        ? this.resolveSwaggerTypeCached(schema.additionalProperties)
                        : "unknown";
                return `Record<string, ${valueType}>`;
            }

            return "Record<string, unknown>";
        }

        return this.mapSwaggerTypeToTypeScript(schema.type, schema.format, schema.nullable);
    }

    private generateInlineObjectType(definition: SwaggerDefinition): string {
        if (!definition.properties) {
            if (definition.additionalProperties) {
                const additionalType =
                    typeof definition.additionalProperties === "object"
                        ? this.resolveSwaggerTypeCached(definition.additionalProperties)
                        : "unknown";
                return `Record<string, ${additionalType}>`;
            }
            return "Record<string, unknown>";
        }

        const properties = Object.entries(definition.properties)
            .map(([key, prop]) => {
                const isRequired = definition.required?.includes(key) ?? false;
                const questionMark = isRequired ? "" : "?";
                const sanitizedKey = this.getCachedSanitizedName(key);
                return `${sanitizedKey}${questionMark}: ${this.resolveSwaggerTypeCached(prop)}`;
            })
            .join("; ");

        return `{ ${properties} }`;
    }

    private resolveReference(ref: string): string {
        const refName = ref.split("/").pop();
        if (!refName) {
            console.warn(`Invalid reference format: ${ref}`);
            return "unknown";
        }

        return this.getCachedPascalCase(refName);
    }

    private collectSdkTypes(): void {
        const { response } = this.config.options.validation ?? {};

        const typeParameters = ["TResponseType extends 'arraybuffer' | 'blob' | 'json' | 'text'"];
        const properties = [
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

        this.statements.push({
            kind: StructureKind.Interface,
            name: "RequestOptions",
            isExported: true,
            typeParameters: typeParameters,
            properties: properties,
            docs: ["Request Options for Angular HttpClient requests"],
        });
    }

    private applyBatchUpdates(): void {
        // Add header comment
        this.sourceFile.insertText(0, TYPE_GENERATOR_HEADER_COMMENT);

        // Add imports
        this.sourceFile.addImportDeclarations([
            {
                namedImports: ["HttpContext", "HttpHeaders"],
                moduleSpecifier: "@angular/common/http",
            },
        ]);

        // Add all statements in a single operation
        this.sourceFile.addStatements(this.statements);
    }

    private async finalize(): Promise<void> {
        // Format only once at the end
        this.sourceFile.formatText();

        // Use async save
        await this.sourceFile.save();
    }

    // Cached helper methods
    private getCachedPascalCase(str: string) {
        if (!this.pascalCaseCache.has(str)) {
            this.pascalCaseCache.set(str, this.pascalCaseForEnums(str));
        }
        return this.pascalCaseCache.get(str) as string;
    }

    private getCachedSanitizedName(name: string) {
        if (!this.sanitizedNameCache.has(name)) {
            this.sanitizedNameCache.set(name, this.sanitizePropertyName(name));
        }
        return this.sanitizedNameCache.get(name) as string;
    }

    // Original helper methods
    private mapSwaggerTypeToTypeScript(type?: string, format?: string, isNullable?: boolean): string {
        switch (type) {
            case "string":
                if (format === "date" || format === "date-time") {
                    const dateType = this.config.options.dateType === "Date" ? "Date" : "string";
                    return this.nullableType(dateType, isNullable);
                }
                if (format === "binary") return "Blob";
                if (format === "uuid") return "string";
                if (format === "email") return "string";
                if (format === "uri") return "string";
                return this.nullableType("string", isNullable);
            case "number":
            case "integer":
                return this.nullableType("number", isNullable);
            case "boolean":
                return this.nullableType("boolean", isNullable);
            case "array":
                return this.nullableType("any[]", isNullable);
            case "object":
                return this.nullableType("Record<string, unknown>", isNullable);
            case "null":
                return this.nullableType("null", isNullable);
            default:
                if (Array.isArray(type)) {
                    const types = type.map((t) => this.mapSwaggerTypeToTypeScript(t, undefined, isNullable));
                    return this.nullableType(types.join(" | "), isNullable);
                }
                return this.nullableType("any", isNullable);
        }
    }

    private nullableType(type: string, isNullable?: boolean): string {
        return type + (isNullable ? " | null" : "");
    }

    private pascalCaseForEnums(str: string): string {
        return str
            .replace(/[^a-zA-Z0-9]/g, "_")
            .replace(/(?:^|_)([a-z])/g, (_, char) => char.toUpperCase())
            .replace(/^([0-9])/, "_$1");
    }

    private sanitizePropertyName(name: string): string {
        if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name)) {
            return `"${name}"`;
        }
        return name;
    }

    private toEnumKey(value: string | number): string {
        const str = value.toString();
        const hasLeadingMinus = str.startsWith("-");
        const pascalCased = pascalCase(str);
        return hasLeadingMinus ? pascalCased.replace(/^([0-9])/, "_n$1") : pascalCased.replace(/^([0-9])/, "_$1");
    }

    private getArrayItemType(items: SwaggerDefinition | SwaggerDefinition[]): string {
        if (Array.isArray(items)) {
            const types = items.map((item) => this.resolveSwaggerTypeCached(item));
            return `[${types.join(", ")}]`;
        } else {
            return this.resolveSwaggerTypeCached(items);
        }
    }

    private escapeString(str: string): string {
        return str.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    }
}
