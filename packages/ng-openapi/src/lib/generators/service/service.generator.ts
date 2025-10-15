import { Project, Scope, SourceFile } from "ts-morph";
import {
    camelCase,
    extractPaths,
    GeneratorConfig,
    getBasePathTokenName,
    getClientContextTokenName,
    hasDuplicateFunctionNames,
    pascalCase,
    PathInfo,
    SERVICE_GENERATOR_HEADER_COMMENT,
    SwaggerParser,
    SwaggerSpec,
} from "@ng-openapi/shared";
import * as path from "path";
import { ServiceMethodGenerator } from "./service-method.generator";

export class ServiceGenerator {
    private project: Project;
    private parser: SwaggerParser;
    private spec: SwaggerSpec;
    private config: GeneratorConfig;
    private methodGenerator: ServiceMethodGenerator;

    constructor(parser: SwaggerParser, project: Project, config: GeneratorConfig) {
        this.config = config;
        this.project = project;
        this.parser = parser;
        this.spec = this.parser.getSpec();

        // Validate the spec
        if (!this.parser.isValidSpec()) {
            const versionInfo = this.parser.getSpecVersion();
            throw new Error(
                `Invalid or unsupported specification format. ` +
                `Expected OpenAPI 3.x or Swagger 2.x. ` +
                `${versionInfo ? `Found: ${versionInfo.type} ${versionInfo.version}` : "No version info found"}`
            );
        }

        this.methodGenerator = new ServiceMethodGenerator(config, parser);
    }

    async generate(outputRoot: string) {
        const outputDir = path.join(outputRoot, "services");
        const paths = extractPaths(this.spec.paths);

        if (paths.length === 0) {
            console.warn("No API paths found in the specification");
            return;
        }

        const controllerGroups = this.groupPathsByController(paths);

        await Promise.all(
            Object.entries(controllerGroups).map(([controllerName, operations]) =>
                this.generateServiceFile(controllerName, operations, outputDir)
            )
        );
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

            controllerName = pascalCase(controllerName);

            if (!groups[controllerName]) {
                groups[controllerName] = [];
            }
            groups[controllerName].push(path);
        });

        return groups;
    }

    private async generateServiceFile(controllerName: string, operations: PathInfo[], outputDir: string) {
        const fileName = `${camelCase(controllerName)}.service.ts`;
        const filePath = path.join(outputDir, fileName);

        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        this.addServiceClass(sourceFile, controllerName, operations);

        sourceFile.fixMissingImports().formatText();
        sourceFile.saveSync();
    }

    private addServiceClass(sourceFile: SourceFile, controllerName: string, operations: PathInfo[]): void {
        const className = `${controllerName}Service`;
        const basePathTokenName = getBasePathTokenName(this.config.clientName);
        const clientContextTokenName = getClientContextTokenName(this.config.clientName);

        sourceFile.insertText(0, SERVICE_GENERATOR_HEADER_COMMENT(controllerName));

        sourceFile.addImportDeclarations([
            { namedImports: ["HttpClient", "HttpContext", "HttpContextToken", "HttpParams"], moduleSpecifier: "@angular/common/http" },
            { namedImports: ["inject", "Injectable"], moduleSpecifier: "@angular/core" },
            { namedImports: ["Observable"], moduleSpecifier: "rxjs" },
            { namedImports: [basePathTokenName, clientContextTokenName, "RequestOptions"], moduleSpecifier: "../", },
            { namedImports: ["HttpParamsBuilder"], moduleSpecifier: "../" }
        ]);

        const serviceClass = sourceFile.addClass({
            name: className,
            isExported: true,
            decorators: [{ name: "Injectable", arguments: ['{ providedIn: "root" }'] }],
        });

        serviceClass.addProperty({ name: "httpClient", type: "HttpClient", scope: Scope.Private, isReadonly: true, initializer: "inject(HttpClient)" });
        serviceClass.addProperty({ name: "basePath", type: "string", scope: Scope.Private, isReadonly: true, initializer: `inject(${basePathTokenName})` });
        serviceClass.addProperty({ name: "clientContextToken", type: "HttpContextToken<string>", scope: Scope.Private, isReadonly: true, initializer: clientContextTokenName });

        serviceClass.addMethod({
            name: "createContextWithClientId",
            scope: Scope.Private,
            parameters: [{ name: "existingContext", type: "HttpContext", hasQuestionToken: true, }],
            returnType: "HttpContext",
            statements: `const context = existingContext || new HttpContext();\nreturn context.set(this.clientContextToken, '${this.config.clientName || "default"}');`,
        });

        operations.forEach((operation) => {
            this.methodGenerator.addServiceMethod(serviceClass, operation);
        });

        if (hasDuplicateFunctionNames(serviceClass.getMethods())) {
            throw new Error(
                `Duplicate method names found in service class ${className}. Please ensure unique method names for each operation.`
            );
        }
    }
}