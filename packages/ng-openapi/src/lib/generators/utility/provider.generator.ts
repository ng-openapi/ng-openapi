import { Project, SourceFile } from "ts-morph";
import * as path from "path";
import {
    GeneratorConfig,
    getBasePathTokenName,
    getInterceptorsTokenName,
    PROVIDER_GENERATOR_HEADER_COMMENT,
    SecurityScheme,
    SwaggerParser,
} from "@ng-openapi/shared";
import { AuthHelperGenerator } from "./auth-helper.generator";

interface OAuthFlow {
    authorizationUrl?: string;
    tokenUrl?: string;
    scopes?: Record<string, string>;
}

export class ProviderGenerator {
    private project: Project;
    private config: GeneratorConfig;
    private parser: SwaggerParser;
    private clientName: string;

    constructor(project: Project, config: GeneratorConfig, parser: SwaggerParser) {
        this.project = project;
        this.config = config;
        this.parser = parser;
        this.clientName = config.clientName || "default";
    }

    generate(outputDir: string): void {
        const filePath = path.join(outputDir, "providers.ts");
        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        sourceFile.insertText(0, PROVIDER_GENERATOR_HEADER_COMMENT);

        const basePathTokenName = getBasePathTokenName(this.clientName);
        const interceptorsTokenName = getInterceptorsTokenName(this.clientName);
        const baseInterceptorClassName = `${this.capitalizeFirst(this.clientName)}BaseInterceptor`;

        const securitySchemes = this.parser.getSecuritySchemes();
        const schemes = Object.values(securitySchemes);
        const hasSecurity = schemes.length > 0;
        const hasApiKey = hasSecurity && schemes.some(s => s.type === 'apiKey');
        const hasBearer = hasSecurity && schemes.some(s => (s.type === 'http' && s.scheme === 'bearer') || s.type === 'oauth2');
        const oauthScheme = hasSecurity ? schemes.find((s): s is SecurityScheme & { type: 'oauth2'; flows: Record<string, OAuthFlow> } => s.type === 'oauth2') : undefined;

        // Add base imports
        sourceFile.addImportDeclarations([
            { namedImports: ["EnvironmentProviders", "Provider", "makeEnvironmentProviders"], moduleSpecifier: "@angular/core" },
            { namedImports: ["HTTP_INTERCEPTORS", "HttpInterceptor"], moduleSpecifier: "@angular/common/http" },
            { namedImports: [basePathTokenName, interceptorsTokenName], moduleSpecifier: "./tokens" },
            { namedImports: [baseInterceptorClassName], moduleSpecifier: "./utils/base-interceptor" },
        ]);

        if (this.config.options.dateType === "Date") {
            sourceFile.addImportDeclaration({ namedImports: ["DateInterceptor"], moduleSpecifier: "./utils/date-transformer" });
        }

        if (hasSecurity && !oauthScheme) { // Auth imports for non-oauth setups
            sourceFile.addImportDeclaration({ namedImports: ["AuthInterceptor"], moduleSpecifier: "./auth/auth.interceptor" });
            if (hasApiKey) sourceFile.addImportDeclaration({ namedImports: ["API_KEY_TOKEN"], moduleSpecifier: "./auth/auth.tokens" });
            if (hasBearer) sourceFile.addImportDeclaration({ namedImports: ["BEARER_TOKEN_TOKEN"], moduleSpecifier: "./auth/auth.tokens" });
        }

        if (oauthScheme) {
            sourceFile.addImportDeclarations([
                { namedImports: ["provideHttpClient", "withInterceptorsFromDi"], moduleSpecifier: "@angular/common/http" },
                { namedImports: ["AuthConfig", "OAuthService"], moduleSpecifier: "angular-oauth2-oidc" },
                { namedImports: ["AuthHelperService"], moduleSpecifier: "./auth/auth-helper.service" },
                { namedImports: ["APP_INITIALIZER", "forwardRef"], moduleSpecifier: "@angular/core" },
                { namedImports: ["AuthInterceptor"], moduleSpecifier: "./auth/auth.interceptor" },
                { namedImports: ["BEARER_TOKEN_TOKEN"], moduleSpecifier: "./auth/auth.tokens" },
            ]);
        }

        // Add config interface
        const configInterface = sourceFile.addInterface({
            name: `${this.capitalizeFirst(this.clientName)}Config`,
            isExported: true,
            properties: [
                { name: "basePath", type: "string" },
                { name: "enableDateTransform", type: "boolean", hasQuestionToken: true },
                { name: "interceptors", type: `(new (...args: never[]) => HttpInterceptor)[]`, hasQuestionToken: true },
            ],
        });
        if (hasApiKey) configInterface.addProperty({ name: "apiKey", type: "string", hasQuestionToken: true });
        if (hasBearer && !oauthScheme) configInterface.addProperty({ name: "bearerToken", type: "string | (() => string)", hasQuestionToken: true });

        // Add main provider function
        this.addMainProviderFunction(sourceFile, basePathTokenName, interceptorsTokenName, baseInterceptorClassName, hasSecurity, hasApiKey, hasBearer, !!oauthScheme);

        // Add dedicated OAuth provider function if scheme is present
        if (oauthScheme) {
            new AuthHelperGenerator(this.project).generate(outputDir);
            this.addOAuthProviderFunction(sourceFile, oauthScheme);
        }

        sourceFile.formatText();
        sourceFile.saveSync();
    }

    private addMainProviderFunction(sourceFile: SourceFile, basePathTokenName: string, interceptorsTokenName: string, baseInterceptorClassName: string, hasSecurity: boolean, hasApiKey: boolean, hasBearer: boolean, hasOAuth: boolean): void {
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

            if (hasBearer && hasOAuth) {
                securityProviders += `
    // Provide the Bearer/OAuth2 token via the AuthHelperService
    providers.push({
        provide: BEARER_TOKEN_TOKEN,
        useFactory: (authHelper: AuthHelperService) => authHelper.getAccessToken.bind(authHelper),
        deps: [forwardRef(() => AuthHelperService)]
    });
`;
            } else if (hasBearer) {
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

    private addOAuthProviderFunction(sourceFile: SourceFile, oauthScheme: SecurityScheme & { type: 'oauth2'; flows?: Record<string, OAuthFlow> }): void {
        const functionName = `provide${this.capitalizeFirst(this.clientName)}ClientWithOAuth`;
        const configTypeName = `${this.capitalizeFirst(this.clientName)}ClientOAuthConfg`;

        const flow: OAuthFlow | undefined = oauthScheme.flows?.authorizationCode || oauthScheme.flows?.implicit || Object.values(oauthScheme.flows ?? {})[0];

        if (!flow) {
            console.warn(`[Generator] Skipping OAuth provider generation for ${this.clientName}: No recognizable flow found.`);
            return;
        }

        const scopes = flow.scopes ? Object.keys(flow.scopes).join(' ') : '';
        const issuer = flow.authorizationUrl ? `'${new URL(flow.authorizationUrl).origin}'` : `'' // TODO: Add issuer URL`;

        sourceFile.addInterface({
            name: configTypeName,
            isExported: true,
            properties: [
                { name: "clientId", type: "string" },
                { name: "redirectUri", type: "string" },
                { name: "authConfig", type: "Partial<AuthConfig>", hasQuestionToken: true }
            ],
        });

        const functionBody = `
const defaultConfig: AuthConfig = {
    issuer: ${issuer},
    tokenEndpoint: ${flow.tokenUrl ? `'${flow.tokenUrl}'` : 'undefined'},
    redirectUri: config.redirectUri,
    clientId: config.clientId,
    responseType: 'code',
    scope: '${scopes}',
    showDebugInformation: false, // Set to true for debugging
};

const authConfig: AuthConfig = { ...defaultConfig, ...config.authConfig };

return makeEnvironmentProviders([
    provideHttpClient(withInterceptorsFromDi()),
    { provide: AuthConfig, useValue: authConfig },
    OAuthService,
    AuthHelperService,
    {
        provide: APP_INITIALIZER,
        useFactory: (authHelper: AuthHelperService) => () => authHelper.configure(),
        deps: [AuthHelperService],
        multi: true
    }
]);`;

        sourceFile.addFunction({
            name: functionName,
            isExported: true,
            parameters: [{ name: "config", type: configTypeName }],
            returnType: "EnvironmentProviders",
            statements: functionBody,
            docs: ["Provides the necessary services for OAuth2/OIDC authentication using angular-oauth2-oidc."]
        });
    }

    private capitalizeFirst(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}
