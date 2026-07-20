import { Project, Scope, SourceFile } from "ts-morph";
import {
    camelCase,
    emitServiceDecorator,
    GeneratorConfig,
    getBasePathTokenName,
    getClientContextTokenName,
    getServiceClassName,
    hasDuplicateFunctionNames,
    NormalizedOperation,
    pascalCase,
    SERVICE_GENERATOR_HEADER_COMMENT,
    SwaggerParser,
} from "@ng-openapi/shared";
import * as path from "path";
import { ServiceMethodGenerator } from "./service-method.generator";
import { RequestParamsGenerator } from "./request-params.generator";
import { RequestObjectEntry } from "./service-method";

export class ServiceGenerator {
    private project: Project;
    private parser: SwaggerParser;
    private config: GeneratorConfig;
    private methodGenerator: ServiceMethodGenerator;
    private requestObjects?: Map<NormalizedOperation, RequestObjectEntry>;
    private readonly onWarning?: (message: string) => void;

    constructor(
        parser: SwaggerParser,
        project: Project,
        config: GeneratorConfig,
        onWarning?: (message: string) => void,
    ) {
        this.config = config;
        this.project = project;
        this.parser = parser;
        this.onWarning = onWarning;
        this.methodGenerator = new ServiceMethodGenerator(config);
    }

    async generate(outputRoot: string) {
        const outputDir = path.join(outputRoot, "services");
        const paths = this.parser.getNormalizedSpec().operations;

        if (paths.length === 0) {
            this.onWarning?.("No API paths found in the specification");
            return;
        }

        const controllerGroups = this.groupPathsByController(paths);

        if (this.config.options.useSingleRequestParameter) {
            const requestParamsGenerator = new RequestParamsGenerator(this.project, this.config);
            this.requestObjects = requestParamsGenerator.buildRegistry(controllerGroups, (operation) =>
                this.methodGenerator.generateMethodName(operation),
            );
            // Must run before the service files so fixMissingImports can resolve the interfaces
            requestParamsGenerator.generate(outputRoot);
        }

        await Promise.all(
            Object.entries(controllerGroups).map(([controllerName, operations]) =>
                this.generateServiceFile(controllerName, operations, outputDir),
            ),
        );
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
        const fileName = `${camelCase(controllerName)}.service.ts`;
        const filePath = path.join(outputDir, fileName);

        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        this.addServiceClass(sourceFile, controllerName, operations);

        sourceFile.fixMissingImports().formatText(); //TODO: add models
        sourceFile.insertText(0, SERVICE_GENERATOR_HEADER_COMMENT(controllerName));
        sourceFile.saveSync();
    }

    private addServiceClass(sourceFile: SourceFile, controllerName: string, operations: NormalizedOperation[]): void {
        const className = getServiceClassName(controllerName, this.config.options.naming?.services);
        const basePathTokenName = getBasePathTokenName(this.config.clientName);
        const clientContextTokenName = getClientContextTokenName(this.config.clientName);
        const serviceDecorator = emitServiceDecorator(this.config.options);


        sourceFile.addImportDeclarations([
            {
                namedImports: [
                    "HttpClient",
                    "HttpContext",
                    "HttpContextToken",
                    "HttpEvent",
                    "HttpHeaders",
                    "HttpParams",
                    "HttpResponse",
                ],
                moduleSpecifier: "@angular/common/http",
            },
            {
                namedImports: ["inject", serviceDecorator.namedImport],
                moduleSpecifier: "@angular/core",
            },
            {
                namedImports: ["Observable"],
                moduleSpecifier: "rxjs",
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
            name: "httpClient",
            type: "HttpClient",
            scope: Scope.Private,
            isReadonly: true,
            initializer: "inject(HttpClient)",
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
            this.methodGenerator.addServiceMethod(serviceClass, operation, this.requestObjects?.get(operation));
        });

        if (hasDuplicateFunctionNames(serviceClass.getMethods())) {
            throw new Error(
                `Duplicate method names found in service class ${className}. Please ensure unique method names for each operation.`,
            );
        }
    }
}
