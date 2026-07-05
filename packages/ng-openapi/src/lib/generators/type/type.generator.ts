import { SwaggerDefinition, SwaggerParser, TYPE_GENERATOR_HEADER_COMMENT, TypeGenOptions } from "@ng-openapi/shared";
import { Project, SourceFile, StatementStructures, StructureKind } from "ts-morph";
import { EnumBuilder } from "./enum-builder";
import { InterfaceBuilder } from "./interface-builder";
import { buildSdkTypes } from "./sdk-types";
import { TypeResolver } from "./type-resolver";

/**
 * Orchestrates model generation: iterates the normalized definitions,
 * delegates structure building to the focused units, and batch-emits
 * everything into models/index.ts in a single AST update.
 */
export class TypeGenerator {
    private readonly parser: SwaggerParser;
    private readonly config: TypeGenOptions;
    private readonly sourceFile: SourceFile;
    private readonly resolver: TypeResolver;
    private readonly enumBuilder: EnumBuilder;
    private readonly interfaceBuilder: InterfaceBuilder;
    private readonly statements: StatementStructures[] = [];
    private readonly onWarning?: (message: string) => void;

    constructor(
        parser: SwaggerParser,
        project: Project,
        config: TypeGenOptions,
        outputRoot: string,
        onWarning?: (message: string) => void,
    ) {
        this.config = config;
        this.parser = parser;
        this.onWarning = onWarning;
        const outputPath = outputRoot + "/models/index.ts";
        this.sourceFile = project.createSourceFile(outputPath, "", { overwrite: true });
        this.resolver = new TypeResolver(config, onWarning);
        this.enumBuilder = new EnumBuilder(config, onWarning);
        this.interfaceBuilder = new InterfaceBuilder(this.resolver);
    }

    async generate() {
        try {
            const definitions = this.parser.getNormalizedSpec().definitions;
            if (!definitions || Object.keys(definitions).length === 0) {
                this.onWarning?.("No definitions found in swagger file");
            }

            // Phase 1: Collect all type structures in memory (no AST manipulation yet)
            Object.entries(definitions).forEach(([name, definition]) => {
                this.collectTypeStructure(name, definition);
            });

            // Phase 2: Add SDK types
            this.statements.push(...buildSdkTypes(this.config));

            // Phase 3: Single batch AST update
            this.applyBatchUpdates();

            // Phase 4: Format and save
            await this.finalize();
        } catch (error) {
            throw new Error(`Failed to generate types: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }

    private collectTypeStructure(name: string, definition: SwaggerDefinition): void {
        const typeName = this.resolver.pascalName(name);

        if (definition.enum) {
            this.statements.push(...this.enumBuilder.build(typeName, definition));
        } else if (definition.allOf) {
            this.statements.push(this.buildCompositeTypeAlias(typeName, definition));
        } else if (definition.items) {
            this.statements.push(this.buildArrayTypeAlias(typeName, definition));
        } else if (definition.properties) {
            this.statements.push(this.interfaceBuilder.build(typeName, definition));
        } else {
            this.statements.push({
                kind: StructureKind.TypeAlias,
                name: typeName,
                isExported: true,
                docs: definition.description ? [definition.description] : undefined,
                type: this.resolver.resolve(definition),
            });
        }
    }

    private buildCompositeTypeAlias(name: string, definition: SwaggerDefinition): StatementStructures {
        let typeExpression = "";

        if (definition.allOf) {
            const types = definition.allOf
                .map((def) => this.resolver.resolve(def))
                .filter((type) => type !== "any" && type !== "unknown");
            typeExpression = types.length > 0 ? types.join(" & ") : "Record<string, unknown>";
        }

        return {
            kind: StructureKind.TypeAlias,
            name,
            type: typeExpression,
            isExported: true,
            docs: definition.description ? [definition.description] : undefined,
        };
    }

    private buildArrayTypeAlias(name: string, definition: SwaggerDefinition): StatementStructures {
        const itemType = definition.items ? this.resolver.getArrayItemType(definition.items) : "unknown";

        return {
            kind: StructureKind.TypeAlias,
            name,
            isExported: true,
            docs: definition.description ? [definition.description] : undefined,
            type: `Array<${itemType}>`,
        };
    }

    private applyBatchUpdates(): void {
        this.sourceFile.insertText(0, TYPE_GENERATOR_HEADER_COMMENT);

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
        await this.sourceFile.save();
    }
}
