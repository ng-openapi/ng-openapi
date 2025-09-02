import { Project, Scope, SourceFile } from "ts-morph";
import {
    camelCase,
    collectUsedTypes,
    extractPaths,
    GeneratorConfig,
    getBasePathTokenName,
    getClientContextTokenName,
    hasDuplicateFunctionNames,
    HTTP_RESOURCE_GENERATOR_HEADER_COMMENT,
    IPluginGenerator,
    pascalCase,
    PathInfo,
    SwaggerParser,
    SwaggerSpec,
} from "@ng-openapi/shared";
import * as path from "path";
import { HttpResourceMethodGenerator } from "./http-resource-method.generator";
import { HttpResourceIndexGenerator } from "./http-resource-index.generator";

export class HttpResourceGenerator implements IPluginGenerator {
    private project: Project;
    private parser: SwaggerParser;
    private spec: SwaggerSpec;
    private config: GeneratorConfig;
    private methodGenerator: HttpResourceMethodGenerator;
    private indexGenerator: HttpResourceIndexGenerator;

    constructor(parser: SwaggerParser, project: Project, config: GeneratorConfig) {
        this.config = config;
        this.project = project;
        this.parser = parser;
        this.spec = this.parser.getSpec();
        this.indexGenerator = new HttpResourceIndexGenerator(project);

        // Validate the spec
        if (!this.parser.isValidSpec()) {
            const versionInfo = this.parser.getSpecVersion();
            throw new Error(
                `Invalid or unsupported specification format. ` +
                    `Expected OpenAPI 3.x or Swagger 2.x. ` +
                    `${versionInfo ? `Found: ${versionInfo.type} ${versionInfo.version}` : "No version info found"}`
            );
        }

        this.methodGenerator = new HttpResourceMethodGenerator(config);
    }

    async generate(outputRoot: string) {
        const outputDir = path.join(outputRoot, "resources");
        const paths = extractPaths(this.spec.paths, ["get"]);

        if (paths.length === 0) {
            console.warn("No API paths found in the specification");
            return;
        }

        const controllerGroups = this.groupPathsByController(paths);

        await Promise.all(
            Object.entries(controllerGroups).map(([resourceName, operations]) => {
                this.generateServiceFile(resourceName, operations, outputDir);
            })
        );

        this.indexGenerator.generateIndex(outputRoot);
    }

    private groupPathsByController(paths: PathInfo[]): Record<string, PathInfo[]> {
        const groups: Record<string, PathInfo[]> = {};

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
            controllerName += "Resource";
            controllerName = pascalCase(controllerName);

            if (!groups[controllerName]) {
                groups[controllerName] = [];
            }
            groups[controllerName].push(path);
        });

        return groups;
    }

    private async generateServiceFile(resourceName: string, operations: PathInfo[], outputDir: string) {
        const fileName = `${camelCase(resourceName).replace(/Resource/, "")}.resource.ts`;
        const filePath = path.join(outputDir, fileName);

        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        // Collect all used model types first
        const usedTypes = collectUsedTypes(operations);

        this.addImports(sourceFile, usedTypes);
        this.addServiceClass(sourceFile, resourceName, operations);
        sourceFile.formatText();
        sourceFile.saveSync();
    }

    private addImports(sourceFile: SourceFile, usedTypes: Set<string>): void {
        const basePathTokenName = getBasePathTokenName(this.config.clientName);
        const clientContextTokenName = getClientContextTokenName(this.config.clientName);

        sourceFile.addImportDeclarations([
            {
                namedImports: ["Injectable", "inject", "Signal"],
                moduleSpecifier: "@angular/core",
            },
            {
                namedImports: [
                    "HttpResourceRef",
                    "HttpContext",
                    "httpResource",
                    "HttpResourceRequest",
                    "HttpResourceOptions",
                    "HttpParams",
                    "HttpContextToken",
                    "HttpHeaders",
                ],
                moduleSpecifier: "@angular/common/http",
            },
            {
                namedImports: [basePathTokenName, clientContextTokenName],
                moduleSpecifier: "../tokens",
            },
            {
                namedImports: ["HttpParamsBuilder"],
                moduleSpecifier: "../index",
            },
        ]);

        // Add model imports if needed
        if (usedTypes.size > 0) {
            sourceFile.addImportDeclaration({
                namedImports: Array.from(usedTypes).sort(),
                moduleSpecifier: "../models",
            });
        }
    }

    private addServiceClass(sourceFile: SourceFile, resourceName: string, operations: PathInfo[]): void {
        const className = `${resourceName}`;
        const basePathTokenName = getBasePathTokenName(this.config.clientName);
        const clientContextTokenName = getClientContextTokenName(this.config.clientName);

        sourceFile.insertText(0, HTTP_RESOURCE_GENERATOR_HEADER_COMMENT(resourceName));

        const serviceClass = sourceFile.addClass({
            name: className,
            isExported: true,
            decorators: [{ name: "Injectable", arguments: ['{ providedIn: "root" }'] }],
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
                `Duplicate method names found in service class ${className}. Please ensure unique method names for each operation.`
            );
        }
    }
}
