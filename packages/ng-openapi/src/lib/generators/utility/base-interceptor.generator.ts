import { Project, Scope, VariableDeclarationKind } from "ts-morph";
import * as path from "path";
import {
    BASE_INTERCEPTOR_HEADER_COMMENT,
    getClientContextTokenName,
    getInterceptorsTokenName,
} from "@ng-openapi/shared";

export class BaseInterceptorGenerator {
    readonly #project: Project;
    readonly #clientName: string;

    constructor(project: Project, clientName = "default") {
        this.#project = project;
        this.#clientName = clientName;
    }

    generate(outputDir: string): void {
        const utilsDir = path.join(outputDir, "utils");
        const filePath = path.join(utilsDir, "base-interceptor.ts");

        const sourceFile = this.#project.createSourceFile(filePath, "", { overwrite: true });

        sourceFile.insertText(0, BASE_INTERCEPTOR_HEADER_COMMENT(this.#clientName));

        const interceptorsTokenName = getInterceptorsTokenName(this.#clientName);
        const clientContextTokenName = getClientContextTokenName(this.#clientName);
        const baseInterceptorFunctionName = `${this.lowercaseFirst(this.#clientName)}BaseInterceptor`;

        sourceFile.addImportDeclarations([
            {
                namedImports: [
                    "HttpContextToken",
                    "HttpEvent",
                    "HttpHandler",
                    "HttpInterceptor",
                    "HttpInterceptorFn",
                    "HttpRequest",
                ],
                moduleSpecifier: "@angular/common/http",
            },
            {
                namedImports: ["inject", "Injectable"],
                moduleSpecifier: "@angular/core",
            },
            {
                namedImports: ["Observable"],
                moduleSpecifier: "rxjs",
            },
            {
                namedImports: [clientContextTokenName, interceptorsTokenName],
                moduleSpecifier: "../tokens",
            },
        ]);

        sourceFile.addFunction({
            name: "interceptClientRequest",
            parameters: [
                { name: "req", type: "HttpRequest<any>" },
                { name: "next", type: "HttpHandler" },
                { name: "httpInterceptors", type: "HttpInterceptor[]" },
                { name: "clientContextToken", type: "HttpContextToken<string>" },
            ],
            returnType: "Observable<HttpEvent<any>>",
            statements: `
    // Check if this request belongs to this client using HttpContext
    if (!req.context.has(clientContextToken)) {
      // This request doesn't belong to this client, pass it through
      return next.handle(req);
    }

    // Apply client-specific interceptors in reverse order
    const handler = httpInterceptors.reduceRight(
      (next, interceptor) => ({
        handle: (request: HttpRequest<any>) => interceptor.intercept(request, next)
      }),
      next
    );

    return handler.handle(req);`,
        });

        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: baseInterceptorFunctionName,
                    type: "HttpInterceptorFn",
                    initializer: `(req, next) => interceptClientRequest(
  req,
  { handle: next },
  inject(${interceptorsTokenName}),
  ${clientContextTokenName}
)`,
                },
            ],
        });

        sourceFile.addClass({
            name: `${this.capitalizeFirst(this.#clientName)}BaseInterceptor`,
            isExported: true,
            decorators: [
                {
                    name: "Injectable",
                    arguments: [],
                },
            ],
            implements: ["HttpInterceptor"],
            properties: [
                {
                    name: "httpInterceptors",
                    type: "HttpInterceptor[]",
                    scope: Scope.Private,
                    isReadonly: true,
                    initializer: `inject(${interceptorsTokenName})`,
                },
                {
                    name: "clientContextToken",
                    type: "HttpContextToken<string>",
                    scope: Scope.Private,
                    isReadonly: true,
                    initializer: clientContextTokenName,
                },
            ],
            methods: [
                {
                    name: "intercept",
                    parameters: [
                        { name: "req", type: "HttpRequest<any>" },
                        { name: "next", type: "HttpHandler" },
                    ],
                    returnType: "Observable<HttpEvent<any>>",
                    statements: `
    return interceptClientRequest(req, next, this.httpInterceptors, this.clientContextToken);`,
                },
            ],
        });

        sourceFile.formatText();
        sourceFile.saveSync();
    }

    private capitalizeFirst(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    private lowercaseFirst(str: string): string {
        return str.charAt(0).toLowerCase() + str.slice(1);
    }
}
