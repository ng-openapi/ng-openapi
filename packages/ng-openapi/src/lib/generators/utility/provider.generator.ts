import { Project } from "ts-morph";
import * as path from "path";
import { GeneratorConfig } from "../../types";
import { PROVIDER_GENERATOR_HEADER_COMMENT } from "../../config";

export class ProviderGenerator {
    private project: Project;
    private config: GeneratorConfig;

    constructor(project: Project, config: GeneratorConfig) {
        this.project = project;
        this.config = config;
    }

    generate(outputDir: string): void {
        const filePath = path.join(outputDir, "providers.ts");
        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        // Add header comment
        sourceFile.insertText(0, PROVIDER_GENERATOR_HEADER_COMMENT);

        // Add imports
        sourceFile.addImportDeclarations([
            {
                namedImports: ["EnvironmentProviders", "Provider", "makeEnvironmentProviders"],
                moduleSpecifier: "@angular/core",
            },
            {
                namedImports: ["HTTP_INTERCEPTORS"],
                moduleSpecifier: "@angular/common/http",
            },
            {
                namedImports: ["BASE_PATH"],
                moduleSpecifier: "./tokens",
            },
        ]);

        // Add conditional import for DateInterceptor if date transformation is enabled
        if (this.config.options.dateType === "Date") {
            sourceFile.addImportDeclaration({
                namedImports: ["DateInterceptor"],
                moduleSpecifier: "./utils/date-transformer",
            });
        }

        // Add config interface
        sourceFile.addInterface({
            name: "NgOpenapiConfig",
            isExported: true,
            docs: ["Configuration options for ng-openapi providers"],
            properties: [
                {
                    name: "basePath",
                    type: "string",
                    docs: ["Base API URL"],
                },
                {
                    name: "enableDateTransform",
                    type: "boolean",
                    hasQuestionToken: true,
                    docs: ["Enable automatic date transformation (default: true)"],
                }
            ],
        });

        // Add main provider function
        this.addMainProviderFunction(sourceFile);

        // Add async provider function
        this.addAsyncProviderFunction(sourceFile);

        sourceFile.saveSync();
    }

    private addMainProviderFunction(sourceFile: any): void {
        const hasDateInterceptor = this.config.options.dateType === "Date";

        const functionBody = `
const providers: Provider[] = [
    // Base path token
    {
        provide: BASE_PATH,
        useValue: config.basePath
    }
];

${hasDateInterceptor ?
            `// Add date interceptor if enabled (default: true)
if (config.enableDateTransform !== false) {
    providers.push({
        provide: HTTP_INTERCEPTORS,
        useClass: DateInterceptor,
        multi: true
    });
}` :
            `// Date transformation not available (dateType: 'string' was used in generation)`}

return makeEnvironmentProviders(providers);`;

        sourceFile.addFunction({
            name: "provideNgOpenapi",
            isExported: true,
            docs: [
                "Provides all necessary configuration for ng-openapi generated services",
                "",
                "@example",
                "```typescript",
                "// In your app.config.ts",
                "import { provideNgOpenapi } from './api/providers';",
                "",
                "export const appConfig: ApplicationConfig = {",
                "  providers: [",
                "    provideNgOpenapi({",
                "      basePath: 'https://api.example.com'",
                "    }),",
                "    // other providers...",
                "  ]",
                "};",
                "```"
            ],
            parameters: [
                {
                    name: "config",
                    type: "NgOpenapiConfig"
                }
            ],
            returnType: "EnvironmentProviders",
            statements: functionBody
        });
    }

    private addAsyncProviderFunction(sourceFile: any): void {
        const hasDateInterceptor = this.config.options.dateType === "Date";

        const functionBody = `
const providers: Provider[] = [];

// Handle async base path
if (typeof config.basePath === 'string') {
    providers.push({
        provide: BASE_PATH,
        useValue: config.basePath
    });
} else {
    providers.push({
        provide: BASE_PATH,
        useFactory: config.basePath
    });
}

${hasDateInterceptor ?
            `// Add date interceptor if enabled (default: true)
if (config.enableDateTransform !== false) {
    providers.push({
        provide: HTTP_INTERCEPTORS,
        useClass: DateInterceptor,
        multi: true
    });
}` :
            `// Date transformation not available (dateType: 'string' was used in generation)`}

return makeEnvironmentProviders(providers);`;

        sourceFile.addFunction({
            name: "provideNgOpenapiAsync",
            isExported: true,
            docs: [
                "Alternative function for cases where you need to handle async configuration",
                "",
                "@example",
                "```typescript",
                "// In your app.config.ts",
                "import { provideNgOpenapiAsync } from './api/providers';",
                "",
                "export const appConfig: ApplicationConfig = {",
                "  providers: [",
                "    provideNgOpenapiAsync({",
                "      basePath: () => import('./config').then(c => c.apiConfig.baseUrl)",
                "    }),",
                "    // other providers...",
                "  ]",
                "};",
                "```"
            ],
            parameters: [
                {
                    name: "config",
                    type: `{
  basePath: string | (() => Promise<string>);
  enableDateTransform?: boolean;
}`
                }
            ],
            returnType: "EnvironmentProviders",
            statements: functionBody
        });
    }
}