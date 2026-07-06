import { Project, Scope, SourceFile } from "ts-morph";
import {
    camelCase,
    emitServiceDecorator,
    GeneratorConfig,
    getBasePathTokenName,
    getClientContextTokenName,
    getResourceClassName,
    hasDuplicateFunctionNames,
    HTTP_RESOURCE_GENERATOR_HEADER_COMMENT,
    IPluginGenerator,
    NormalizedOperation,
    NormalizedSpec,
    pascalCase,
    PluginGeneratorContext,
} from "@ng-openapi/shared";
import * as path from "path";
import { HttpResourceMethodGenerator } from "./http-resource-method.generator";
import { HttpResourceIndexGenerator } from "./http-resource-index.generator";

export class HttpResourceGenerator implements IPluginGenerator {
    private project: Project;
    private spec: NormalizedSpec;
    private config: GeneratorConfig;
    private methodGenerator: HttpResourceMethodGenerator;
    private indexGenerator: HttpResourceIndexGenerator;
    private readonly onWarning?: (message: string) => void;

    constructor(context: PluginGeneratorContext) {
        this.config = context.config;
        this.project = context.project;
        this.spec = context.spec;
        this.onWarning = context.onWarning;
        this.indexGenerator = new HttpResourceIndexGenerator(context.project, context.config.options.naming?.resources);
        this.methodGenerator = new HttpResourceMethodGenerator(context.config);
    }

    async generate(outputRoot: string) {
        const outputDir = path.join(outputRoot, "resources");
        // httpResource only wraps GETs
        const paths = this.spec.operations.filter((operation) => operation.method === "GET");

        if (paths.length === 0) {
            this.onWarning?.("No API paths found in the specification");
            return;
        }

        const controllerGroups = this.groupPathsByController(paths);

        await Promise.all(
            Object.entries(controllerGroups).map(([controllerName, operations]) => {
                this.generateServiceFile(controllerName, operations, outputDir);
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
                // Extract from path (e.g., "/api/users/{id}" -> "Users")
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

    private async generateServiceFile(controllerName: string, operations: NormalizedOperation[], outputDir: string) {
        const fileName = `${camelCase(controllerName)}.resource.ts`;
        const filePath = path.join(outputDir, fileName);

        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });
        this.addServiceClass(sourceFile, controllerName, operations);
        sourceFile.fixMissingImports().formatText(); //TODO: add models
        sourceFile.saveSync();
    }

    private addServiceClass(sourceFile: SourceFile, controllerName: string, operations: NormalizedOperation[]): void {
        const className = getResourceClassName(controllerName, this.config.options.naming?.resources);
        const basePathTokenName = getBasePathTokenName(this.config.clientName);
        const clientContextTokenName = getClientContextTokenName(this.config.clientName);
        const serviceDecorator = emitServiceDecorator(this.config.options);

        sourceFile.insertText(0, HTTP_RESOURCE_GENERATOR_HEADER_COMMENT(className));

        sourceFile.addImportDeclarations([
            {
                namedImports: [
                    "HttpContext",
                    "HttpContextToken",
                    "HttpHeaders",
                    "HttpParams",
                    "httpResource",
                    "HttpResourceOptions",
                    "HttpResourceRef",
                    "HttpResourceRequest",
                ],
                moduleSpecifier: "@angular/common/http",
            },
            {
                namedImports: ["inject", serviceDecorator.namedImport, "Signal"],
                moduleSpecifier: "@angular/core",
            },
            {
                namedImports: [basePathTokenName, clientContextTokenName],
                moduleSpecifier: "../tokens",
            },
            {
                namedImports: ["HttpParamsBuilder"],
                moduleSpecifier: "../utils/http-params-builder",
            },
        ]);

        const serviceClass = sourceFile.addClass({
            name: className,
            isExported: true,
            decorators: [serviceDecorator.decorator],
        });

        serviceClass.addProperty({
            name: "basePath",
            type: "string",
            scope: Scope.Private,
            isReadonly: true,
            initializer: `inject(${basePathTokenName})`,
        });

        serviceClass.addProperty({
            name: "clientContextToken",
            type: "HttpContextToken<string>",
            scope: Scope.Private,
            isReadonly: true,
            initializer: clientContextTokenName,
        });

        // Add the helper method for creating context with client ID
        serviceClass.addMethod({
            name: "createContextWithClientId",
            scope: Scope.Private,
            parameters: [
                {
                    name: "existingContext",
                    type: "HttpContext",
                    hasQuestionToken: true,
                },
            ],
            returnType: "HttpContext",
            statements: `const context = existingContext || new HttpContext();
return context.set(this.clientContextToken, '${this.config.clientName || "default"}');`,
        });

        // Generate methods for each operation
        operations.forEach((operation) => {
            this.methodGenerator.addResourceMethod(serviceClass, operation);
        });

        if (hasDuplicateFunctionNames(serviceClass.getMethods())) {
            throw new Error(
                `Duplicate method names found in service class ${className}. Please ensure unique method names for each operation.`,
            );
        }
    }
}
