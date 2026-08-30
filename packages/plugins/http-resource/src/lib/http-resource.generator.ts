import { Project, Scope, SourceFile } from "ts-morph";
import {
    camelCase,
    describeOperation,
    emitServiceDecorator,
    GeneratorConfig,
    getBasePathTokenName,
    getClientContextTokenName,
    getResourceClassName,
    groupOperationsByController,
    DuplicateGeneratedNameError,
    resolveArgumentNames,
    RESOURCE_ARGUMENT_PROFILE,
    HTTP_RESOURCE_GENERATOR_HEADER_COMMENT,
    IPluginGenerator,
    NormalizedOperation,
    NormalizedSpec,

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

        const controllerGroups = groupOperationsByController(paths, this.onWarning);

        await Promise.all(
            // Must return the promise: without it Promise.all awaits [undefined],
            // and a generateServiceFile rejection escapes as an unhandled
            // rejection while generation reports success.
            Object.entries(controllerGroups).map(([controllerName, operations]) =>
                this.generateServiceFile(controllerName, operations, outputDir),
            ),
        );

        this.indexGenerator.generateIndex(outputRoot);
    }

    private async generateServiceFile(controllerName: string, operations: NormalizedOperation[], outputDir: string) {
        const fileName = `${camelCase(controllerName)}.resource.ts`;
        const filePath = path.join(outputDir, fileName);

        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });
        this.addServiceClass(sourceFile, controllerName, operations);
        sourceFile.fixMissingImports().formatText(); //TODO: add models
        sourceFile.insertText(0, HTTP_RESOURCE_GENERATOR_HEADER_COMMENT(getResourceClassName(controllerName, this.config.options.naming?.resources)));
    }

    private addServiceClass(sourceFile: SourceFile, controllerName: string, operations: NormalizedOperation[]): void {
        const className = getResourceClassName(controllerName, this.config.options.naming?.resources);
        const basePathTokenName = getBasePathTokenName(this.config.clientName);
        const clientContextTokenName = getClientContextTokenName(this.config.clientName);
        const serviceDecorator = emitServiceDecorator(this.config.options);

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
            const { renamed, merged } = resolveArgumentNames(operation, this.config, RESOURCE_ARGUMENT_PROFILE);
            for (const { source, identifier } of renamed) {
                this.onWarning?.(
                    `Parameter "${source}" of ${describeOperation(operation)} is exposed as "${identifier}" — ` +
                        `its natural name is already taken by another parameter or by the resource method itself.`,
                );
            }
            for (const wireName of merged) {
                this.onWarning?.(
                    `Parameter "${wireName}" of ${describeOperation(operation)} is declared in more than one ` +
                        `location; they collapse into one argument, so the first declaration's type wins and ` +
                        `the same value is sent for both.`,
                );
            }
            this.methodGenerator.addResourceMethod(serviceClass, operation);
        });

        const methodNames = serviceClass.getMethods().map((method) => method.getName());
        const duplicates = [...new Set(methodNames.filter((name, index) => methodNames.indexOf(name) !== index))];
        if (duplicates.length > 0) {
            // Names the operations, not just the class: the operationId is what
            // the user has to change.
            const byName = new Map(duplicates.map((name) => [name, [] as NormalizedOperation[]]));
            for (const operation of operations) {
                byName.get(this.methodGenerator.generateMethodName(operation))?.push(operation);
            }
            const detail = [...byName]
                .map(([name, ops]) => `"${name}" from ${ops.map(describeOperation).join(" and ")}`)
                .join("; ");

            throw new DuplicateGeneratedNameError(
                `Operations map to the same method name in ${className}: ${detail}. ` +
                    `Ensure each operationId maps to a unique name.`,
                duplicates,
                [...byName.values()].flat(),
            );
        }
    }
}
