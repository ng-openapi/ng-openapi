import { Project, SourceFile } from "ts-morph";
import * as path from "path";
import {
    camelCase,
    GeneratorConfig,
    IPluginGenerator,
    pascalCase,
    NormalizedOperation,
    NormalizedSpec,
    PluginGeneratorContext,
    ZOD_PLUGIN_GENERATOR_HEADER_COMMENT,
} from "@ng-openapi/shared";
import { ZodSchemaGenerator } from "./zod-schema.generator";
import { ZodIndexGenerator } from "./zod-index.generator";
import { ZodPluginOptions } from "./utils/types";
import { DEFAULT_OPTIONS } from "./utils/default-options";

export class ZodGenerator implements IPluginGenerator {
    private project: Project;
    private spec: NormalizedSpec;
    private config: GeneratorConfig;
    private options: ZodPluginOptions;
    private schemaGenerator: ZodSchemaGenerator;
    private indexGenerator: ZodIndexGenerator;
    private readonly onWarning?: (message: string) => void;

    constructor(context: PluginGeneratorContext, options?: ZodPluginOptions) {
        this.config = context.config;
        this.project = context.project;
        this.spec = context.spec;
        this.onWarning = context.onWarning;
        this.options = { ...DEFAULT_OPTIONS, ...options };

        this.schemaGenerator = new ZodSchemaGenerator(context.spec, this.config, this.options);
        this.indexGenerator = new ZodIndexGenerator(context.project);
    }

    async generate(outputRoot: string) {
        const outputDir = path.join(outputRoot, "validators");
        const paths = this.spec.operations;

        if (paths.length === 0) {
            this.onWarning?.("No API paths found in the specification");
            return;
        }

        const controllerGroups = this.groupPathsByController(paths);

        await Promise.all(
            Object.entries(controllerGroups).map(([validatorName, operations]) => {
                return this.generateValidatorFile(validatorName, operations, outputDir);
            }),
        );

        this.indexGenerator.generateIndex(outputRoot);
    }

    private groupPathsByController(paths: NormalizedOperation[]): Record<string, NormalizedOperation[]> {
        const groups: Record<string, NormalizedOperation[]> = {};

        paths.forEach((path) => {
            let controllerName = "Default";

            if (path.tags && path.tags.length > 0) {
                controllerName = path.tags[0];
            } else {
                // Extract from path
                const pathParts = path.path.split("/").filter((p) => p && !p.startsWith("{"));
                if (pathParts.length > 1) {
                    controllerName = pascalCase(pathParts[1]);
                }
            }

            controllerName = pascalCase(controllerName);

            if (!groups[controllerName]) {
                groups[controllerName] = [];
            }
            groups[controllerName].push(path);
        });

        return groups;
    }

    private async generateValidatorFile(validatorName: string, operations: NormalizedOperation[], outputDir: string) {
        const fileName = `${camelCase(validatorName)}.validator.ts`;
        const filePath = path.join(outputDir, fileName);

        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        // Add imports
        this.addImports(sourceFile, operations);

        const _statements: string[] = [];
        // Generate validators for each operation
        for (const operation of operations) {
            const statements = await this.generateOperationValidators(sourceFile, operation);
            _statements.push(...statements);
        }

        if (_statements.length > 0) {
            sourceFile.formatText();
            // Add header comment
            sourceFile.insertText(0, ZOD_PLUGIN_GENERATOR_HEADER_COMMENT(validatorName));
            sourceFile.saveSync();
        } else {
            // Nothing to validate for this controller: drop the file from the
            // Project so it neither reaches the index nor filesWritten
            this.project.removeSourceFile(sourceFile);
        }
    }

    private addImports(sourceFile: SourceFile, operations: NormalizedOperation[]): void {
        // Always import zod
        sourceFile.addImportDeclaration({
            namedImports: ["z"],
            moduleSpecifier: "zod",
        });
    }

    private async generateOperationValidators(sourceFile: SourceFile, operation: NormalizedOperation) {
        const operationName = this.getOperationName(operation);
        const statements: string[] = [];

        // Generate parameter validators
        if (this.shouldGenerate("param") || this.shouldGenerate("query") || this.shouldGenerate("header")) {
            const params = await this.generateParameterValidators(operation, operationName);
            if (params.length > 0) {
                statements.push(...params);
            }
        }

        // Generate body validator
        if (this.shouldGenerate("body") && operation.requestBody) {
            const bodyValidators = await this.schemaGenerator.generateBodyValidator(operation, operationName);
            if (bodyValidators.length > 0) {
                statements.push(...bodyValidators);
            }
        }

        // Generate response validators
        if (this.shouldGenerate("response")) {
            const responseValidators = await this.schemaGenerator.generateResponseValidators(operation, operationName);
            if (responseValidators.length > 0) {
                statements.push(...responseValidators);
            }
        }

        sourceFile.addStatements(statements);
        return statements;
    }

    private async generateParameterValidators(operation: NormalizedOperation, operationName: string): Promise<string[]> {
        const statements: string[] = [];

        // Group parameters by type
        const pathParams = operation.parameters?.filter((p) => p.in === "path") || [];
        const queryParams = operation.parameters?.filter((p) => p.in === "query") || [];
        const headerParams = operation.parameters?.filter((p) => p.in === "header") || [];

        // Generate path params validator
        if (pathParams.length > 0 && this.shouldGenerate("param")) {
            const validator = await this.schemaGenerator.generateParametersValidator(
                pathParams,
                operationName,
                "Params",
            );
            if (validator) {
                statements.push(validator);
            }
        }

        // Generate query params validator
        if (queryParams.length > 0 && this.shouldGenerate("query")) {
            const validator = await this.schemaGenerator.generateParametersValidator(
                queryParams,
                operationName,
                "QueryParams",
            );
            if (validator) {
                statements.push(validator);
            }
        }

        // Generate header params validator
        if (headerParams.length > 0 && this.shouldGenerate("header")) {
            const validator = await this.schemaGenerator.generateParametersValidator(
                headerParams,
                operationName,
                "Headers",
            );
            if (validator) {
                statements.push(validator);
            }
        }

        return statements;
    }

    private shouldGenerate(type: "param" | "query" | "header" | "body" | "response"): boolean {
        return this.options.generate?.[type] ?? DEFAULT_OPTIONS.generate![type]!;
    }

    private getOperationName(operation: NormalizedOperation): string {
        if (operation.operationId) {
            return camelCase(operation.operationId);
        }

        // Generate name from method and path
        const method = pascalCase(operation.method.toLowerCase());
        const pathParts = operation.path
            .split("/")
            .filter((p) => p && !p.startsWith("{"))
            .map((p) => pascalCase(p));

        return camelCase(`${pathParts.join("")}${method}`);
    }
}
