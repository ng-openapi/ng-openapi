import { SwaggerDefinition, SwaggerParser, TYPE_GENERATOR_HEADER_COMMENT, TypeGenOptions } from "@ng-openapi/shared";
import { ImportDeclarationStructure, OptionalKind, Project, SourceFile, StatementStructures, StructureKind } from "ts-morph";
import { EnumBuilder } from "./enum-builder";
import { InterfaceBuilder } from "./interface-builder";
import { ModelFileRegistry } from "./model-file-registry";
import { buildSdkTypes } from "./sdk-types";
import { TypeResolver } from "./type-resolver";

/**
 * Orchestrates model generation: iterates the normalized definitions and
 * delegates structure building to the focused units. With the default
 * `modelFileStructure: "single"` everything is batch-emitted into
 * models/index.ts; with `"per-type"` each definition gets its own file
 * (cross-file imports computed from the $refs the resolver saw — no
 * language service involved) and models/index.ts becomes a barrel.
 */
export class TypeGenerator {
    private readonly parser: SwaggerParser;
    private readonly config: TypeGenOptions;
    private readonly project: Project;
    private readonly outputRoot: string;
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
        this.project = project;
        this.outputRoot = outputRoot;
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

            if (this.config.options.modelFileStructure === "per-type") {
                this.generatePerType(definitions);
                return;
            }

            // Phase 1: Collect all type structures in memory (no AST manipulation yet)
            Object.entries(definitions).forEach(([name, definition]) => {
                this.statements.push(...this.collectTypeStructure(name, definition));
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

    private collectTypeStructure(name: string, definition: SwaggerDefinition): StatementStructures[] {
        const typeName = this.resolver.pascalName(name);

        if (definition.enum) {
            return this.enumBuilder.build(typeName, definition);
        } else if (definition.allOf) {
            return [this.buildCompositeTypeAlias(typeName, definition)];
        } else if (definition.items) {
            return [this.buildArrayTypeAlias(typeName, definition)];
        } else if (definition.properties) {
            return [this.interfaceBuilder.build(typeName, definition)];
        } else {
            return [
                {
                    kind: StructureKind.TypeAlias,
                    name: typeName,
                    isExported: true,
                    docs: definition.description ? [definition.description] : undefined,
                    type: this.resolver.resolve(definition),
                },
            ];
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

        this.addSdkImports(this.sourceFile);

        // Add all statements in a single operation
        this.sourceFile.addStatements(this.statements);
    }

    private async finalize(): Promise<void> {
        // Format only once at the end
        this.sourceFile.formatText();
        await this.sourceFile.save();
    }

    private generatePerType(definitions: Record<string, SwaggerDefinition>): void {
        const registry = new ModelFileRegistry(this.onWarning);
        // Claimed before user schemas so a schema named "RequestOptions" gets
        // a numeric-suffixed file deterministically. File names only: a schema
        // whose decorated identifier equals another export (e.g. RequestOptions
        // itself) does not compile in either mode — single-file collides at the
        // declarations, per-type at the barrel re-exports.
        const sdkFileName = registry.reserveExact("request-options");

        const entries = Object.entries(definitions);
        entries.forEach(([rawName]) => registry.reserveForSchema(rawName));

        entries.forEach(([rawName, definition]) => {
            const references = new Set<string>();
            const statements = this.resolver.withReferenceTracking(references, () =>
                this.collectTypeStructure(rawName, definition),
            );
            this.writeModelFile(rawName, statements, references, registry);
        });

        this.writeSdkTypesFile(sdkFileName);
        this.writeModelsBarrel(registry, sdkFileName);
    }

    private writeModelFile(
        rawName: string,
        statements: StatementStructures[],
        references: Set<string>,
        registry: ModelFileRegistry,
    ): void {
        const fileName = registry.fileNameFor(rawName) as string;
        const sourceFile = this.createModelSourceFile(fileName);

        const imports = this.buildCrossFileImports(rawName, references, registry);
        if (imports.length > 0) {
            sourceFile.addImportDeclarations(imports);
        }
        sourceFile.addStatements(statements);
        this.finalizeModelSourceFile(sourceFile);
    }

    private buildCrossFileImports(
        rawName: string,
        references: Set<string>,
        registry: ModelFileRegistry,
    ): OptionalKind<ImportDeclarationStructure>[] {
        const namesBySpecifier = new Map<string, Set<string>>();
        references.forEach((refRawName) => {
            if (refRawName === rawName) {
                return; // recursive self-reference needs no import
            }
            const refFileName = registry.fileNameFor(refRawName);
            if (!refFileName) {
                return; // dangling $ref: same undefined-identifier outcome as single-file mode
            }
            const names = namesBySpecifier.get(refFileName) ?? new Set<string>();
            names.add(this.resolver.pascalName(refRawName));
            namesBySpecifier.set(refFileName, names);
        });

        return [...namesBySpecifier.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([fileName, names]) => ({
                namedImports: [...names].sort(),
                moduleSpecifier: `./${fileName}`,
            }));
    }

    private writeSdkTypesFile(fileName: string): void {
        const sourceFile = this.createModelSourceFile(fileName);
        this.addSdkImports(sourceFile);
        sourceFile.addStatements(buildSdkTypes(this.config));
        this.finalizeModelSourceFile(sourceFile);
    }

    private addSdkImports(sourceFile: SourceFile): void {
        sourceFile.addImportDeclarations([
            {
                namedImports: ["HttpContext", "HttpHeaders"],
                moduleSpecifier: "@angular/common/http",
            },
        ]);
    }

    private writeModelsBarrel(registry: ModelFileRegistry, sdkFileName: string): void {
        [...registry.schemaFileNames, sdkFileName]
            .sort()
            .forEach((fileName) => this.sourceFile.addExportDeclaration({ moduleSpecifier: `./${fileName}` }));
        this.finalizeModelSourceFile(this.sourceFile);
    }

    private createModelSourceFile(fileName: string): SourceFile {
        return this.project.createSourceFile(`${this.outputRoot}/models/${fileName}.ts`, "", {
            overwrite: true,
        });
    }

    /**
     * Header comment last: adding statements to a file that contains only
     * plain comment text trips up ts-morph (same ordering constraint as
     * RequestParamsGenerator.generate).
     */
    private finalizeModelSourceFile(sourceFile: SourceFile): void {
        sourceFile.formatText();
        sourceFile.insertText(0, TYPE_GENERATOR_HEADER_COMMENT);
        sourceFile.saveSync();
    }
}
