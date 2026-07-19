import { Project, Scope, VariableDeclarationKind } from "ts-morph";
import * as path from "path";
import {
    BASE_INTERCEPTOR_HEADER_COMMENT,
    getBaseInterceptorClassName,
    getClientContextTokenName,
    getClientInterceptorFnName,
    getInterceptorFnsTokenName,
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

        const interceptorFnsTokenName = getInterceptorFnsTokenName(this.#clientName);
        const clientContextTokenName = getClientContextTokenName(this.#clientName);
        const interceptorFnName = getClientInterceptorFnName(this.#clientName);

        sourceFile.addImportDeclarations([
            {
                namedImports: [
                    "HttpContextToken",
                    "HttpEvent",
                    "HttpHandler",
                    "HttpHandlerFn",
                    "HttpInterceptor",
                    "HttpInterceptorFn",
                    "HttpRequest",
                ],
                moduleSpecifier: "@angular/common/http",
            },
            {
                namedImports: ["EnvironmentInjector", "inject", "Injectable", "runInInjectionContext"],
                moduleSpecifier: "@angular/core",
            },
            {
                namedImports: ["Observable"],
                moduleSpecifier: "rxjs",
            },
            {
                namedImports: [clientContextTokenName, interceptorFnsTokenName],
                moduleSpecifier: "../tokens",
            },
        ]);

        sourceFile.addFunction({
            name: "interceptClientRequest",
            parameters: [
                { name: "req", type: "HttpRequest<any>" },
                { name: "next", type: "HttpHandlerFn" },
                { name: "interceptorFns", type: "HttpInterceptorFn[]" },
                { name: "clientContextToken", type: "HttpContextToken<string>" },
                { name: "injector", type: "EnvironmentInjector" },
            ],
            returnType: "Observable<HttpEvent<any>>",
            statements: `
    // Check if this request belongs to this client using HttpContext
    if (!req.context.has(clientContextToken)) {
      // This request doesn't belong to this client, pass it through
      return next(req);
    }

    // Compose right-to-left so the interceptors run in array order. Each fn is
    // invoked inside an injection context, mirroring Angular's own interceptor
    // chain, so client interceptors can use inject().
    const chain = interceptorFns.reduceRight<HttpHandlerFn>(
      (nextFn, interceptorFn) => (request) => runInInjectionContext(injector, () => interceptorFn(request, nextFn)),
      next
    );

    return chain(req);`,
        });

        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: interceptorFnName,
                    type: "HttpInterceptorFn",
                    initializer: `(req, next) =>
  interceptClientRequest(req, next, inject(${interceptorFnsTokenName}), ${clientContextTokenName}, inject(EnvironmentInjector))`,
                },
            ],
            leadingTrivia: `/**
 * Functional interceptor running the ${this.#clientName} client's scoped interceptor chain.
 * Register it once with \`provideHttpClient(withInterceptors([${interceptorFnName}]))\`.
 * If your app also uses \`withInterceptorsFromDi()\`, pass \`registerDiInterceptor: false\`
 * to the client's provide function — otherwise the class-based registration it adds
 * would run the same chain twice.
 */\n`,
        });

        sourceFile.addClass({
            name: getBaseInterceptorClassName(this.#clientName),
            isExported: true,
            docs: [
                `Class-based equivalent of \`${interceptorFnName}\` for DI registration via\n\`withInterceptorsFromDi()\`. Register exactly one of the two variants.`,
            ],
            decorators: [
                {
                    name: "Injectable",
                    arguments: [],
                },
            ],
            implements: ["HttpInterceptor"],
            properties: [
                {
                    name: "interceptorFns",
                    type: "HttpInterceptorFn[]",
                    scope: Scope.Private,
                    isReadonly: true,
                    initializer: `inject(${interceptorFnsTokenName})`,
                },
                {
                    name: "clientContextToken",
                    type: "HttpContextToken<string>",
                    scope: Scope.Private,
                    isReadonly: true,
                    initializer: clientContextTokenName,
                },
                {
                    name: "injector",
                    type: "EnvironmentInjector",
                    scope: Scope.Private,
                    isReadonly: true,
                    initializer: "inject(EnvironmentInjector)",
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
    return interceptClientRequest(req, (request) => next.handle(request), this.interceptorFns, this.clientContextToken, this.injector);`,
                },
            ],
        });

        sourceFile.formatText();
        sourceFile.saveSync();
    }
}
