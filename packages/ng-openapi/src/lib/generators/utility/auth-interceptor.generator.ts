import * as path from "path";
import { Project } from "ts-morph";
import { SwaggerParser, SecurityScheme } from "@ng-openapi/shared";

export class AuthInterceptorGenerator {
    private project: Project;
    private parser: SwaggerParser;

    constructor(parser: SwaggerParser, project: Project) {
        this.project = project;
        this.parser = parser;
    }

    generate(outputDir: string): void {
        const securitySchemes = this.parser.getSecuritySchemes();
        if (!securitySchemes || Object.keys(securitySchemes).length === 0) {
            return; // No security schemes, no interceptor needed.
        }

        const authDir = path.join(outputDir, "auth");
        const filePath = path.join(authDir, "auth.interceptor.ts");
        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        sourceFile.addImportDeclarations([
            { namedImports: ["HttpEvent", "HttpHandler", "HttpInterceptor", "HttpRequest"], moduleSpecifier: "@angular/common/http" },
            { namedImports: ["inject", "Injectable"], moduleSpecifier: "@angular/core" },
            { namedImports: ["Observable"], moduleSpecifier: "rxjs" },
            { namedImports: ["API_KEY_TOKEN", "BEARER_TOKEN_TOKEN"], moduleSpecifier: "./auth.tokens" }
        ]);

        const interceptorClass = sourceFile.addClass({
            name: `AuthInterceptor`,
            isExported: true,
            decorators: [{ name: "Injectable", arguments: [] }],
            implements: ["HttpInterceptor"],
        });

        // Inject tokens optionally
        interceptorClass.addProperty({
            name: "apiKey", isReadonly: true,
            initializer: `inject(API_KEY_TOKEN, { optional: true })`
        });
        interceptorClass.addProperty({
            name: "bearerToken", isReadonly: true,
            initializer: `inject(BEARER_TOKEN_TOKEN, { optional: true })`
        });

        // Build the intercept method
        let statements = `let authReq = req;`;
        const securityConfigs: string[] = [];

        for (const scheme of Object.values(securitySchemes)) {
            if (scheme.type === 'apiKey' && scheme.in === 'header' && scheme.name) {
                securityConfigs.push(`if (this.apiKey) {
      authReq = authReq.clone({ setHeaders: { '${scheme.name}': this.apiKey } });
    }`);
            } else if (scheme.type === 'apiKey' && scheme.in === 'query' && scheme.name) {
                securityConfigs.push(`
    if (this.apiKey) {
      authReq = authReq.clone({ setParams: { '${scheme.name}': this.apiKey } });
    }`);
            } else if ((scheme.type === 'http' && scheme.scheme === 'bearer') || scheme.type === 'oauth2') {
                const Authorization = '`Bearer ${token}`';
                securityConfigs.push(`if (this.bearerToken) {
      const token = typeof this.bearerToken === 'function' ? this.bearerToken() : this.bearerToken;
      authReq = authReq.clone({ setHeaders: { 'Authorization': ${Authorization} } });
    }`);
            }
        }

        statements += securityConfigs.join(' else ');
        statements += `\n\n    return next.handle(authReq);`;

        interceptorClass.addMethod({
            name: "intercept",
            parameters: [
                { name: "req", type: "HttpRequest<any>" },
                { name: "next", type: "HttpHandler" },
            ],
            returnType: "Observable<HttpEvent<any>>",
            statements: statements,
        });

        sourceFile.formatText();
        sourceFile.saveSync();
    }
}
