import { Project } from "ts-morph";
import * as path from "path";
import {
    GeneratorConfig,
    getBasePathTokenName,
    getInterceptorsTokenName,
    PROVIDER_GENERATOR_HEADER_COMMENT,
} from "@ng-openapi/shared";

export class ProviderGenerator {
    private project: Project;
    private config: GeneratorConfig;
    private clientName: string;

    constructor(project: Project, config: GeneratorConfig) {
        this.project = project;
        this.config = config;
        this.clientName = config.clientName || "default";
    }

    generate(outputDir: string): void {
        const filePath = path.join(outputDir, "providers.ts");
        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        sourceFile.insertText(0, PROVIDER_GENERATOR_HEADER_COMMENT);

        const basePathTokenName = getBasePathTokenName(this.clientName);
        const interceptorsTokenName = getInterceptorsTokenName(this.clientName);
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
                    type: "(new (...args: HttpInterceptor[]) => HttpInterceptor)[]",
                    hasQuestionToken: true,
                    docs: ["Array of HTTP interceptor classes to apply to this client"],
                },
            ],
        });

        // Add main provider function
        this.addMainProviderFunction(sourceFile, basePathTokenName, interceptorsTokenName, baseInterceptorClassName);

        sourceFile.formatText();
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
    // Base interceptor that handles client-specific interceptors
    {
        provide: HTTP_INTERCEPTORS,
        useClass: ${baseInterceptorClassName},
        multi: true
    }
];

// Add client-specific interceptor instances
if (config.interceptors && config.interceptors.length > 0) {
    const interceptorInstances = config.interceptors.map(InterceptorClass => new InterceptorClass());
    
    ${
        hasDateInterceptor
            ? `// Add date interceptor if enabled (default: true)
    if (config.enableDateTransform !== false) {
        interceptorInstances.unshift(new DateInterceptor());
    }`
            : `// Date transformation not available (dateType: 'string' was used in generation)`
    }
    
    providers.push({
        provide: ${interceptorsTokenName},
        useValue: interceptorInstances
    });
} ${
            hasDateInterceptor
                ? `else if (config.enableDateTransform !== false) {
    // Only date interceptor enabled
    providers.push({
        provide: ${interceptorsTokenName},
        useValue: [new DateInterceptor()]
    });
}`
                : ``
        } else {
    // No interceptors
    providers.push({
        provide: ${interceptorsTokenName},
        useValue: []
    });
}

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
                "      interceptors: [AuthInterceptor, LoggingInterceptor] // Classes, not instances",
                "    }),",
                "    // other providers...",
                "  ]",
                "};",
                "```",
            ],
            parameters: [
                {
                    name: "config",
                    type: configTypeName,
                },
            ],
            returnType: "EnvironmentProviders",
            statements: functionBody,
        });

        // For backward compatibility, add generic provider if this is the default client
        if (this.clientName === "default") {
            sourceFile.addFunction({
                name: "provideNgOpenapi",
                isExported: true,
                docs: [
                    "@deprecated Use provideDefaultClient instead for better clarity",
                    "Provides configuration for the default client",
                ],
                parameters: [
                    {
                        name: "config",
                        type: configTypeName,
                    },
                ],
                returnType: "EnvironmentProviders",
                statements: `return ${functionName}(config);`,
            });
        }
    }

    private capitalizeFirst(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}
