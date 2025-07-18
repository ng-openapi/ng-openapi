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

        sourceFile.insertText(0, PROVIDER_GENERATOR_HEADER_COMMENT);

        const clientName = this.config.clientName || 'Default';
        const pascalClientName = this.pascalCase(clientName);
        const upperCaseClientName = clientName.toUpperCase().replace(/[^A-Z0-9]/g, '_');

        // Add imports
        sourceFile.addImportDeclarations([
            {
                namedImports: ["EnvironmentProviders", "Provider", "makeEnvironmentProviders", "Type", "Injector", "inject"],
                moduleSpecifier: "@angular/core",
            },
            {
                namedImports: ["HttpClient", "HttpInterceptor", "HttpHandler", "HttpRequest"],
                moduleSpecifier: "@angular/common/http",
            },
            {
                namedImports: [`${upperCaseClientName}_BASE_PATH`, `${upperCaseClientName}_HTTP_CLIENT`],
                moduleSpecifier: "./tokens",
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
            name: `${pascalClientName}Config`,
            isExported: true,
            docs: [`Configuration options for ${clientName} API client`],
            properties: [
                {
                    name: "basePath",
                    type: "string",
                    docs: ["Base API URL"],
                },
                {
                    name: "interceptors",
                    type: "Type<HttpInterceptor>[]",
                    hasQuestionToken: true,
                    docs: ["HTTP interceptors to apply to this client's requests"],
                },
                {
                    name: "enableDateTransform",
                    type: "boolean",
                    hasQuestionToken: true,
                    docs: ["Enable automatic date transformation (default: true)"],
                }
            ],
        });

        // Add interceptor chain helper
        this.addInterceptorChainHelper(sourceFile);

        // Add main provider function
        this.addClientProviderFunction(sourceFile, pascalClientName, upperCaseClientName);

        sourceFile.saveSync();
    }

    private addInterceptorChainHelper(sourceFile: any): void {
        sourceFile.addFunction({
            name: "createHttpClientWithInterceptors",
            docs: ["Creates an HttpClient with a custom interceptor chain"],
            parameters: [
                { name: "baseClient", type: "HttpClient" },
                { name: "interceptors", type: "HttpInterceptor[]" },
            ],
            returnType: "HttpClient",
            statements: `
if (!interceptors.length) {
    return baseClient;
}

// Create a custom handler that applies interceptors in sequence
let handler = baseClient.handler;

// Apply interceptors in reverse order (last interceptor wraps the original handler)
for (let i = interceptors.length - 1; i >= 0; i--) {
    const currentHandler = handler;
    const interceptor = interceptors[i];
    
    handler = {
        handle: (req: HttpRequest<any>) => interceptor.intercept(req, currentHandler)
    };
}

// Return a new HttpClient with the custom handler
return new (baseClient.constructor as any)(handler);`,
        });
    }

    private addClientProviderFunction(sourceFile: any, pascalClientName: string, upperCaseClientName: string): void {
        const hasDateInterceptor = this.config.options.dateType === "Date";

        const functionBody = `
const providers: Provider[] = [
    // Base path token
    {
        provide: ${upperCaseClientName}_BASE_PATH,
        useValue: config.basePath
    },
    
    // HTTP client with custom interceptors
    {
        provide: ${upperCaseClientName}_HTTP_CLIENT,
        useFactory: (baseClient: HttpClient, injector: Injector) => {
            const interceptorInstances: HttpInterceptor[] = [];
            
            // Add custom interceptors
            if (config.interceptors?.length) {
                config.interceptors.forEach(interceptorClass => {
                    interceptorInstances.push(injector.get(interceptorClass));
                });
            }
            
            ${hasDateInterceptor ? `
            // Add date interceptor if enabled (default: true)
            if (config.enableDateTransform !== false) {
                interceptorInstances.push(injector.get(DateInterceptor));
            }` : ''}
            
            return createHttpClientWithInterceptors(baseClient, interceptorInstances);
        },
        deps: [HttpClient, Injector]
    }
];

return makeEnvironmentProviders(providers);`;

        sourceFile.addFunction({
            name: `provide${pascalClientName}`,
            isExported: true,
            docs: [
                `Provides configuration for ${pascalClientName} API client`,
                "",
                "@example",
                "```typescript",
                `// In your app.config.ts`,
                `import { provide${pascalClientName} } from './api/providers';`,
                `import { AuthInterceptor } from './interceptors/auth.interceptor';`,
                "",
                "export const appConfig: ApplicationConfig = {",
                "  providers: [",
                `    provide${pascalClientName}({`,
                "      basePath: 'https://api.example.com',",
                "      interceptors: [AuthInterceptor]",
                "    }),",
                "    // other providers...",
                "  ]",
                "};",
                "```"
            ],
            parameters: [
                {
                    name: "config",
                    type: `${pascalClientName}Config`
                }
            ],
            returnType: "EnvironmentProviders",
            statements: functionBody
        });
    }

    private pascalCase(str: string): string {
        return str.replace(/(?:^|[-_])([a-z])/g, (_, char) => char.toUpperCase());
    }
}