import * as path from "path";

import { Project, VariableDeclarationKind } from "ts-morph";

export class AuthTokensGenerator {
    private project: Project;

    constructor(project: Project) {
        this.project = project;
    }

    generate(outputDir: string): void {
        const authDir = path.join(outputDir, "auth");
        const filePath = path.join(authDir, "auth.tokens.ts");
        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        sourceFile.addImportDeclaration({
            namedImports: ["InjectionToken"],
            moduleSpecifier: "@angular/core",
        });

        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [{
                name: "API_KEY_TOKEN",
                initializer: `new InjectionToken<string>('API_KEY')`
            }],
            leadingTrivia: `/** Injection token for the API key */\n`,
        });

        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [{
                name: "BEARER_TOKEN_TOKEN",
                initializer: `new InjectionToken<string | (() => string)>('BEARER_TOKEN')`
            }],
            leadingTrivia: `/** Injection token for the Bearer token (can be a string or a function that returns a string) */\n`,
        });

        sourceFile.formatText();
        sourceFile.saveSync();
    }
}