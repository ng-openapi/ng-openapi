import { Project, Scope } from "ts-morph";
import * as path from "path";
import { BASE_INTERCEPTOR_HEADER_COMMENT } from "@ng-openapi/shared";

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

        const interceptorsTokenName = this.getInterceptorsTokenName();
        const clientContextTokenName = this.getClientContextTokenName();

        sourceFile.addImportDeclarations([
            {
                namedImports: ["HttpEvent", "HttpHandler", "HttpInterceptor", "HttpRequest", "HttpContextToken"],
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
                namedImports: [interceptorsTokenName, clientContextTokenName],
                moduleSpecifier: "../tokens",
            },
        ]);

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
    // Check if this request belongs to this client using HttpContext
    if (!req.context.has(this.clientContextToken)) {
      // This request doesn't belong to this client, pass it through
      return next.handle(req);
    }

    // Apply client-specific interceptors in reverse order
    let handler = next;

    handler = this.httpInterceptors.reduceRight(
      (next, interceptor) => ({
        handle: (request: HttpRequest<any>) => interceptor.intercept(request, next)
      }),
      handler
    );

    return handler.handle(req);`,
                },
            ],
        });

        sourceFile.formatText();
        sourceFile.saveSync();
    }

    private getInterceptorsTokenName(): string {
        const clientSuffix = this.#clientName.toUpperCase().replace(/[^A-Z0-9]/g, "_");
        return `HTTP_INTERCEPTORS_${clientSuffix}`;
    }

    private getClientContextTokenName(): string {
        const clientSuffix = this.#clientName.toUpperCase().replace(/[^A-Z0-9]/g, "_");
        return `CLIENT_CONTEXT_TOKEN_${clientSuffix}`;
    }

    private capitalizeFirst(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}
