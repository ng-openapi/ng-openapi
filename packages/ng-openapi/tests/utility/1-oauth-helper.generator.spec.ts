import { describe, it, expect, beforeAll } from 'vitest';
import { Project } from 'ts-morph';
import { GeneratorConfig, SwaggerParser, SwaggerSpec } from '@ng-openapi/shared';
import { ProviderGenerator } from '../../src/lib/generators/utility/provider.generator';

// A minimal spec with a full OAuth2 Authorization Code flow
const createOAuthSpec = (): SwaggerSpec => ({
    openapi: '3.0.0',
    info: { title: 'OAuth API', version: '1.0' },
    paths: {
        '/protected': {
            get: {
                security: [{ OAuth2Auth: ['read:pets'] }],
                responses: { '200': { description: 'OK' } }
            }
        }
    },
    components: {
        securitySchemes: {
            OAuth2Auth: {
                type: 'oauth2',
                flows: {
                    authorizationCode: {
                        authorizationUrl: 'https://example.com/oauth/authorize',
                        tokenUrl: 'https://example.com/oauth/token',
                        scopes: {
                            'read:pets': 'read your pets',
                            'write:pets': 'modify pets in your account'
                        }
                    }
                }
            }
        }
    }
});

describe('Utility: OAuth Helper Generation', () => {
    let project: Project;
    const outputDir = '/output';
    const config: GeneratorConfig = {
        input: 'spec.json',
        output: outputDir,
        options: { dateType: 'string', enumStyle: 'enum' }
    };

    beforeAll(() => {
        project = new Project({ useInMemoryFileSystem: true });
        const spec = createOAuthSpec();
        const parser = new SwaggerParser(spec, config);
        // The ProviderGenerator will internally trigger the AuthHelperGenerator
        const generator = new ProviderGenerator(project, config, parser);
        generator.generate(outputDir);
    });

    it('should generate an AuthHelperService', () => {
        const helperFile = project.getSourceFile(`${outputDir}/auth/auth-helper.service.ts`);
        expect(helperFile).toBeDefined();

        const classDecl = helperFile!.getClass('AuthHelperService');
        expect(classDecl).toBeDefined();
        expect(classDecl!.getMethods().map(m => m.getName())).toEqual(
            expect.arrayContaining(['configure', 'login', 'logout', 'getAccessToken'])
        );
    });

    it('should generate a provide...WithOAuth function with pre-filled config', () => {
        const providerFile = project.getSourceFileOrThrow(`${outputDir}/providers.ts`);
        const oauthProviderFn = providerFile.getFunction('provideDefaultClientWithOAuth');

        expect(oauthProviderFn).toBeDefined();

        const fnBody = oauthProviderFn!.getBodyText();
        expect(fnBody).toContain(`issuer: 'https://example.com'`);
        expect(fnBody).toContain(`tokenEndpoint: 'https://example.com/oauth/token'`);
        expect(fnBody).toContain(`scope: 'read:pets write:pets'`);
    });

    it('should create a dedicated config interface for the OAuth provider', () => {
        const providerFile = project.getSourceFileOrThrow(`${outputDir}/providers.ts`);
        const configInterface = providerFile.getInterface('DefaultClientOAuthConfg');
        expect(configInterface).toBeDefined();
        expect(configInterface!.getProperties().map(p => p.getName())).toEqual(
            ['clientId', 'redirectUri', 'authConfig']
        );
    });

    it('should update the main provider to use AuthHelperService for the bearer token', () => {
        const providerFile = project.getSourceFileOrThrow(`${outputDir}/providers.ts`);
        const mainProviderFn = providerFile.getFunctionOrThrow('provideDefaultClient');
        const fnBody = mainProviderFn.getBodyText();

        expect(fnBody).toContain('provide: BEARER_TOKEN_TOKEN');
        expect(fnBody).toContain('useFactory: (authHelper: AuthHelperService) => authHelper.getAccessToken.bind(authHelper)');
        expect(fnBody).toContain('deps: [forwardRef(() => AuthHelperService)]');

        // It should NOT contain the manual bearerToken provider logic anymore
        expect(fnBody).not.toContain('if (config.bearerToken)');
    });
});
