import { beforeEach, describe, expect, it } from "vitest";

import { Project } from "ts-morph";

import { GeneratorConfig, SwaggerParser, SwaggerSpec } from "@ng-openapi/shared";

import { AuthInterceptorGenerator } from "../../src/lib/generators/utility/auth-interceptor.generator";
import { securitySpecObj } from "./specs/test.specs";

/**
 * Creates a minimal OpenAPI/Swagger spec object for testing.
 * @param securitySchemes The security schemes or definitions object.
 * @param isOAS3 Whether to generate an OpenAPI 3 spec (true) or a Swagger 2 spec (false).
 * @returns A minimal spec object.
 */
const createSpec = (securitySchemes: {}, isOAS3 = true): SwaggerSpec => {
    if (isOAS3) {
        return {
            openapi: "3.0.0",
            info: securitySpecObj.info,
            paths: securitySpecObj.paths,
            components: {
                securitySchemes: securitySchemes,
            },
        };
    } else {
        return {
            swagger: "2.0",
            info: securitySpecObj.info,
            paths: securitySpecObj.paths,
            securityDefinitions: securitySchemes,
        };
    }
};

describe("AuthInterceptorGenerator", () => {
    let project: Project;
    const outputDir = "/output";
    const config = {} as GeneratorConfig;

    beforeEach(() => {
        // Use an in-memory file system for all tests to avoid side effects
        project = new Project({ useInMemoryFileSystem: true });
    });

    it("should not generate an interceptor if no security schemes are defined", () => {
        const spec = createSpec({});
        const parser = new SwaggerParser(spec, config);
        const generator = new AuthInterceptorGenerator(parser, project);

        generator.generate(outputDir);

        const interceptorFile = project.getSourceFile(
            `${outputDir}/auth/auth.interceptor.ts`
        );
        expect(interceptorFile).toBeUndefined();
    });

    it("should generate an interceptor for an API key in the header", () => {
        const spec = createSpec({
            ApiKeyAuth: { type: "apiKey", in: "header", name: "X-API-KEY" },
        });
        const parser = new SwaggerParser(spec, config);
        const generator = new AuthInterceptorGenerator(parser, project);

        generator.generate(outputDir);

        const interceptorFile = project.getSourceFileOrThrow(
            `${outputDir}/auth/auth.interceptor.ts`
        );
        const content = interceptorFile.getFullText();

        expect(content).toContain("class AuthInterceptor");
        expect(content).toContain("implements HttpInterceptor");
        expect(content).toContain("inject(API_KEY_TOKEN, { optional: true })");
        expect(content).toContain("if (this.apiKey)");
        expect(content).toContain(
            "authReq = authReq.clone({ setHeaders: { 'X-API-KEY': this.apiKey } });"
        );
    });

    it("should generate an interceptor for an API key in the query string", () => {
        const spec = createSpec({
            ApiKeyQuery: { type: "apiKey", in: "query", name: "api_key" },
        });
        const parser = new SwaggerParser(spec, config);
        const generator = new AuthInterceptorGenerator(parser, project);

        generator.generate(outputDir);

        const interceptorFile = project.getSourceFileOrThrow(
            `${outputDir}/auth/auth.interceptor.ts`
        );
        const content = interceptorFile.getFullText();

        expect(content).toContain("if (this.apiKey)");
        expect(content).toContain(
            "authReq = authReq.clone({ setParams: { 'api_key': this.apiKey } });"
        );
    });

    it("should generate an interceptor for a Bearer token", () => {
        const spec = createSpec({
            BearerAuth: { type: "http", scheme: "bearer" },
        });
        const parser = new SwaggerParser(spec, config);
        const generator = new AuthInterceptorGenerator(parser, project);

        generator.generate(outputDir);

        const interceptorFile = project.getSourceFileOrThrow(
            `${outputDir}/auth/auth.interceptor.ts`
        );
        const content = interceptorFile.getFullText();

        expect(content).toContain(
            "inject(BEARER_TOKEN_TOKEN, { optional: true })"
        );
        expect(content).toContain("if (this.bearerToken)");
        // Check for the logic that handles both a static string and a function
        expect(content).toContain(
            "const token = typeof this.bearerToken === 'function' ? this.bearerToken() : this.bearerToken;"
        );
        const Authorization = '`Bearer ${token}`';
        expect(content).toContain(
            `authReq = authReq.clone({ setHeaders: { 'Authorization': ${Authorization} } });`
        );
    });

    it("should generate an interceptor for an OAuth2 flow", () => {
        const spec = createSpec({
            OAuth2Auth: {
                type: "oauth2",
                flows: {
                    implicit: {
                        authorizationUrl: "https://example.com/api/oauth/dialog",
                        scopes: {
                            "write:pets": "modify pets in your account",
                            "read:pets": "read your pets",
                        },
                    },
                },
            },
        });
        const parser = new SwaggerParser(spec, config);
        const generator = new AuthInterceptorGenerator(parser, project);

        generator.generate(outputDir);

        const interceptorFile = project.getSourceFileOrThrow(
            `${outputDir}/auth/auth.interceptor.ts`
        );
        const content = interceptorFile.getFullText();

        expect(content).toContain(
            "inject(BEARER_TOKEN_TOKEN, { optional: true })"
        );
        expect(content).toContain("if (this.bearerToken)");
        expect(content).toContain(
            "const token = typeof this.bearerToken === 'function' ? this.bearerToken() : this.bearerToken;"
        );
        const Authorization = '`Bearer ${token}`';
        expect(content).toContain(
            `authReq = authReq.clone({ setHeaders: { 'Authorization': ${Authorization} } });`
        );
    });

    it("should generate an interceptor with `else if` for multiple security schemes", () => {
        const spec = createSpec({
            ApiKeyAuth: { type: "apiKey", in: "header", name: "X-API-KEY" },
            BearerAuth: { type: "http", scheme: "bearer" },
        });
        const parser = new SwaggerParser(spec, config);
        const generator = new AuthInterceptorGenerator(parser, project);

        generator.generate(outputDir);

        const interceptorFile = project.getSourceFileOrThrow(
            `${outputDir}/auth/auth.interceptor.ts`
        );
        const method = interceptorFile

            .getClassOrThrow("AuthInterceptor")

            .getMethodOrThrow("intercept");
        const statements = method.getBodyText();

        // Check for the precise `if... else if...` structure created by `.join(' else ')`
        expect(statements).toContain("if (this.apiKey)");
        expect(statements).toContain(
            "clone({ setHeaders: { 'X-API-KEY': this.apiKey } })"
        );
        expect(statements).toContain("} else if (this.bearerToken)");
        expect(statements).toContain(
            "clone({ setHeaders: { 'Authorization': `Bearer ${token}` } })"
        );
    });

    it("should correctly generate from Swagger 2.0 `securityDefinitions`", () => {
        const spec = createSpec(
            {
                ApiKeyAuth: { type: "apiKey", in: "header", name: "X-API-KEY" },
            },
            false // Generate a Swagger 2.0 spec
        );
        const parser = new SwaggerParser(spec, config);
        const generator = new AuthInterceptorGenerator(parser, project);

        generator.generate(outputDir);

        const interceptorFile = project.getSourceFileOrThrow(
            `${outputDir}/auth/auth.interceptor.ts`
        );
        const content = interceptorFile.getFullText();

        expect(content).not.toBeUndefined();
        expect(content).toContain("if (this.apiKey)");
        expect(content).toContain(
            "authReq = authReq.clone({ setHeaders: { 'X-API-KEY': this.apiKey } });"
        );
    });
});
