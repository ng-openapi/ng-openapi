import { Project, VariableDeclarationKind } from "ts-morph";
import * as path from "path";
import { GeneratorConfig } from "../../types";

export class TokenGenerator {
    private project: Project;
    private config: GeneratorConfig;

    constructor(project: Project, config: GeneratorConfig) {
        this.project = project;
        this.config = config;
    }

    generate(outputDir: string): void {
        const tokensDir = path.join(outputDir, "tokens");
        const filePath = path.join(tokensDir, "index.ts");
        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        sourceFile.addImportDeclaration({
            namedImports: ["InjectionToken"],
            moduleSpecifier: "@angular/core",
        });

        const clientName = this.config.clientName || 'DEFAULT';
        const upperCaseClientName = clientName.toUpperCase().replace(/[^A-Z0-9]/g, '_');

        // Generate client-specific tokens
        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: `${upperCaseClientName}_BASE_PATH`,
                    initializer: `new InjectionToken<string>('${upperCaseClientName}_BASE_PATH', {
  providedIn: 'root',
  factory: () => '/api',
})`,
                },
            ],
            leadingTrivia: `/**\n * Base path token for ${clientName} client\n */\n`,
        });

        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: `${upperCaseClientName}_HTTP_CLIENT`,
                    initializer: `new InjectionToken<HttpClient>('${upperCaseClientName}_HTTP_CLIENT')`,
                },
            ],
            leadingTrivia: `/**\n * HTTP client token for ${clientName} client\n */\n`,
        });

        if (!this.config.clientName) {
            sourceFile.addVariableStatement({
                isExported: true,
                declarationKind: VariableDeclarationKind.Const,
                declarations: [
                    {
                        name: "BASE_PATH",
                        initializer: `${upperCaseClientName}_BASE_PATH`,
                    },
                ],
                leadingTrivia: `/**\n * @deprecated Use ${upperCaseClientName}_BASE_PATH instead\n */\n`,
            });
        }

        sourceFile.saveSync();
    }
}
