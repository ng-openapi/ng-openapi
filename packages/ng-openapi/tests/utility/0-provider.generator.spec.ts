import { beforeEach, describe, expect, it } from "vitest";
import { Project } from "ts-morph";
import { GeneratorConfig, SwaggerParser, SwaggerSpec } from "@ng-openapi/shared";
import { ProviderGenerator } from "../../src/lib/generators/utility/provider.generator";
import { securitySpecObj } from "../admin/specs/test.specs";

// Helper to create a spec for testing providers
const createProviderTestSpec = (securitySchemes: {}): SwaggerSpec => ({
    openapi: "3.0.0",
    info: securitySpecObj.info,
    paths: securitySpecObj.paths,
    components: {
        securitySchemes: securitySchemes,
    },
});

describe("Utility: ProviderGenerator", () => {
    let project: Project;
    const outputDir = "/output";
    const config: GeneratorConfig = {
        input: '',
        output: outputDir,
        options: { dateType: 'string', enumStyle: 'enum' }
    };

    beforeEach(() => {
        project = new Project({ useInMemoryFileSystem: true });
    });

    // Renamed and corrected the test's expectation.
    it("should NOT add bearerToken to the simple config interface when OAuth2 is used", () => {
        const spec = createProviderTestSpec({
            OAuth2Auth: {
                type: "oauth2",
                flows: {
                    authorizationCode: {
                        authorizationUrl: "https://example.com/oauth/authorize",
                        tokenUrl: "https://example.com/oauth/token",
                        scopes: { 'read:pets': 'read your pets' }
                    }
                }
            }
        });

        const parser = new SwaggerParser(spec, config);
        const generator = new ProviderGenerator(project, config, parser);

        generator.generate(outputDir);

        const providerFile = project.getSourceFileOrThrow(`${outputDir}/providers.ts`);
        const configInterface = providerFile.getInterfaceOrThrow("DefaultConfig");
        const bearerTokenProp = configInterface.getProperty("bearerToken");

        // The bearerToken property should NOT be on the simple config interface,
        // as the dedicated provide...WithOAuth function should be used instead.
        expect(bearerTokenProp).toBeUndefined();
    });

    it("should add bearerToken to config interface for Bearer scheme", () => {
        const spec = createProviderTestSpec({
            BearerAuth: { type: "http", scheme: "bearer" },
        });

        const parser = new SwaggerParser(spec, config);
        const generator = new ProviderGenerator(project, config, parser);

        generator.generate(outputDir);

        const providerFile = project.getSourceFileOrThrow(`${outputDir}/providers.ts`);
        const configInterface = providerFile.getInterfaceOrThrow("DefaultConfig");
        const bearerTokenProp = configInterface.getProperty("bearerToken");

        expect(bearerTokenProp).toBeDefined();
        expect(bearerTokenProp?.hasQuestionToken()).toBe(true);
        expect(bearerTokenProp?.getType().getNonNullableType().getText()).toBe("string | (() => string)");
    });

    it("should NOT add bearerToken to config interface for only apiKey scheme", () => {
        const spec = createProviderTestSpec({
            ApiKeyAuth: { type: "apiKey", in: "header", name: "X-API-KEY" },
        });

        const parser = new SwaggerParser(spec, config);
        const generator = new ProviderGenerator(project, config, parser);

        generator.generate(outputDir);

        const providerFile = project.getSourceFileOrThrow(`${outputDir}/providers.ts`);
        const configInterface = providerFile.getInterfaceOrThrow("DefaultConfig");
        const bearerTokenProp = configInterface.getProperty("bearerToken");

        expect(bearerTokenProp).toBeUndefined();
    });
});
