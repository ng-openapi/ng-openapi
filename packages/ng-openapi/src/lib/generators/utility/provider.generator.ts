import { Project } from "ts-morph";
import * as path from "path";
import { GeneratorConfig } from "../../types";
import { PROVIDER_GENERATOR_HEADER_COMMENT } from "../../config";

export class ProviderGenerator {
    private project: Project;
    private config: GeneratorConfig;
    private clientName: string;

    constructor(project: Project, config: GeneratorConfig) {
        this.project = project;
        this.config = config;
        this.clientName = config.clientName || 'default';
    }

    generate(outputDir: string): void {
        const filePath = path.join(outputDir, "providers.ts");
        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        sourceFile.insertText(0, PROVIDER_GENERATOR_HEADER_COMMENT);

        const basePathTokenName = this.getBasePathTokenName();
        const interceptorsTokenName = this.getInterceptorsTokenName();
        const baseInterceptorClassName = `${this.capitalizeFirst(this.clientName)}BaseInterceptor`;

        // Add imports
        sourceFile.addImportDeclarations([
            {
                namedImports: ["EnvironmentProviders", "Provider", "makeEnvironmentProviders"],
                moduleSpecifier: "@angular/core",
            },
            {
                namedImports: ["HTTP_INTERCEPTORS", "HttpInterceptor"],
                moduleSpecifier: "@angular/common/http",
            },
            {
                namedImports: [basePathTokenName, interceptorsTokenName],
                moduleSpecifier: "./tokens",
            },
            {
                namedImports: [baseInterceptorClassName],
                moduleSpecifier: "./utils/base-interceptor",
            },
        ]);

        // Add conditional import for DateInterceptor
        if (this.config.options.dateType === "Date") {
            sourceFile.addImportDeclaration({
                namedImports: ["DateInterceptor"],
                moduleSpecifier: "./utils/date-transformer",
            });
        }

        // Add config interface
        sourceFile.addInterface({
            name: `${this.capitalizeFirst(this.clientName)}Config`,
            isExported: true,
            docs: [`Configuration options for ${this.clientName} client`],
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
                },
                {
                    name: "interceptors",
                    type: "HttpInterceptor[]",
                    hasQuestionToken: true,
                    docs: ["Array of HTTP interceptors to apply to this client"],
                }
            ],
        });

        // Add main provider function
        this.addMainProviderFunction(sourceFile, basePathTokenName, interceptorsTokenName, baseInterceptorClassName);

        sourceFile.saveSync();
    }

    private addMainProviderFunction(
        sourceFile: any,
        basePathTokenName: string,
        interceptorsTokenName: string,
        baseInterceptorClassName: string
    ): void {
        const hasDateInterceptor = this.config.options.dateType === "Date";
        const functionName = `provide${this.capitalizeFirst(this.clientName)}Client`;
        const configTypeName = `${this.capitalizeFirst(this.clientName)}Config`;

        const functionBody = `
const providers: Provider[] = [
    // Base path token for this client
    {
        provide: ${basePathTokenName},
        useValue: config.basePath
    },
    // Client-specific interceptors token
    {
        provide: ${interceptorsTokenName},
        useValue: config.interceptors || []
    },
    // Base interceptor that handles client-specific interceptors
    {
        provide: HTTP_INTERCEPTORS,
        useClass: ${baseInterceptorClassName},
        multi: true
    }
];

${hasDateInterceptor ?
            `// Add date interceptor to client-specific interceptors if enabled
if (config.enableDateTransform !== false) {
    const currentInterceptors = config.interceptors || [];
    providers.push({
        provide: ${interceptorsTokenName},
        useValue: [new DateInterceptor(), ...currentInterceptors]
    });
}` :
            `// Date transformation not available (dateType: 'string' was used in generation)`}

return makeEnvironmentProviders(providers);`;

        sourceFile.addFunction({
            name: functionName,
            isExported: true,
            docs: [
                `Provides configuration for ${this.clientName} client`,
                "",
                "@example",
                "```typescript",
                "// In your app.config.ts",
                `import { ${functionName} } from './api/providers';`,
                "",
                "export const appConfig: ApplicationConfig = {",
                "  providers: [",
                `    ${functionName}({`,
                "      basePath: 'https://api.example.com',",
                "      interceptors: [new LoggingInterceptor(), new AuthInterceptor()]",
                "    }),",
                "    // other providers...",
                "  ]",
                "};",
                "```"
            ],
            parameters: [
                {
                    name: "config",
                    type: configTypeName
                }
            ],
            returnType: "EnvironmentProviders",
            statements: functionBody
        });

        // For backward compatibility, add generic provider if this is the default client
        if (this.clientName === 'default') {
            sourceFile.addFunction({
                name: "provideNgOpenapi",
                isExported: true,
                docs: [
                    "@deprecated Use provideDefaultClient instead for better clarity",
                    "Provides configuration for the default client"
                ],
                parameters: [
                    {
                        name: "config",
                        type: configTypeName
                    }
                ],
                returnType: "EnvironmentProviders",
                statements: `return ${functionName}(config);`
            });
        }
    }

    private getBasePathTokenName(): string {
        const clientSuffix = this.clientName.toUpperCase().replace(/[^A-Z0-9]/g, '_');
        return `BASE_PATH_${clientSuffix}`;
    }

    private getInterceptorsTokenName(): string {
        const clientSuffix = this.clientName.toUpperCase().replace(/[^A-Z0-9]/g, '_');
        return `HTTP_INTERCEPTORS_${clientSuffix}`;
    }

    private capitalizeFirst(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}