import { Project, VariableDeclarationKind } from "ts-morph";
import * as path from "path";
import {
    effectiveClientName,
    escapeJsDoc,
    getBasePathTokenName,
    getClientContextTokenName,
    getInterceptorsTokenName,
    quoteLiteral,
} from "@ng-openapi/shared";

export class TokenGenerator {
    private project: Project;
    private clientName: string;

    constructor(project: Project, clientName?: string) {
        this.project = project;
        this.clientName = effectiveClientName(clientName);
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
                namedImports: ["HttpInterceptor", "HttpContextToken"],
                moduleSpecifier: "@angular/common/http",
            },
        ]);

        // Generate client-specific tokens
        const basePathTokenName = getBasePathTokenName(this.clientName);
        const interceptorsTokenName = getInterceptorsTokenName(this.clientName);
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
 * Injection token for the ${escapeJsDoc(this.clientName)} client base API path
 */\n`,
        });

        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: interceptorsTokenName,
                    initializer: `new InjectionToken<HttpInterceptor[]>('${interceptorsTokenName}', {
  providedIn: 'root',
  factory: () => [], // Default empty array
})`,
                },
            ],
            leadingTrivia: `/**
 * Injection token for the ${escapeJsDoc(this.clientName)} client HTTP interceptor instances
 */\n`,
        });

        // Add HttpContextToken for client identification
        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: clientContextTokenName,
                    initializer: `new HttpContextToken<string>(() => ${quoteLiteral(this.clientName)})`,
                },
            ],
            leadingTrivia: `/**
 * HttpContext token to identify requests belonging to the ${escapeJsDoc(this.clientName)} client
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
    }
}
