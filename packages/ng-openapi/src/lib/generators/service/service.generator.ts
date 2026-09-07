import { Project, Scope, SourceFile } from "ts-morph";
import {
    camelCase,
    describeOperation,
    quoteLiteral,
    effectiveClientName,
    emitServiceDecorator,
    GeneratorConfig,
    getBasePathTokenName,
    getClientContextTokenName,
    getServiceClassName,
    assertDistinctMemberNames,
    groupOperationsByController,
    reservedMemberCollision,
    resolveArgumentNames,
    SERVICE_ARGUMENT_PROFILE,
    NormalizedOperation,
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

        const controllerGroups = groupOperationsByController(paths, this.onWarning);

        if (this.config.options.useSingleRequestParameter) {
            const requestParamsGenerator = new RequestParamsGenerator(this.project, this.config, this.onWarning);
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

    private async generateServiceFile(controllerName: string, operations: NormalizedOperation[], outputDir: string) {
        const fileName = `${camelCase(controllerName)}.service.ts`;
        const filePath = path.join(outputDir, fileName);

        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        this.addServiceClass(sourceFile, controllerName, operations);

        sourceFile.fixMissingImports().formatText(); //TODO: add models
        sourceFile.insertText(0, SERVICE_GENERATOR_HEADER_COMMENT(controllerName));
    }

    /**
     * Header and cookie parameters are carried on the operation (the zod plugin
     * validates them) but the client generators never bind them — callers pass
     * headers through the trailing options parameter instead.
     *
     * Only `required` ones warn. An optional header genuinely is expressible
     * through options, so warning about every one would bury the real case:
     * a required parameter that the generated signature does not mention at all,
     * leaving callers no indication the request will be rejected without it.
     */
    private warnAboutUnboundParameters(operation: NormalizedOperation): void {
        for (const param of operation.parameters ?? []) {
            if (param.in === "path" || param.in === "query") {
                continue;
            }
            if (param.in === "header" || param.in === "cookie") {
                // Expressible through the trailing options parameter, so only a
                // required one — which the signature then fails to mention — warns.
                if (param.required) {
                    this.onWarning?.(
                        `Required ${param.in} parameter "${param.name}" of ${describeOperation(operation)} is not emitted ` +
                            `as a method parameter — callers must pass it through the trailing options parameter.`,
                    );
                }
                continue;
            }
            // formData and body are the Swagger 2.0 spellings, and there is no
            // options escape hatch for them: the parameter simply vanished from
            // the signature, the URL and the query string, and a required upload
            // reported success. Any other value is not a location at all.
            const kind =
                param.in === "formData" || param.in === "body"
                    ? `Swagger 2.0 \`in: ${param.in}\``
                    : `\`in: ${String(param.in)}\``;
            this.onWarning?.(
                `${kind} parameter "${param.name}" of ${describeOperation(operation)} is not supported and was dropped` +
                    (param.required ? " (it is marked required)" : "") +
                    `. Describe it as a requestBody, or as a path or query parameter, to have it generated.`,
            );
        }
    }

    /**
     * A renamed argument is part of the method's public signature, and the
     * suffix depends on which other arguments the operation has — so adding or
     * removing one renumbers the survivor and breaks call sites. Silent is the
     * one thing that must not happen.
     */
    private warnAboutRenamedArguments(operation: NormalizedOperation): void {
        const { renamed, merged } = resolveArgumentNames(operation, this.config, SERVICE_ARGUMENT_PROFILE);
        for (const { source, identifier } of renamed) {
            this.onWarning?.(
                `Parameter "${source}" of ${describeOperation(operation)} is exposed as "${identifier}" — ` +
                    `its natural name is already taken by another parameter or by the method itself. ` +
                    `Renaming it in the spec keeps the generated signature stable.`,
            );
        }
        for (const wireName of merged) {
            this.onWarning?.(
                `Parameter "${wireName}" of ${describeOperation(operation)} is declared in more than one ` +
                    `location; they collapse into one argument, so the first declaration's type wins and the ` +
                    `same value is sent for both.`,
            );
        }
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
return context.set(this.clientContextToken, ${quoteLiteral(effectiveClientName(this.config.clientName))});`,
        });

        // Generate methods for each operation
        operations.forEach((operation) => {
            this.warnAboutRenamedArguments(operation);
            this.warnAboutUnboundParameters(operation);
            this.warnAboutReservedMethodName(operation);
            this.methodGenerator.addServiceMethod(serviceClass, operation, this.requestObjects?.get(operation));
        });

        assertDistinctMemberNames(serviceClass, className, operations, (op) =>
            this.methodGenerator.generateMethodName(op),
        );
    }

    /**
     * A derived method name that landed on a member the class binds itself is
     * prefixed rather than rejected — the spec is valid — but the rename is
     * public signature and must be said out loud.
     */
    private warnAboutReservedMethodName(operation: NormalizedOperation): void {
        const collision = reservedMemberCollision(operation, this.config);
        if (collision) {
            this.onWarning?.(
                `Operation ${describeOperation(operation)} would be named "${collision.from}", which the generated ` +
                    `class already binds — it is emitted as "${collision.to}". Rename the operationId to choose the name.`,
            );
        }
    }
}
