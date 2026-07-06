import { OptionalKind, Project, PropertySignatureStructure, SourceFile } from "ts-morph";
import * as path from "path";
import {
    GeneratorConfig,
    getBaseInterceptorClassName,
    getBasePathTokenName,
    getClientInterceptorFnName,
    getInterceptorFnsTokenName,
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
        const interceptorFnsTokenName = getInterceptorFnsTokenName(this.clientName);
        const baseInterceptorClassName = getBaseInterceptorClassName(this.clientName);

        // Add imports
        sourceFile.addImportDeclarations([
            {
                namedImports: ["EnvironmentProviders", "Provider", "inject", "makeEnvironmentProviders"],
                moduleSpecifier: "@angular/core",
            },
            {
                namedImports: ["HTTP_INTERCEPTORS", "HttpInterceptor", "HttpInterceptorFn"],
                moduleSpecifier: "@angular/common/http",
            },
            {
                namedImports: [basePathTokenName, interceptorFnsTokenName],
                moduleSpecifier: "./tokens",
            },
            {
                namedImports: [baseInterceptorClassName],
                moduleSpecifier: "./utils/base-interceptor",
            },
        ]);

        // Add conditional import for the date interceptor factory
        if (this.config.options.dateType === "Date") {
            sourceFile.addImportDeclaration({
                namedImports: ["dateInterceptorWithRegex"],
                moduleSpecifier: "./utils/date-transformer",
            });
        }

        // Add config interface
        const configProperties: OptionalKind<PropertySignatureStructure>[] = [
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
                type: "(new (...args: any[]) => HttpInterceptor)[]",
                hasQuestionToken: true,
                docs: [
                    "Class-based HTTP interceptors to apply to this client.",
                    "Classes are resolved through DI when provided, otherwise instantiated directly.",
                ],
            },
            {
                name: "interceptorFns",
                type: "HttpInterceptorFn[]",
                hasQuestionToken: true,
                docs: ["Functional HTTP interceptors to apply to this client. Run after class-based interceptors."],
            },
            {
                name: "registerDiInterceptor",
                type: "boolean",
                hasQuestionToken: true,
                docs: [
                    "Register the class-based interceptor on HTTP_INTERCEPTORS (default: true).",
                    "Set to false when your app needs withInterceptorsFromDi() for its own",
                    "interceptors but this client's chain is registered functionally via",
                    "withInterceptors([...]) — otherwise the chain would run twice.",
                ],
            },
        ];

        if (this.config.options.dateType === "Date") {
            configProperties.push({
                name: "dateTransformRegex",
                type: "RegExp",
                hasQuestionToken: true,
                docs: [
                    "Override the pattern used to detect ISO date strings during date transformation.",
                    "Defaults to the generated ISO_DATE_REGEX.",
                ],
            });
        }

        sourceFile.addInterface({
            name: `${this.capitalizeFirst(this.clientName)}Config`,
            isExported: true,
            docs: [`Configuration options for ${this.clientName} client`],
            properties: configProperties,
        });

        // Add main provider function
        this.addMainProviderFunction(sourceFile, basePathTokenName, interceptorFnsTokenName, baseInterceptorClassName);

        sourceFile.formatText();
        sourceFile.saveSync();
    }

    private addMainProviderFunction(
        sourceFile: SourceFile,
        basePathTokenName: string,
        interceptorFnsTokenName: string,
        baseInterceptorClassName: string,
    ): void {
        const hasDateInterceptor = this.config.options.dateType === "Date";
        const functionName = `provide${this.capitalizeFirst(this.clientName)}Client`;
        const configTypeName = `${this.capitalizeFirst(this.clientName)}Config`;
        const interceptorFnName = getClientInterceptorFnName(this.clientName);

        const dateInterceptorBlock = hasDateInterceptor
            ? `
            // Date interceptor first: it runs first on requests (a no-op) and, being
            // outermost, its response transform applies last — the other client
            // interceptors see the raw body; only the service sees Date instances
            if (config.enableDateTransform !== false) {
                interceptorFns.push(dateInterceptorWithRegex(config.dateTransformRegex));
            }
`
            : `
            // Date transformation not available (dateType: 'string' was used in generation)
`;

        const functionBody = `
const providers: Provider[] = [
    // Base path token for this client
    {
        provide: ${basePathTokenName},
        useValue: config.basePath
    },
    // This client's interceptor chain, normalized to functional interceptors
    {
        provide: ${interceptorFnsTokenName},
        useFactory: (): HttpInterceptorFn[] => {
            const interceptorFns: HttpInterceptorFn[] = [];
${dateInterceptorBlock}
            // Class-based interceptors are resolved through DI when provided,
            // otherwise instantiated directly, and adapted to functional form
            for (const interceptorClass of config.interceptors ?? []) {
                const instance = inject(interceptorClass, { optional: true }) ?? new interceptorClass();
                interceptorFns.push((req, next) => instance.intercept(req, { handle: next }));
            }

            interceptorFns.push(...(config.interceptorFns ?? []));

            return interceptorFns;
        }
    }
];

// Class-based registration of the scoped chain; only active together with
// withInterceptorsFromDi(). Disable it (registerDiInterceptor: false) when the
// app uses withInterceptorsFromDi() for its own interceptors but this client's
// chain is registered via withInterceptors([${interceptorFnName}]) —
// otherwise the chain would run twice.
if (config.registerDiInterceptor !== false) {
    providers.push({
        provide: HTTP_INTERCEPTORS,
        useClass: ${baseInterceptorClassName},
        multi: true
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
                "import { provideHttpClient, withInterceptors } from '@angular/common/http';",
                `import { ${functionName} } from './api/providers';`,
                `import { ${interceptorFnName} } from './api/utils/base-interceptor';`,
                "",
                "export const appConfig: ApplicationConfig = {",
                "  providers: [",
                `    provideHttpClient(withInterceptors([${interceptorFnName}])),`,
                `    ${functionName}({`,
                "      basePath: 'https://api.example.com',",
                "      interceptors: [AuthInterceptor], // Classes, not instances",
                "      interceptorFns: [loggingInterceptor] // Functional interceptors",
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
