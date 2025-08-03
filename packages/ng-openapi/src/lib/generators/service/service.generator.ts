import { MethodDeclaration, Project, Scope, SourceFile } from "ts-morph";
import { SwaggerParser } from "../../core";
import * as path from "path";
import { SERVICE_GENERATOR_HEADER_COMMENT } from "../../config";
import { GeneratorConfig, Parameter, PathInfo, RequestBody, SwaggerResponse, SwaggerSpec } from "../../types";
import { camelCase, pascalCase } from "../../utils";
import { ServiceMethodGenerator } from "./service-method.generator";

export class ServiceGenerator {
    private project: Project;
    private parser: SwaggerParser;
    private spec: SwaggerSpec;
    private config: GeneratorConfig;
    private methodGenerator: ServiceMethodGenerator;

    constructor(swaggerPath: string, project: Project, config: GeneratorConfig) {
        this.config = config;
        this.project = project;
        this.parser = new SwaggerParser(swaggerPath);

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

        this.methodGenerator = new ServiceMethodGenerator(config);
    }

    generate(outputRoot: string): void {
        const outputDir = path.join(outputRoot, "services");
        const paths = this.extractPaths();

        if (paths.length === 0) {
            console.warn("No API paths found in the specification");
            return;
        }

        const controllerGroups = this.groupPathsByController(paths);

        Object.entries(controllerGroups).forEach(([controllerName, operations]) => {
            this.generateServiceFile(controllerName, operations, outputDir);
        });

        console.log(`Generated ${Object.keys(controllerGroups).length} service(s) from ${paths.length} path(s)`);
    }

    private extractPaths(): PathInfo[] {
        const paths: PathInfo[] = [];
        const swaggerPaths = this.spec.paths || {};

        Object.entries(swaggerPaths).forEach(([path, pathItem]: [string, any]) => {
            const methods = ["get", "post", "put", "patch", "delete", "options", "head"];

            methods.forEach((method) => {
                if (pathItem[method]) {
                    const operation = pathItem[method];
                    paths.push({
                        path,
                        method: method.toUpperCase(),
                        operationId: operation.operationId,
                        summary: operation.summary,
                        description: operation.description,
                        tags: operation.tags || [],
                        parameters: this.parseParameters(operation.parameters || [], pathItem.parameters || []),
                        requestBody: operation.requestBody,
                        responses: operation.responses || {},
                    });
                }
            });
        });

        return paths;
    }

    private parseParameters(operationParams: any[], pathParams: any[]): Parameter[] {
        const allParams = [...pathParams, ...operationParams];
        return allParams.map((param) => ({
            name: param.name,
            in: param.in,
            required: param.required || param.in === "path",
            schema: param.schema,
            type: param.type,
            format: param.format,
            description: param.description,
        }));
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

    private generateServiceFile(controllerName: string, operations: PathInfo[], outputDir: string): void {
        const fileName = `${camelCase(controllerName)}.service.ts`;
        const filePath = path.join(outputDir, fileName);

        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        // Collect all used model types first
        const usedTypes = this.collectUsedTypes(operations);

        this.addImports(sourceFile, usedTypes);
        this.addServiceClass(sourceFile, controllerName, operations);

        sourceFile.saveSync();
    }

    private collectUsedTypes(operations: PathInfo[]): Set<string> {
        const usedTypes = new Set<string>();

        operations.forEach((operation) => {
            // Check parameters
            operation.parameters?.forEach((param) => {
                this.collectTypesFromSchema(param.schema || param, usedTypes);
            });

            // Check request body
            if (operation.requestBody) {
                this.collectTypesFromRequestBody(operation.requestBody, usedTypes);
            }

            // Check responses
            if (operation.responses) {
                Object.values(operation.responses).forEach((response) => {
                    this.collectTypesFromResponse(response, usedTypes);
                });
            }
        });

        return usedTypes;
    }

    private collectTypesFromSchema(schema: any, usedTypes: Set<string>): void {
        if (!schema) return;

        if (schema.$ref) {
            const refName = schema.$ref.split("/").pop();
            if (refName) {
                usedTypes.add(pascalCase(refName));
            }
        }

        if (schema.type === "array" && schema.items) {
            this.collectTypesFromSchema(schema.items, usedTypes);
        }

        if (schema.type === "object" && schema.properties) {
            Object.values(schema.properties).forEach((prop) => {
                this.collectTypesFromSchema(prop, usedTypes);
            });
        }

        if (schema.allOf) {
            schema.allOf.forEach((subSchema: any) => {
                this.collectTypesFromSchema(subSchema, usedTypes);
            });
        }

        if (schema.oneOf) {
            schema.oneOf.forEach((subSchema: any) => {
                this.collectTypesFromSchema(subSchema, usedTypes);
            });
        }

        if (schema.anyOf) {
            schema.anyOf.forEach((subSchema: any) => {
                this.collectTypesFromSchema(subSchema, usedTypes);
            });
        }
    }

    private collectTypesFromRequestBody(requestBody: RequestBody, usedTypes: Set<string>): void {
        const content = requestBody.content || {};
        Object.values(content).forEach((mediaType) => {
            if (mediaType.schema) {
                this.collectTypesFromSchema(mediaType.schema, usedTypes);
            }
        });
    }

    private collectTypesFromResponse(response: SwaggerResponse, usedTypes: Set<string>): void {
        const content = response.content || {};
        Object.values(content).forEach((mediaType) => {
            if (mediaType.schema) {
                this.collectTypesFromSchema(mediaType.schema, usedTypes);
            }
        });
    }

    private addImports(sourceFile: SourceFile, usedTypes: Set<string>): void {
        const basePathTokenName = this.getBasePathTokenName();
        const clientContextTokenName = this.getClientContextTokenName();

        sourceFile.addImportDeclarations([
            {
                namedImports: ["Injectable", "inject"],
                moduleSpecifier: "@angular/core",
            },
            {
                namedImports: ["HttpClient", "HttpParams", "HttpHeaders", "HttpContext", "HttpResponse", "HttpEvent"],
                moduleSpecifier: "@angular/common/http",
            },
            {
                namedImports: ["Observable"],
                moduleSpecifier: "rxjs",
            },
            {
                namedImports: [basePathTokenName, clientContextTokenName],
                moduleSpecifier: "../tokens",
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

    private addServiceClass(sourceFile: SourceFile, controllerName: string, operations: PathInfo[]): void {
        const className = `${controllerName}Service`;
        const basePathTokenName = this.getBasePathTokenName();
        const clientContextTokenName = this.getClientContextTokenName();

        sourceFile.insertText(0, SERVICE_GENERATOR_HEADER_COMMENT(controllerName));

        const serviceClass = sourceFile.addClass({
            name: className,
            isExported: true,
            decorators: [{ name: "Injectable", arguments: ['{ providedIn: "root" }'] }],
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
            type: "any",
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
            statements: `
const context = existingContext || new HttpContext();
return context.set(this.clientContextToken, '${this.config.clientName || "default"}');`,
        });

        // Generate methods for each operation
        operations.forEach((operation) => {
            this.methodGenerator.addServiceMethod(serviceClass, operation);
        });

        if (this.hasDuplicateMethodNames(serviceClass.getMethods())) {
            throw new Error(
                `Duplicate method names found in service class ${className}. Please ensure unique method names for each operation.`
            );
        }
    }

    private getClientContextTokenName(): string {
        const clientName = this.config.clientName || "default";
        const clientSuffix = clientName.toUpperCase().replace(/[^A-Z0-9]/g, "_");
        return `CLIENT_CONTEXT_TOKEN_${clientSuffix}`;
    }

    private getBasePathTokenName(): string {
        const clientName = this.config.clientName || "default";
        const clientSuffix = clientName.toUpperCase().replace(/[^A-Z0-9]/g, "_");
        return `BASE_PATH_${clientSuffix}`;
    }

    private hasDuplicateMethodNames<T extends MethodDeclaration>(arr: T[]): boolean {
        return new Set(arr.map((method) => method.getName())).size !== arr.length;
    }
}
