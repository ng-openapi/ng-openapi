// packages/ng-openapi/src/lib/generators/utility/provider.generator.ts

import { Project } from "ts-morph";
import * as path from "path";
import {
    GeneratorConfig,
    getBasePathTokenName,
    getInterceptorsTokenName,
    PROVIDER_GENERATOR_HEADER_COMMENT,
    SwaggerParser,
    SwaggerSpec,
} from "@ng-openapi/shared";

export class ProviderGenerator {
    private project: Project;
    private config: GeneratorConfig;
    private spec: SwaggerSpec;
    private clientName: string;

    constructor(project: Project, config: GeneratorConfig, parser: SwaggerParser) { // Modified constructor
        this.project = project;
        this.config = config;
        this.spec = parser.getSpec(); // Store the spec
        this.clientName = config.clientName || "default";
    }

    generate(outputDir: string): void {
        const filePath = path.join(outputDir, "providers.ts");
        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        sourceFile.insertText(0, PROVIDER_GENERATOR_HEADER_COMMENT);

        const basePathTokenName = getBasePathTokenName(this.clientName);
        const interceptorsTokenName = getInterceptorsTokenName(this.clientName);
        const baseInterceptorClassName = `${this.capitalizeFirst(this.clientName)}BaseInterceptor`;

        // Check for security schemes
        const securitySchemes = this.spec.components?.securitySchemes ?? (this.spec as any).securityDefinitions;
        const hasSecurity = securitySchemes && Object.keys(securitySchemes).length > 0;
        const hasApiKey = hasSecurity && Object.values(securitySchemes).some(s => s.type === 'apiKey');
        // Treat 'oauth2' as a type of bearer token for configuration purposes.
        const hasBearer = hasSecurity && Object.values(securitySchemes).some(s => (s.type === 'http' && s.scheme === 'bearer') || s.type === 'oauth2');

        // Add imports
        sourceFile.addImportDeclarations([
            { namedImports: ["EnvironmentProviders", "Provider", "makeEnvironmentProviders"], moduleSpecifier: "@angular/core" },
            { namedImports: ["HTTP_INTERCEPTORS", "HttpInterceptor"], moduleSpecifier: "@angular/common/http" },
            { namedImports: [basePathTokenName, interceptorsTokenName], moduleSpecifier: "./tokens" },
            { namedImports: [baseInterceptorClassName], moduleSpecifier: "./utils/base-interceptor" },
        ]);

        if (this.config.options.dateType === "Date") {
            sourceFile.addImportDeclaration({ namedImports: ["DateInterceptor"], moduleSpecifier: "./utils/date-transformer" });
        }
        if (hasSecurity) {
            sourceFile.addImportDeclaration({ namedImports: ["AuthInterceptor"], moduleSpecifier: "./auth/auth.interceptor" });
            if (hasApiKey) sourceFile.addImportDeclaration({ namedImports: ["API_KEY_TOKEN"], moduleSpecifier: "./auth/auth.tokens" });
            if (hasBearer) sourceFile.addImportDeclaration({ namedImports: ["BEARER_TOKEN_TOKEN"], moduleSpecifier: "./auth/auth.tokens" });
        }

        // Add config interface
        const configInterface = sourceFile.addInterface({
            name: `${this.capitalizeFirst(this.clientName)}Config`,
            isExported: true,
            properties: [
                { name: "basePath", type: "string" },
                { name: "enableDateTransform", type: "boolean", hasQuestionToken: true },
                { name: "interceptors", type: "(new (...args: any[]) => HttpInterceptor)[]", hasQuestionToken: true },
            ],
        });
        if (hasApiKey) configInterface.addProperty({ name: "apiKey", type: "string", hasQuestionToken: true });
        if (hasBearer) configInterface.addProperty({ name: "bearerToken", type: "string | (() => string)", hasQuestionToken: true });

        // Add main provider function
        this.addMainProviderFunction(sourceFile, basePathTokenName, interceptorsTokenName, baseInterceptorClassName, hasSecurity, hasApiKey, hasBearer);

        sourceFile.formatText();
        sourceFile.saveSync();
    }

    private addMainProviderFunction(sourceFile: any, basePathTokenName: string, interceptorsTokenName: string, baseInterceptorClassName: string, hasSecurity: boolean, hasApiKey: boolean, hasBearer: boolean): void {
        const functionName = `provide${this.capitalizeFirst(this.clientName)}Client`;
        const configTypeName = `${this.capitalizeFirst(this.clientName)}Config`;

        let securityProviders = '';
        if (hasSecurity) {
            securityProviders += `
    // Provide the AuthInterceptor
    providers.push({ 
        provide: HTTP_INTERCEPTORS, 
        useClass: AuthInterceptor, 
        multi: true
    }); 
`;
            if (hasApiKey) {
                securityProviders += `
    // Provide the API key if present
    if (config.apiKey) { 
        providers.push({ provide: API_KEY_TOKEN, useValue: config.apiKey }); 
    } 
`;
            }
            // This condition now correctly includes oauth2
            if (hasBearer) {
                securityProviders += `
    // Provide the Bearer/OAuth2 token if present
    if (config.bearerToken) { 
        providers.push({ provide: BEARER_TOKEN_TOKEN, useValue: config.bearerToken }); 
    } 
`;
            }
        }

        const functionBody = `
const providers: Provider[] = [ 
    { provide: ${basePathTokenName}, useValue: config.basePath }, 
    { provide: HTTP_INTERCEPTORS, useClass: ${baseInterceptorClassName}, multi: true } 
]; 

${securityProviders} 

const customInterceptors = config.interceptors?.map(InterceptorClass => new InterceptorClass()) || []; 

if (config.enableDateTransform !== false && ${this.config.options.dateType === "Date"}) { 
    customInterceptors.unshift(new DateInterceptor()); 
} 

providers.push({ 
    provide: ${interceptorsTokenName}, 
    useValue: customInterceptors
}); 

return makeEnvironmentProviders(providers);`;

        sourceFile.addFunction({
            name: functionName,
            isExported: true,
            parameters: [{ name: "config", type: configTypeName }],
            returnType: "EnvironmentProviders",
            statements: functionBody
        });
    }

    private capitalizeFirst(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}
