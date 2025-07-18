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
                namedImports: [
                    "EnvironmentProviders",
                    "Provider",
                    "makeEnvironmentProviders",
                    "Type",
                    "Injector",
                    "InjectionToken"
                ],
                moduleSpecifier: "@angular/core",
            },
            {
                namedImports: [
                    "HttpClient",
                    "HttpInterceptor",
                    "HttpHandler",
                    "HttpBackend",
                    "HTTP_INTERCEPTORS"
                ],
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

        // Create client-specific interceptor token
        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: "const" as any,
            declarations: [
                {
                    name: `${upperCaseClientName}_INTERCEPTORS`,
                    initializer: `new InjectionToken<HttpInterceptor[]>('${upperCaseClientName}_INTERCEPTORS')`,
                },
            ],
            leadingTrivia: `/**\n * Interceptor token for ${clientName} client\n */\n`,
        });

        // Add simpler provider function
        this.addSimpleProviderFunction(sourceFile, pascalClientName, upperCaseClientName);

        sourceFile.saveSync();
    }

    private addSimpleProviderFunction(sourceFile: any, pascalClientName: string, upperCaseClientName: string): void {
        const hasDateInterceptor = this.config.options.dateType === "Date";

        const functionBody = `
const providers: Provider[] = [
    // Base path token
    {
        provide: ${upperCaseClientName}_BASE_PATH,
        useValue: config.basePath
    },
    
    // Collect interceptors for this client
    {
        provide: ${upperCaseClientName}_INTERCEPTORS,
        useFactory: (injector: Injector) => {
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
            
            return interceptorInstances;
        },
        deps: [Injector]
    },
    
    // Create HTTP client with interceptors
    {
        provide: ${upperCaseClientName}_HTTP_CLIENT,
        useFactory: (backend: HttpBackend, interceptors: HttpInterceptor[]) => {
            if (!interceptors.length) {
                return new HttpClient(backend);
            }
            
            // Create handler chain
            let handler = backend;
            for (let i = interceptors.length - 1; i >= 0; i--) {
                const interceptor = interceptors[i];
                const currentHandler = handler;
                handler = {
                    handle: req => interceptor.intercept(req, currentHandler)
                };
            }
            
            return new HttpClient(handler);
        },
        deps: [HttpBackend, ${upperCaseClientName}_INTERCEPTORS]
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