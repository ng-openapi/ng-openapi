import { Project, VariableDeclarationKind } from "ts-morph";
import * as path from "path";
import { getBasePathTokenName, getClientContextTokenName, getInterceptorFnsTokenName } from "@ng-openapi/shared";

export class TokenGenerator {
    private project: Project;
    private clientName: string;

    constructor(project: Project, clientName = "default") {
        this.project = project;
        this.clientName = clientName;
    }

    generate(outputDir: string): void {
        const tokensDir = path.join(outputDir, "tokens");
        const filePath = path.join(tokensDir, "index.ts");

        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        sourceFile.addImportDeclarations([
            {
                namedImports: ["InjectionToken"],
                moduleSpecifier: "@angular/core",
            },
            {
                namedImports: ["HttpInterceptorFn", "HttpContextToken"],
                moduleSpecifier: "@angular/common/http",
            },
        ]);

        // Generate client-specific tokens
        const basePathTokenName = getBasePathTokenName(this.clientName);
        const interceptorFnsTokenName = getInterceptorFnsTokenName(this.clientName);
        const clientContextTokenName = getClientContextTokenName(this.clientName);

        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: basePathTokenName,
                    initializer: `new InjectionToken<string>('${basePathTokenName}', {
  providedIn: 'root',
  factory: () => '/api', // Default fallback
})`,
                },
            ],
            leadingTrivia: `/**
 * Injection token for the ${this.clientName} client base API path
 */\n`,
        });

        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: interceptorFnsTokenName,
                    initializer: `new InjectionToken<HttpInterceptorFn[]>('${interceptorFnsTokenName}', {
  providedIn: 'root',
  factory: () => [], // Default empty array
})`,
                },
            ],
            leadingTrivia: `/**
 * Injection token carrying the ${this.clientName} client's scoped interceptor chain,
 * normalized to functional interceptors. Populated by the client's provide function.
 */\n`,
        });

        // Add HttpContextToken for client identification
        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: clientContextTokenName,
                    initializer: `new HttpContextToken<string>(() => '${this.clientName}')`,
                },
            ],
            leadingTrivia: `/**
 * HttpContext token to identify requests belonging to the ${this.clientName} client
 */\n`,
        });

        // For backward compatibility, export BASE_PATH for default client
        if (this.clientName === "default") {
            sourceFile.addVariableStatement({
                isExported: true,
                declarationKind: VariableDeclarationKind.Const,
                declarations: [
                    {
                        name: "BASE_PATH",
                        initializer: basePathTokenName,
                    },
                ],
                leadingTrivia: `/**
 * @deprecated Use ${basePathTokenName} instead
 */\n`,
            });

            sourceFile.addVariableStatement({
                isExported: true,
                declarationKind: VariableDeclarationKind.Const,
                declarations: [
                    {
                        name: "CLIENT_CONTEXT_TOKEN",
                        initializer: clientContextTokenName,
                    },
                ],
                leadingTrivia: `/**
 * @deprecated Use ${clientContextTokenName} instead
 */\n`,
            });
        }

        sourceFile.formatText();
        sourceFile.saveSync();
    }
}
