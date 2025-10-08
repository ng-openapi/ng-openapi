// Use vi from Vitest for mocking
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GeneratorConfig, SwaggerParser } from "@ng-openapi/shared";
import { Project } from "ts-morph";
// Use a relative path to import the class under test
import { AdminGenerator } from "../src/lib/generators/admin/admin.generator";
import * as fs from 'fs'; // Import the 'fs' module to be mocked

// This tells Vitest to intercept any import of the 'fs' module.
// It must be at the top level of the module.
vi.mock('fs');

// Mock OpenAPI document for testing
const mockSpec: any = {
    openapi: '3.0.0',
    info: { title: 'Test API', version: '1.0.0' },
    paths: {
        '/users': {
            get: {
                tags: ['Users'],
                operationId: 'listUsers',
                responses: { '200': { description: 'OK' } }
            },
            post: {
                tags: ['Users'],
                operationId: 'createUser',
                requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
                responses: { '201': { description: 'Created' } }
            }
        },
        '/users/{userId}': {
            get: {
                tags: ['Users'],
                operationId: 'getUserById',
                parameters: [{ name: 'userId', in: 'path', required: true }],
                responses: { '200': { description: 'OK' } }
            },
            put: {
                tags: ['Users'],
                operationId: 'updateUser',
                parameters: [{ name: 'userId', in: 'path', required: true }],
                requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
                responses: { '200': { description: 'OK' } }
            },
            delete: {
                tags: ['Users'],
                operationId: 'deleteUser',
                parameters: [{ name: 'userId', in: 'path', required: true }],
                responses: { '204': { description: 'No Content' } }
            }
        }
    },
    components: {
        schemas: {
            User: {
                type: 'object',
                required: ['username'],
                properties: {
                    id: { type: 'integer', readOnly: true },
                    username: { type: 'string', minLength: 3 },
                    isAdmin: { type: 'boolean' }
                }
            }
        }
    }
};

describe('AdminGenerator', () => {
    let parser: SwaggerParser;
    let project: Project;
    let config: GeneratorConfig;

    beforeEach(async () => {
        vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(mockSpec));
        vi.spyOn(fs, 'existsSync').mockReturnValue(true);

        config = { input: 'mock-spec.json', output: '', options: {} };

        parser = await SwaggerParser.create(config.input, config);

        project = new Project({ useInMemoryFileSystem: true });
    });

    describe('collectResources', () => {
        it('should correctly identify a full CRUD resource', () => {
            const generator = new AdminGenerator(parser, project, config);
            const resources = generator.collectResources();

            expect(resources.length).toBe(1);
            const userResource = resources[0];
            expect(userResource.name).toBe('users');
            expect(userResource.className).toBe('Users');
            expect(userResource.serviceName).toBe('UsersService');
            expect(userResource.modelName).toBe('User');

            expect(userResource.operations.list?.methodName).toBe('listUsers');
            expect(userResource.operations.create?.methodName).toBe('createUser');
            expect(userResource.operations.read?.methodName).toBe('getUserById');
            expect(userResource.operations.read?.idParamName).toBe('userId');
            expect(userResource.operations.update?.methodName).toBe('updateUser');
            expect(userResource.operations.delete?.methodName).toBe('deleteUser');
        });

        it('should generate correct form properties from schema', () => {
            const generator = new AdminGenerator(parser, project, config);
            const resources = generator.collectResources();
            const formProps = resources[0].formProperties;

            expect(formProps.length).toBe(2); // id is readOnly, should be excluded

            const usernameProp = formProps.find(p => p.name === 'username')!;
            expect(usernameProp.required).toBe(true);
            expect(usernameProp.validators).toContain('Validators.required');
            expect(usernameProp.validators).toContain('Validators.minLength(3)');

            const isAdminProp = formProps.find(p => p.name === 'isAdmin')!;
            expect(isAdminProp.type).toBe('boolean');
            expect(isAdminProp.inputType).toBe('checkbox');
        });

        it('should correctly identify list columns', () => {
            const generator = new AdminGenerator(parser, project, config);
            const resources = generator.collectResources();
            const listColumns = resources[0].listColumns;

            expect(listColumns).toEqual(['username', 'isAdmin']);
        });
    });
});
